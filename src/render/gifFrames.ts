import { decompressFrames, parseGIF } from 'gifuct-js';
import { Sprite, Texture } from 'pixi.js';

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

/**
 * Cách xử lý nền:
 *  - 'white': xoá nền trắng nối với viền (sticker avatar)
 *  - 'whiteAll': xoá mọi pixel trắng/xám nhạt, kể cả vùng kín không nối với viền (nền ô caro lọt giữa các đám mây)
 *  - 'black': nền đen thành trong suốt theo độ sáng (vẽ bình thường)
 *  - 'keep': giữ nguyên (ảnh đã trong suốt, hoặc nền đen sẽ vẽ ở chế độ cộng sáng)
 */
export type GifBg = 'white' | 'whiteAll' | 'black' | 'keep';

function keyWhiteAll(img: ImageData) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const mn = Math.min(d[i], d[i + 1], d[i + 2]);
    const mx = Math.max(d[i], d[i + 1], d[i + 2]);
    if (mn >= 185 && mx - mn <= 20) d[i + 3] = 0;
  }
}

function keyBlack(img: ImageData) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.max(d[i], d[i + 1], d[i + 2]);
    const a = Math.min(1, Math.max(0, (m - 14) / 46)) * 255;
    if (a < d[i + 3]) d[i + 3] = a;
  }
}

/** Sprite phát GIF đã nạp: gọi step(dt) mỗi frame (chỉ khi đang hiển thị). */
export class GifSprite extends Sprite {
  private t = 0;
  private idx = 0;
  constructor(private frames: GifFrames, randomStart = false) {
    super(frames.textures[0]);
    if (randomStart) this.t = Math.random() * frames.total;
  }
  step(dt: number, speed = 1) {
    const f = this.frames;
    this.t = (this.t + dt * speed) % f.total;
    let acc = 0, i = 0;
    while (i < f.delays.length - 1 && acc + f.delays[i] <= this.t) acc += f.delays[i++];
    if (i !== this.idx) { this.idx = i; this.texture = f.textures[i]; }
  }
}

export async function loadGifFrames(url: string, bg: GifBg = 'white'): Promise<GifFrames> {
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
    if (bg === 'white') removeWhiteBackground(img);
    else if (bg === 'whiteAll') keyWhiteAll(img);
    else if (bg === 'black') keyBlack(img);
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
