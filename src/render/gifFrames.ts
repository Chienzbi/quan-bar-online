import { decompressFrames, parseGIF } from 'gifuct-js';
import { Texture } from 'pixi.js';

/** Các frame GIF đã bỏ nền trắng, cắt sát nhân vật; dùng chung cho mọi avatar. */
export interface GifFrames {
  textures: Texture[];
  delays: number[]; // giây
  total: number;
}

// nền = pixel sáng, gần như không có màu (trắng, xám nhạt của bóng đổ)
const BG_MIN = 150; // kênh thấp nhất tối thiểu
const BG_SPREAD = 22; // chênh lệch max-min tối đa
const FRINGE_MIN = 175; // viền răng cưa còn sót sát nền
const FRINGE_SPREAD = 45;

/** Xóa các pixel trắng nối liền với viền ảnh (giữ nguyên màu trắng bên trong nhân vật). */
function removeWhiteBackground(img: ImageData) {
  const { width: w, height: h, data } = img;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const isBg = (i: number) => {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    return data[i * 4 + 3] < 10 || (Math.min(r, g, b) >= BG_MIN && Math.max(r, g, b) - Math.min(r, g, b) <= BG_SPREAD);
  };
  const push = (i: number) => { if (!seen[i] && isBg(i)) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop()!;
    data[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  // bóc 2 lớp viền sáng còn dính quanh nhân vật
  const gone = (i: number) => data[i * 4 + 3] === 0;
  for (let pass = 0; pass < 2; pass++) {
    const kill: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (gone(i)) continue;
      const x = i % w;
      const near = (x > 0 && gone(i - 1)) || (x < w - 1 && gone(i + 1)) || (i >= w && gone(i - w)) || (i < w * (h - 1) && gone(i + w));
      if (!near) continue;
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      if (Math.min(r, g, b) >= FRINGE_MIN && Math.max(r, g, b) - Math.min(r, g, b) <= FRINGE_SPREAD) kill.push(i);
    }
    for (const i of kill) data[i * 4 + 3] = 0;
  }
}

export async function loadGifFrames(url: string): Promise<GifFrames> {
  const buf = await (await fetch(url)).arrayBuffer();
  const gif = parseGIF(buf);
  const frames = decompressFrames(gif, true);
  const W = gif.lsd.width;
  const H = gif.lsd.height;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const patchCanvas = document.createElement('canvas');
  const pctx = patchCanvas.getContext('2d')!;

  const images: ImageData[] = [];
  const delays: number[] = [];
  let minX = W, minY = H, maxX = 0, maxY = 0;
  let restore: ImageData | null = null;

  for (const f of frames) {
    const { left, top, width, height } = f.dims;
    if (f.disposalType === 3) restore = ctx.getImageData(0, 0, W, H);
    patchCanvas.width = width; patchCanvas.height = height;
    pctx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), width, height), 0, 0);
    ctx.drawImage(patchCanvas, left, top);

    // nền trắng được xử lý trên bản sao; canvas gốc giữ nguyên để ghép frame sau
    const img = ctx.getImageData(0, 0, W, H);
    removeWhiteBackground(img);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (img.data[(y * W + x) * 4 + 3] > 20) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    images.push(img);
    delays.push(Math.max(0.04, (f.delay || 10) / 1000));

    if (f.disposalType === 2) ctx.clearRect(left, top, width, height);
    else if (f.disposalType === 3 && restore) ctx.putImageData(restore, 0, 0);
  }

  if (maxX < minX) { minX = 0; minY = 0; maxX = W - 1; maxY = H - 1; }
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const full = document.createElement('canvas');
  full.width = W; full.height = H;
  const fctx = full.getContext('2d')!;
  const textures = images.map((img) => {
    fctx.clearRect(0, 0, W, H);
    fctx.putImageData(img, 0, 0);
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    c.getContext('2d')!.drawImage(full, minX, minY, cw, ch, 0, 0, cw, ch);
    return Texture.from(c);
  });
  return { textures, delays, total: delays.reduce((a, b) => a + b, 0) };
}
