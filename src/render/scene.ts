import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { STAGE_H, STAGE_W } from '../engine/slots';
import { DjRig, type DjTextures } from './dj';
import { BANDS, type AudioEngine } from './audio';

const NEON = [0xff3fa4, 0x2de2ff, 0xa24bff, 0x39ff88, 0xffd23f];
const FLOOR_NEON = [0xff3fa4, 0x2de2ff, 0xa24bff, 0x2d8bff];
const FLOOR_ROWS = 13;
const FLOOR_COLS = 10;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mix(c1: number, c2: number, t: number) {
  const r = lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t);
  const g = lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t);
  const b = lerp(c1 & 255, c2 & 255, t);
  return ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
}
const trussY = (x: number) => 150 + 130 * Math.pow((x - 540) / 500, 2);

export interface SceneParams { light: number; lasers: boolean }

/**
 * Quán bar: nền sao, giàn truss + laser, vòng neon hai bên, loa, cột LED equalizer,
 * bảng LED (TOP), cánh trang trí, bàn DJ và sàn nhảy phối cảnh. Mọi thứ nằm sau avatar.
 */
export class BarScene {
  readonly root = new Container();
  readonly billboard = new Container();
  readonly djSlot = new Container();

  private stars = new Graphics();
  private starData = Array.from({ length: 80 }, () => ({
    x: Math.random() * STAGE_W, y: Math.random() * 700, r: 0.8 + Math.random() * 1.8, p: Math.random() * 6, s: 0.8 + Math.random() * 2,
  }));
  private halo = new Graphics();
  private ringsGlow = new Graphics();
  private truss = new Graphics();
  private lights = new Graphics();
  private pillars = new Graphics();
  private woofers: Container[] = [];
  private wings: Container[] = [];
  private decks: Container[] = [];
  private boothLed = new Graphics();
  private floor = new Graphics();
  private lasers = new Graphics();
  private flash = new Graphics();  readonly hasImage: boolean;
    private accent = new Graphics();
  private floorY0: number;
  private halfTop: number;
  private halfBot: number;
  private djRig?: DjRig;
  private petShadow = new Graphics();
  private beams = new Graphics();
  // điểm lấp lánh nhấp nháy: 35% trên trần/truss, 65% trên sàn
  private glints = Array.from({ length: 200 }, (_, i) => ({
    x: Math.random() * STAGE_W,
    y: i % 3 === 0 ? 80 + Math.random() * 900 : 1120 + Math.random() * 780,
    f: 2 + Math.random() * 5, p: Math.random() * 6.28, r: 3 + Math.random() * 6, c: NEON[i % NEON.length],
  }));
  private pets: { s: Sprite; x: number; y: number; k: number; phase: number }[] = [];
  private imgK = 1;
  private imgOX = 0;
  private frame = 0;
  private special = 0;
  private t = 0;

  /**
   * Có texture nền (public/bg/bar-top.png): phần sân khấu/DJ/quầy bar/VIP lấy từ ảnh,
   * sàn nhảy vẽ bằng code bên dưới. Không có texture: dùng scene vector đầy đủ.
   */
  constructor(bg?: Texture) {
    this.hasImage = !!bg;
    this.floorY0 = bg ? 640 : 790;
    this.halfTop = bg ? 560 : 385;
    this.halfBot = bg ? 900 : 820;
    this.drawBackdrop();
    if (bg) {
      // phủ kín khung 9:16 mà không méo: phóng theo chiều cao, cắt đều hai bên
      this.imgK = STAGE_H / bg.height;
      this.imgOX = (bg.width * this.imgK - STAGE_W) / 2;
      const img = new Sprite(bg);
      img.scale.set(this.imgK);
      img.x = -this.imgOX;
      this.root.addChild(img);
      this.root.addChild(this.accent);
      // dải chữ chạy TOP nằm trên mép trên màn hình LED của ảnh
      this.billboard.position.set(...this.ip(472, 674));
      this.root.addChild(this.billboard);
      this.root.addChild(this.djSlot); // DJ đứng trên bục trước bàn DJ
    } else {
      this.drawRings();
      this.drawTruss();
      this.drawSpeakers();
      this.drawBillboard();
      const floorStatic = this.drawFloorStatic();
      this.root.addChild(this.floor, floorStatic);
      this.drawPlatform();
      this.drawWings();
      this.root.addChild(this.djSlot); // DJ nằm sau bàn
      this.drawBooth();
    }
    this.beams.blendMode = 'add';
    this.flash.blendMode = 'add';
    this.root.addChild(this.beams, this.lasers, this.flash);
    this.root.eventMode = 'none';
  }

  /** hiệu ứng sân khấu cấp 3 */
  burst(sec: number) { this.special = Math.max(this.special, sec); }

  // ------------------------------------------------------------------ static drawing

  private drawBackdrop() {
    const bg = new Graphics();
    const bands = 64;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const c = t < 0.45 ? mix(0x05020f, 0x1a0a40, t / 0.45) : mix(0x1a0a40, 0x0a0420, (t - 0.45) / 0.55);
      bg.rect(0, (STAGE_H / bands) * i, STAGE_W, STAGE_H / bands + 1).fill(c);
    }
    // cột sáng hai bên như ảnh tham chiếu
    for (const x of [0, STAGE_W]) {
      for (let i = 0; i < 6; i++) bg.circle(x, 520, 420 - i * 60).fill({ color: 0x5b2bd6, alpha: 0.03 });
    }
    this.halo.blendMode = 'add';
    this.root.addChild(bg, this.stars, this.halo);
  }

  private drawRings() {
    const make = (cx: number, cy: number, colors: number[]) => {
      const g = new Graphics();
      [88, 64, 40].forEach((r, i) => {
        g.circle(cx, cy, r).stroke({ width: 13, color: colors[i] });
        g.circle(cx, cy, r).stroke({ width: 3, color: 0xffffff, alpha: 0.55 });
      });
      g.rect(cx - 6, cy + 90, 12, 120).fill(0x2a1750);
      this.root.addChild(g);
      this.ringsGlow.blendMode = 'add';
      return g;
    };
    make(125, 400, [0xff3fa4, 0x2de2ff, 0xa24bff]);
    make(955, 400, [0x2de2ff, 0xff3fa4, 0xffd23f]);
    this.root.addChild(this.ringsGlow);
  }

  private drawTruss() {
    const g = this.truss;
    const pts: [number, number][] = [];
    for (let x = 30; x <= 1050; x += 30) pts.push([x, trussY(x)]);
    for (const off of [0, 22]) {
      g.moveTo(pts[0][0], pts[0][1] + off);
      pts.forEach(([x, y]) => g.lineTo(x, y + off));
      g.stroke({ width: 6, color: 0x7d6aa8 });
    }
    pts.forEach(([x, y], i) => {
      g.moveTo(x, y).lineTo(x + 15, y + 22).stroke({ width: 2.5, color: 0x5b4a82 });
      if (pts[i + 1]) g.moveTo(x + 15, y + 22).lineTo(pts[i + 1][0], pts[i + 1][1]).stroke({ width: 2.5, color: 0x5b4a82 });
    });
    this.root.addChild(g, this.lights);
    // dây treo + vòng neon nhỏ
    const hang = new Graphics();
    for (const x of [90, 990]) hang.moveTo(x, trussY(x) + 22).lineTo(x, trussY(x) + 70).stroke({ width: 3, color: 0x5b4a82 });
    this.root.addChild(hang);
  }

  private drawSpeakers() {
    for (const [x0, flip] of [[235, 1], [740, -1]] as const) {
      const box = new Graphics();
      box.roundRect(x0, 560, 105, 170, 10).fill(0x120a26).stroke({ width: 3, color: flip > 0 ? 0xff3fa4 : 0x2de2ff });
      this.root.addChild(box);
      for (const [cy, r] of [[610, 34], [682, 22]] as const) {
        const c = new Container();
        const g = new Graphics();
        g.circle(0, 0, r).fill(0x07040f).stroke({ width: 3, color: 0x6a5a90 });
        g.circle(0, 0, r * 0.55).fill(0x2a2148).circle(0, 0, r * 0.2).fill(0x8f7fc0);
        c.addChild(g); c.position.set(x0 + 52, cy);
        this.woofers.push(c); this.root.addChild(c);
      }
    }
    this.root.addChild(this.pillars);
  }

  private drawBillboard() {
    const g = new Graphics();
    g.roundRect(320, 215, 440, 300, 14).fill(0x0a0620).stroke({ width: 5, color: 0x2de2ff });
    g.roundRect(328, 223, 424, 284, 10).stroke({ width: 2, color: 0xff3fa4, alpha: 0.8 });
    for (let y = 228; y < 505; y += 6) g.rect(330, y, 420, 1).fill({ color: 0x2de2ff, alpha: 0.05 });
    g.rect(530, 515, 20, 90).fill(0x2a1750);
    this.billboard.position.set(540, 365);
    this.root.addChild(g, this.billboard);
  }

  private drawPlatform() {
    const g = new Graphics();
    g.poly([205, 720, 875, 720, 975, 800, 105, 800]).fill(0x1d0b3c);
    g.poly([205, 720, 875, 720, 875, 728, 205, 728]).fill(0x3b1c78);
    g.moveTo(105, 800).lineTo(205, 720).lineTo(875, 720).lineTo(975, 800).stroke({ width: 5, color: 0xff3fa4 });
    g.moveTo(105, 806).lineTo(975, 806).stroke({ width: 5, color: 0x2de2ff });
    this.root.addChild(g);
  }

  private drawWings() {
    for (const side of [-1, 1]) {
      const c = new Container();
      const g = new Graphics();
      const cols = [0xffd23f, 0xff9ad0, 0xffd23f, 0xff9ad0, 0xffe27a];
      for (let i = 0; i < 5; i++) {
        const a = -0.2 - i * 0.28; const len = 70 - i * 6;
        const ex = Math.cos(a) * len; const ey = Math.sin(a) * len;
        g.poly([0, 0, ex * 0.8 + 8 * -Math.sin(a), ey * 0.8 + 8 * Math.cos(a), ex, ey, ex * 0.8 - 8 * -Math.sin(a), ey * 0.8 - 8 * Math.cos(a)]).fill(cols[i]);
      }
      g.circle(0, 0, 8).fill(0x2de2ff).stroke({ width: 2, color: 0xffffff });
      g.scale.x = side;
      c.addChild(g);
      c.position.set(540 + side * 150, 660);
      this.wings.push(c); this.root.addChild(c);
    }
  }

  private drawBooth() {
    const g = new Graphics();
    g.roundRect(395, 652, 290, 86, 10).fill(0x150a2e).stroke({ width: 3, color: 0xa24bff });
    g.roundRect(405, 660, 270, 12, 5).fill(0x241247);
    this.root.addChild(g);
    for (const x of [470, 610]) {
      const c = new Container();
      const d = new Graphics();
      d.circle(0, 0, 30).fill(0x0b0618).stroke({ width: 3, color: 0x2de2ff });
      d.circle(0, 0, 9).fill(0xff3fa4);
      d.moveTo(0, -28).lineTo(0, -12).stroke({ width: 3, color: 0xffffff });
      c.addChild(d); c.position.set(x, 680); c.scale.y = 0.4;
      this.decks.push(c); this.root.addChild(c);
    }
    this.root.addChild(this.boothLed);
  }

  private drawFloorStatic(): Graphics {
    const g = new Graphics();
    const edge = (side: number) => {
      const pts: number[] = [];
      for (let k = 0; k <= FLOOR_ROWS; k++) pts.push(this.floorX(k, side < 0 ? 0 : FLOOR_COLS), this.floorY(k));
      return pts;
    };
    if (!this.hasImage) {
      const left = edge(-1); const right = edge(1);
      g.moveTo(left[0], left[1]);
      for (let i = 2; i < left.length; i += 2) g.lineTo(left[i], left[i + 1]);
      g.stroke({ width: 6, color: 0xff3fa4 });
      g.moveTo(right[0], right[1]);
      for (let i = 2; i < right.length; i += 2) g.lineTo(right[i], right[i + 1]);
      g.stroke({ width: 6, color: 0x2de2ff });
    }
    for (let k = 0; k <= FLOOR_ROWS; k++) g.moveTo(this.floorX(k, 0), this.floorY(k)).lineTo(this.floorX(k, FLOOR_COLS), this.floorY(k)).stroke({ width: 1.5, color: 0xb98cff, alpha: this.hasImage ? 0.38 : 0.2 });
    for (let c = 0; c <= FLOOR_COLS; c++) g.moveTo(this.floorX(0, c), this.floorY(0)).lineTo(this.floorX(FLOOR_ROWS, c), this.floorY(FLOOR_ROWS)).stroke({ width: 1.5, color: 0xb98cff, alpha: this.hasImage ? 0.38 : 0.2 });
    return g;
  }

  private floorY(k: number) { return this.floorY0 + (STAGE_H - this.floorY0 + 20) * Math.pow(k / FLOOR_ROWS, 1.55); }
  private floorX(k: number, c: number) {
    const y = this.floorY(k);
    const half = lerp(this.halfTop, this.halfBot, (y - this.floorY0) / (STAGE_H - this.floorY0));
    return STAGE_W / 2 - half + (c / FLOOR_COLS) * half * 2;
  }

  // ------------------------------------------------------------------ dynamic

  update(dt: number, audio: AudioEngine, p: SceneParams) {
    this.t += dt;
    this.frame++;
    const L = p.light;
    const t = this.t;
    const pulse = audio.pulse;
    const sp = this.special > 0 ? clamp01(this.special) : 0;
    if (this.special > 0) this.special -= dt;
    const colorShift = Math.floor(audio.beat / 8);

    if (this.hasImage) { this.updateAccent(audio, L, pulse); this.djRig?.update(dt, audio.beat, pulse); }
    else this.updateVector(audio, L, t, pulse, sp, colorShift);

    // sàn nhảy: cập nhật mỗi 2 frame
    if (!this.hasImage && (this.frame % 2 === 0 || this.frame < 3)) this.drawFloor(audio, L, colorShift);

    if (this.hasImage) this.drawBeams(audio, p, sp);
    this.drawLasers(audio, p, sp);

    // flash nhẹ khi hiệu ứng cấp 3 (chỉ phần sân khấu, giới hạn alpha)
    this.flash.clear();
    if (this.hasImage && L > 0) {
      // chớp màu theo nhịp, luân phiên trái/phải (mỗi bên tối đa ~1 lần/giây, alpha thấp, không strobe trắng)
      const beatI = Math.floor(audio.beat);
      const col = NEON[(Math.floor(beatI / 4)) % NEON.length];
      const a = 0.3 * audio.pulse * audio.pulse * Math.min(1.3, L);
      this.flash.rect(beatI % 2 ? STAGE_W / 2 : 0, 0, STAGE_W / 2, 1250).fill({ color: col, alpha: a });
      // nhịp mạnh (đầu mỗi ô 4 nhịp): bùng cả sân khấu + vòng sáng nở ra từ quả cầu disco
      if (beatI % 4 === 0) {
        const f = audio.pulse * audio.pulse;
        this.flash.rect(0, 0, STAGE_W, 1500).fill({ color: NEON[(Math.floor(beatI / 4) + 1) % NEON.length], alpha: 0.22 * f * Math.min(1.3, L) });
        const [bx, by] = this.ip(470, 490);
        const r = (1 - audio.pulse) * 700 + 60;
        this.flash.circle(bx, by, r).stroke({ width: 26 * audio.pulse + 2, color: 0xffffff, alpha: 0.5 * audio.pulse * Math.min(1, L) });
        this.flash.circle(bx, by, 150 * (0.4 + audio.pulse)).fill({ color: 0xffffff, alpha: 0.35 * f * Math.min(1, L) });
      }
    }
    if (sp > 0) this.flash.rect(0, 0, STAGE_W, this.hasImage ? 1100 : 800).fill({ color: 0xff6fd0, alpha: 0.07 * sp * (0.6 + 0.4 * Math.sin(t * 6)) });
  }

  /** DJ ghép từ ảnh của bạn, đứng sau bàn DJ (đáy thân ở mép trên bàn). */
  addDj(tx: DjTextures) {
    const dj = new DjRig(tx);
    const [x, y] = this.ip(470, 850);
    dj.position.set(x, y);
    // thân bị cắt ở mép sau mặt bàn DJ (đứng hẳn sau bàn); hai tay thả xuống mặt bàn nên cắt thấp hơn
    const mk = (iy: number) => { const g = new Graphics().rect(0, 0, STAGE_W, this.ip(0, iy)[1]).fill(0xffffff); this.root.addChild(g); return g; };
    dj.setMasks(mk(836), mk(852));
    dj.scale.set((160 * this.imgK) / tx.body.width);
    this.djRig = dj;
    this.root.addChildAt(dj, this.root.getChildIndex(this.accent));
  }

  /** Hai nhân vật có cánh đứng hai bên bàn DJ, nhún theo nhịp. */
  addPets(left: Texture, right: Texture) {
    this.root.addChildAt(this.petShadow, this.root.getChildIndex(this.accent));
    for (const [tex, ix, phase] of [[left, 318, 0.5], [right, 622, 0.25]] as const) {
      const s = new Sprite(tex);
      s.anchor.set(0.5, 0.97);
      const [x, y] = this.ip(ix, 892); // chân chạm mặt bục
      const k = (140 * this.imgK) / tex.width;
      s.scale.set(k); s.position.set(x, y);
      this.pets.push({ s, x, y, k, phase });
      this.root.addChildAt(s, this.root.getChildIndex(this.accent));
    }
  }

  /** Tọa độ trong ảnh nền -> tọa độ sân khấu. */
  ip(x: number, y: number): [number, number] { return [x * this.imgK - this.imgOX, y * this.imgK]; }

  /** Chi tiết động đè lên ảnh nền: màn LED, loa, quả cầu disco, bàn DJ. */
  private updateAccent(audio: AudioEngine, L: number, pulse: number) {
    const g = this.accent;
    g.clear();
    const K = this.imgK;
    this.petShadow.clear();
    for (const p of this.pets) {
      const ph = audio.beat + p.phase; const j = Math.abs(Math.sin(ph * Math.PI)); const boost = 1 + pulse * 0.6;
      const hop = 14 * j * boost; // nhảy tại chỗ, chân chạm bục ở đáy nhịp
      p.s.rotation = Math.sin(ph * Math.PI) * 0.04 * boost;
      p.s.scale.set(p.k * (1 + 0.04 * (1 - j)), p.k * (1 - 0.04 * (1 - j) + 0.03 * j));
      p.s.position.set(p.x, p.y - hop);
      this.petShadow.ellipse(p.x, p.y + 2, 46 * (1 - 0.25 * j), 9 * (1 - 0.25 * j)).fill({ color: 0x05020f, alpha: 0.4 * (1 - 0.4 * j) });
    }
    const [sx, sy] = this.ip(290, 655);
    g.roundRect(sx, sy, 365 * K, 215 * K, 8).fill({ color: 0xb06cff, alpha: (0.04 + 0.12 * pulse) * L });
    for (let i = 0; i < 24; i++) {
      const b = audio.bands[Math.min(BANDS - 1, Math.floor((i / 24) * BANDS))] ?? 0;
      const h = (0.12 + b * 0.9) * 130 * K;
      const [bx0, by0] = this.ip(300 + i * 14.6, 860);
      g.rect(bx0, by0 - h, 10 * K, h).fill({ color: i % 2 ? 0x59e8ff : 0xff6fe0, alpha: 0.16 * Math.min(1, L + 0.2) });
    }
    for (const ix of [250, 692]) {
      const [cx, cy] = this.ip(ix, 765);
      const r = 55 * K * (1 + audio.bass * 0.12 + pulse * 0.1);
      g.circle(cx, cy, r).fill({ color: 0xff3fa4, alpha: (0.06 + 0.14 * pulse) * L });
      g.circle(cx, cy, r * 0.62).fill({ color: 0x2de2ff, alpha: (0.05 + 0.12 * pulse) * L });
    }
    const [ox, oy] = this.ip(370, 840);
    g.roundRect(ox, oy, 202 * K, 58 * K, 8).stroke({ width: 4, color: 0x59e8ff, alpha: (0.15 + 0.5 * pulse) * L });
    const [dx, dy] = this.ip(470, 490);
    for (let i = 0; i < 7; i++) {
      const a = this.t * 0.6 + i * 0.9; const d = (46 + 34 * ((i * 37) % 5) / 5) * K / 1.15;
      const tw = Math.max(0, Math.sin(this.t * 4 + i * 2.1));
      g.circle(dx + Math.cos(a) * d * 1.5, dy + Math.sin(a) * d, 2.5 + 3.5 * tw).fill({ color: 0xffffff, alpha: 0.7 * tw * Math.min(1, L) });
    }
  }

  private updateVector(audio: AudioEngine, L: number, t: number, pulse: number, sp: number, colorShift: number) {
    // sao
    this.stars.clear();
    for (const s of this.starData) this.stars.circle(s.x, s.y, s.r).fill({ color: 0xffffff, alpha: (0.35 + 0.35 * Math.sin(t * s.s + s.p)) * Math.min(1, L + 0.2) });

    // quầng sáng sau sân khấu
    this.halo.clear();
    for (let i = 0; i < 5; i++) this.halo.circle(540, 470, 520 - i * 90).fill({ color: NEON[(colorShift + i) % 3 + 0], alpha: (0.018 + 0.012 * pulse) * L });

    // vòng neon: glow theo nhịp
    this.ringsGlow.clear();
    for (const [cx, cols] of [[125, [0xff3fa4, 0x2de2ff, 0xa24bff]], [955, [0x2de2ff, 0xff3fa4, 0xffd23f]]] as const) {
      [88, 64, 40].forEach((r, i) => this.ringsGlow.circle(cx, 400, r).stroke({ width: 26, color: cols[i], alpha: (0.1 + 0.18 * pulse + 0.2 * sp) * L }));
    }

    // đèn LED nhấp nháy trên truss (nhịp chậm, không strobe)
    this.lights.clear();
    for (let x = 60; x <= 1020; x += 60) {
      const on = (Math.floor(audio.beat * 2) + Math.floor(x / 60)) % 3 === 0;
      const col = NEON[(Math.floor(x / 60) + colorShift) % NEON.length];
      this.lights.circle(x, trussY(x) + 34, 7).fill({ color: col, alpha: (on ? 0.95 : 0.35) * Math.min(1, L + 0.3) });
      if (on) this.lights.circle(x, trussY(x) + 34, 15).fill({ color: col, alpha: 0.2 * L });
    }

    // loa theo bass
    const bump = 1 + audio.bass * 0.22 + pulse * 0.08;
    this.woofers.forEach((w, i) => w.scale.set(i % 2 ? 1 + (bump - 1) * 0.5 : bump));

    // cột LED equalizer
    this.pillars.clear();
    for (const [x0, mirror] of [[880, 1], [40, -1]] as const) {
      for (let c = 0; c < 10; c++) {
        const b = audio.bands[Math.min(BANDS - 1, mirror > 0 ? c : 9 - c)] ?? 0;
        const lit = Math.round(Math.min(1, b * 1.5 + 0.08) * 14);
        for (let s = 0; s < 14; s++) {
          const col = s < 8 ? 0x39ff88 : s < 11 ? 0xffd23f : 0xff4f6d;
          this.pillars.rect(x0 + c * 17, 700 - s * 13, 13, 10).fill({ color: col, alpha: s < lit ? 0.95 * Math.min(1, L + 0.3) : 0.1 });
        }
      }
    }

    // cánh vỗ nhẹ theo nhịp, đĩa DJ quay
    this.wings.forEach((w, i) => { w.rotation = (i ? 1 : -1) * (-0.05 - 0.1 * pulse + 0.05 * Math.sin(t * 3)); });
    this.decks.forEach((d, i) => { d.rotation = t * (i ? -2.2 : 2.2); });

    // dải LED mặt bàn DJ
    this.boothLed.clear();
    for (let i = 0; i < 16; i++) {
      const col = NEON[(i + colorShift + Math.floor(audio.beat)) % NEON.length];
      const on = audio.bands[i] > 0.28 || i % 4 === Math.floor(audio.beat) % 4;
      this.boothLed.roundRect(415 + i * 16.5, 712, 12, 10, 3).fill({ color: col, alpha: on ? 0.95 : 0.25 });
    }

  }

  private drawFloor(audio: AudioEngine, L: number, shift: number) {
    const g = this.floor;
    g.clear();
    const step = Math.floor(audio.beat / 2);
    const img = this.hasImage;
    for (let r = 0; r < FLOOR_ROWS; r++) {
      // sàn chuyển màu từ tím hồng (xa) sang xanh dương/cyan (gần) như ảnh tham chiếu
      const t = r / (FLOOR_ROWS - 1);
      for (let c = 0; c < FLOOR_COLS; c++) {
        const pts = [this.floorX(r, c), this.floorY(r), this.floorX(r, c + 1), this.floorY(r), this.floorX(r + 1, c + 1), this.floorY(r + 1), this.floorX(r + 1, c), this.floorY(r + 1)];
        let base: number;
        if (img) {
          const hue = mix(0x9b2fe0, 0x1f7bff, Math.min(1, Math.max(0, t * 1.1 + (c / FLOOR_COLS - 0.5) * 0.35)));
          base = mix(0x0a0620, hue, (r + c) % 2 ? 0.55 : 0.8);
        } else base = (r + c) % 2 ? 0x1a0a38 : 0x230e4a;
        g.poly(pts).fill(base);
        const n = Math.sin(r * 12.9898 + c * 78.233 + step * 37.719 + shift * 5.1) * 43758.5453;
        const h = n - Math.floor(n);
        if (h < (img ? 0.38 : 0.4)) {
          const col = img ? mix(0x59e8ff, 0xff6fe0, ((c + r) % 5) / 5) : NEON[Math.floor(h * 12.5 + shift) % NEON.length];
          const a = (img ? 0.3 + 0.3 * audio.pulse : 0.2 + 0.25 * audio.pulse) * L * (r < 3 ? 0.7 : 1);
          g.poly(pts).fill({ color: col, alpha: Math.min(0.62, a) });
          if (img) g.poly(pts).stroke({ width: 2, color: 0xbff4ff, alpha: 0.45 * L });
        }
      }
    }
  }

  /** Đèn moving head trên giàn truss: chùm sáng quét xuống sàn, đốm sáng trên sàn, đèn nhấp nháy theo nhịp. */
  private drawBeams(audio: AudioEngine, p: SceneParams, sp: number) {
    const g = this.beams;
    g.clear();
    if (p.light <= 0) return;
    const L = p.light;
    const K = this.imgK;
    // vị trí đèn trong ảnh nền
    const fixtures: [number, number][] = [
      [122, 295], [224, 250], [352, 230], [590, 228], [716, 250], [822, 295],
      [257, 432], [330, 410], [398, 405], [545, 405], [612, 412], [686, 432],
      // đèn bổ sung
      [170, 270], [285, 238], [470, 222], [655, 238], [770, 270],
      [220, 445], [295, 420], [470, 400], [580, 408], [650, 420], [720, 445],
    ];
    const shift = Math.floor(audio.beat / 4) + (sp > 0 ? Math.floor(this.t * 2) : 0);
    // nhấp nháy: các điểm sáng hình sao 4 cánh, mỗi điểm chớp theo tần số riêng (diện tích nhỏ, không chớp toàn màn hình)
    for (const q of this.glints) {
      const v = Math.pow(Math.max(0, Math.sin(this.t * q.f * (1 + audio.pulse * 0.4) + q.p)), 4);
      const a = v * (0.35 + 0.65 * audio.pulse) * Math.min(1, L + 0.2);
      if (a < 0.03) continue;
      const r = q.r * (0.6 + v);
      g.circle(q.x, q.y, r * 0.45).fill({ color: 0xffffff, alpha: 0.9 * a });
      g.moveTo(q.x - r * 2.2, q.y).lineTo(q.x + r * 2.2, q.y).stroke({ width: 1.6, color: q.c, alpha: 0.8 * a });
      g.moveTo(q.x, q.y - r * 2.2).lineTo(q.x, q.y + r * 2.2).stroke({ width: 1.6, color: q.c, alpha: 0.8 * a });
    }
    fixtures.forEach(([ix, iy], i) => {
      const [fx, fy] = this.ip(ix, iy);
      const col = NEON[(i + shift) % NEON.length];
      const sweep = Math.sin(this.t * (0.5 + (i % 4) * 0.13) + i * 1.9);
      const a = Math.PI / 2 + sweep * (0.55 + 0.2 * sp) + (ix < 470 ? 0.12 : -0.12);
      const len = 560 * K + 450 + 100 * Math.sin(this.t * 0.7 + i);
      const w = 0.06 + 0.03 * audio.pulse;
      const k = (0.55 + 0.7 * audio.pulse + 0.4 * sp) * L;
      const ex1 = fx + Math.cos(a - w) * len; const ey1 = fy + Math.sin(a - w) * len;
      const ex2 = fx + Math.cos(a + w) * len; const ey2 = fy + Math.sin(a + w) * len;
      g.poly([fx, fy, ex1, ey1, ex2, ey2]).fill({ color: col, alpha: 0.11 * k });
      const w2 = w * 0.45;
      g.poly([fx, fy, fx + Math.cos(a - w2) * len, fy + Math.sin(a - w2) * len, fx + Math.cos(a + w2) * len, fy + Math.sin(a + w2) * len]).fill({ color: col, alpha: 0.14 * k });
      // đốm sáng trên sàn tại cuối chùm (giới hạn trong vùng sàn)
      const gx = fx + Math.cos(a) * len; const gy = Math.min(1850, Math.max(1180, fy + Math.sin(a) * len));
      g.ellipse(gx, gy, 70 + 40 * audio.pulse, 26 + 12 * audio.pulse).fill({ color: col, alpha: 0.24 * k });
      // đèn nhấp nháy
      const on = (Math.floor(audio.beat * 2) + i) % 3 === 0;
      g.circle(fx, fy, (on ? 15 : 8) * K).fill({ color: col, alpha: (on ? 0.7 : 0.25) * Math.min(1, L + 0.2) });
    });
  }

  private drawLasers(audio: AudioEngine, p: SceneParams, sp: number) {
    const g = this.lasers;
    g.clear();
    if (!p.lasers || p.light <= 0) return;
    const n = sp > 0 ? 30 : 22;
    const L = p.light;
    for (let i = 0; i < n; i++) {
      const x0 = 70 + ((i + 0.5) / n) * 940;
      const y0 = this.hasImage ? 120 + 20 * Math.sin(i) : trussY(x0) + 24;
      const a = Math.PI / 2 + Math.sin(this.t * (0.55 + (i % 3) * 0.17) + i * 1.7) * (0.72 + 0.25 * sp);
      const dx = Math.cos(a); const dy = Math.sin(a);
      const maxY = this.hasImage ? 1500 : 1250;
      const len = Math.min(1500, (maxY - y0) / Math.max(0.2, dy));
      const col = NEON[(i + Math.floor(audio.beat / 8) + (sp > 0 ? Math.floor(this.t * 2) : 0)) % NEON.length];
      const k = (0.75 + 0.25 * audio.pulse) * L * (this.hasImage ? 0.7 : 1);
      g.moveTo(x0, y0).lineTo(x0 + dx * len, y0 + dy * len).stroke({ width: 14, color: col, alpha: 0.07 * k });
      g.moveTo(x0, y0).lineTo(x0 + dx * len, y0 + dy * len).stroke({ width: 3, color: col, alpha: 0.5 * k });
    }
    g.blendMode = 'add';
  }
}

function clamp01(v: number) { return Math.min(1, Math.max(0, v)); }
