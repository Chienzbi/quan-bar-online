import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { STAGE_H, STAGE_W } from '../engine/slots';
import { GifSprite, type GifFrames } from './gifFrames';

/** Nguồn hình avatar người tặng quà (GIF hoặc ảnh tĩnh) để ngồi lên con thú. */
export interface RiderSource { gif: GifFrames | null; tex: Texture | null }
export interface GiftShow {
  name: string;
  giftName: string;
  rider: RiderSource | null;
  /** Gọi khi cảnh thật sự bắt đầu chiếu (sau khi chờ hàng đợi) và khi kết thúc. */
  onStart?: () => void;
  onEnd?: () => void;
}
export interface GiftSceneAssets { phoenix?: GifFrames; dragon?: GifFrames; cloud?: GifFrames; glow?: Texture }

const DUR = 6.2; // giây
const MIN_GAP = 1.2; // nghỉ giữa hai cảnh liên tiếp
const MAX_QUEUE = 3;
const RIDER_H = 270; // nhỏ hơn con thú để không che mất nó
const NOTES = 100;
const PARTS = 360;
const SPARK_COLORS = [0xffe27a, 0xff9ad0, 0x7ff0ff, 0xffffff, 0xffb347];
const NOTE_COLORS = [0x3db8ff, 0xff7ac8, 0x4cd964, 0xffd23f];

/** Bốn "giao diện" cho cảnh quà cấp 3: mỗi lần chiếu đổi màu tia sáng, quầng sáng và thứ rơi xuống (không lặp lại giao diện vừa dùng). */
interface Theme { rays: number[]; glow: number | null; fall: 'note' | 'coin' | 'petal'; colors: number[] }
const THEMES: Theme[] = [
  { rays: [0xffd25a, 0xff8a3a, 0xff7ac8, 0x6ff0ff], glow: null, fall: 'note', colors: NOTE_COLORS }, // vàng cam, tiền giấy
  { rays: [0xb98cff, 0x6ff0ff, 0xff7ac8, 0xffffff], glow: 0x8a6cff, fall: 'coin', colors: [0xffe27a, 0xffd23f, 0xfff2a8] }, // tím xanh, đồng xu vàng
  { rays: [0xff6fa8, 0xffb3d1, 0xffd25a, 0xff4f8b], glow: 0xff5a8a, fall: 'petal', colors: [0xff6fa8, 0xff9ac4, 0xe0386f, 0xffb3d1] }, // hồng, cánh hoa
  { rays: [0x6ff0ff, 0x3db8ff, 0xb98cff, 0xffffff], glow: 0x3db8ff, fall: 'note', colors: [0x3db8ff, 0x6ff0ff, 0xb98cff, 0xffffff] }, // xanh ngọc, tiền giấy lạnh
];

const easeOutBack = (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Part { s: Sprite; vx: number; vy: number; ay: number; life: number; max: number; spin: number; s0: number; s1: number; live: boolean }
interface Note { s: Sprite; vx: number; vy: number; spin: number; live: boolean }

/**
 * Cảnh tặng quà lớn chiếm cả màn hình (theo video tham khảo):
 * nền tối + tia sáng vàng, con thú thần thoại (phượng hoàng / rồng luân phiên) bay vào,
 * avatar người tặng quà ngồi phía trên kèm tên, mây vàng ở tiền cảnh, dải cảm ơn trên đầu, mưa tiền giấy.
 * Nằm ngoài camera, vẽ trên cùng.
 */
export class GiftScene extends Container {
  private dim = new Graphics();
  private rays = new Graphics();
  private glow: Sprite;
  private phoenix?: GifSprite;
  private dragon?: GifSprite;
  private clouds: GifSprite[] = [];
  private riderBox = new Container();
  private rider: Sprite | null = null;
  private nameText: Text;
  private banner = new Container();
  private bannerBg = new Graphics();
  private bannerText: Text;
  private notes: Note[] = [];
  private rings = new Graphics();
  private flash = new Graphics();
  private riderGlow: Sprite;
  private parts: Part[] = [];
  private partLayer = new Container();
  private starTex: Texture;
  private dotTex: Texture;
  private sparkAcc = 0;
  private cur?: GiftShow;
  private fallTex!: { note: Texture; coin: Texture; petal: Texture };
  private themeIdx = Math.floor(Math.random() * THEMES.length);
  private theme: Theme = THEMES[0];
  private fw = 0;
  private noteLayer = new Container();

  private kind: 'phoenix' | 'dragon' = 'phoenix';
  private next: 'phoenix' | 'dragon' = 'phoenix';
  private queue: GiftShow[] = [];
  private t = -1;
  private gap = 0;
  private acc = 0;

  constructor(app: Application, a: GiftSceneAssets) {
    super();
    this.eventMode = 'none';
    this.visible = false;

    this.dim.rect(0, 0, STAGE_W, STAGE_H).fill(0x05020f);
    this.rays.blendMode = 'add';
    this.glow = new Sprite(a.glow ?? Texture.WHITE);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.tint = 0xffa63a;
    this.rings.blendMode = 'add';
    this.riderGlow = new Sprite(a.glow ?? Texture.WHITE);
    this.riderGlow.anchor.set(0.5);
    this.riderGlow.blendMode = 'add';
    this.riderGlow.tint = 0xfff0b0;
    this.addChild(this.dim, this.rays, this.glow, this.rings);

    for (const [src, key] of [[a.dragon, 'dragon'], [a.phoenix, 'phoenix']] as const) {
      if (!src) continue;
      const s = new GifSprite(src);
      s.anchor.set(0.5);
      s.blendMode = 'add'; // nền đen của GIF tự biến mất
      s.visible = false;
      this[key] = s;
      this.addChild(s);
    }
    this.next = a.phoenix ? 'phoenix' : 'dragon';

    if (a.cloud) {
      for (let i = 0; i < 2; i++) {
        const c = new GifSprite(a.cloud, true);
        c.anchor.set(0.5);
        this.clouds.push(c);
        this.addChild(c);
      }
    }

    this.nameText = new Text({ text: '', style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 52, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x2a0b4f, width: 9 } } });
    this.nameText.anchor.set(0.5);
    this.bannerText = new Text({ text: '', style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 38, fontWeight: '800', fill: 0xffe27a, stroke: { color: 0x2a0b4f, width: 7 } } });
    this.bannerText.anchor.set(0.5);
    this.banner.addChild(this.bannerBg, this.bannerText);
    this.addChild(this.riderGlow, this.riderBox, this.partLayer, this.nameText, this.banner);

    // tiền giấy: texture vẽ một lần, nhuộm màu theo từng tờ
    const g = new Graphics();
    g.roundRect(0, 0, 46, 24, 3).fill(0xffffff);
    g.roundRect(3, 3, 40, 18, 2).stroke({ width: 1.5, color: 0x000000, alpha: 0.28 });
    g.circle(23, 12, 6).stroke({ width: 2, color: 0x000000, alpha: 0.3 });
    const noteTex = app.renderer.generateTexture(g);
    g.destroy();
    const cg = new Graphics();
    cg.circle(0, 0, 15).fill(0xffffff).circle(0, 0, 10.5).stroke({ width: 2.5, color: 0x000000, alpha: 0.28 }).circle(0, 0, 4).fill({ color: 0x000000, alpha: 0.2 });
    const coinTex = app.renderer.generateTexture(cg);
    cg.destroy();
    const pg = new Graphics();
    pg.ellipse(0, 0, 9, 15).fill(0xffffff).ellipse(-2, -3, 4, 8).fill({ color: 0xffffff, alpha: 0.45 });
    const petalTex = app.renderer.generateTexture(pg);
    pg.destroy();
    this.fallTex = { note: noteTex, coin: coinTex, petal: petalTex };
    // hạt lấp lánh: sao 4 cánh + chấm sáng mềm, vẽ cộng sáng
    const sg = new Graphics();
    sg.poly([0, -16, 3.5, -3.5, 16, 0, 3.5, 3.5, 0, 16, -3.5, 3.5, -16, 0, -3.5, -3.5]).fill(0xffffff);
    this.starTex = app.renderer.generateTexture(sg);
    sg.destroy();
    const dg = new Graphics();
    dg.circle(0, 0, 10).fill({ color: 0xffffff, alpha: 0.25 }).circle(0, 0, 5).fill({ color: 0xffffff, alpha: 0.6 }).circle(0, 0, 2.5).fill(0xffffff);
    this.dotTex = app.renderer.generateTexture(dg);
    dg.destroy();
    for (let i = 0; i < PARTS; i++) {
      const s = new Sprite(this.dotTex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.partLayer.addChild(s);
      this.parts.push({ s, vx: 0, vy: 0, ay: 0, life: 0, max: 1, spin: 0, s0: 1, s1: 1, live: false });
    }
    this.flash.rect(0, 0, STAGE_W, STAGE_H).fill(0xffffff);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;
    for (let i = 0; i < NOTES; i++) {
      const s = new Sprite(noteTex);
      s.anchor.set(0.5);
      s.visible = false;
      this.noteLayer.addChild(s);
      this.notes.push({ s, vx: 0, vy: 0, spin: 0, live: false });
    }
    this.addChild(this.noteLayer);
  }

  get busy() { return this.t >= 0; }

  /** Xếp một cảnh vào hàng đợi (tối đa MAX_QUEUE, quá thì bỏ cảnh cũ nhất). */
  play(show: GiftShow) {
    if (!this.phoenix && !this.dragon) return;
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push(show);
  }

  private start(show: GiftShow) {
    this.cur = show;
    show.onStart?.();
    this.kind = this.next;
    const other = this.kind === 'phoenix' ? 'dragon' : 'phoenix';
    this.next = this[other] ? other : this.kind;
    if (this.phoenix) this.phoenix.visible = this.kind === 'phoenix';
    if (this.dragon) this.dragon.visible = this.kind === 'dragon';
    // đổi giao diện so với lần trước
    this.themeIdx = (this.themeIdx + 1 + Math.floor(Math.random() * (THEMES.length - 1))) % THEMES.length;
    this.theme = THEMES[this.themeIdx];
    this.glow.tint = this.theme.glow ?? (this.kind === 'phoenix' ? 0xff7a2a : 0xffc24a);

    this.riderBox.removeChildren();
    this.rider?.destroy();
    this.rider = null;
    const r = show.rider;
    if (r?.gif) this.rider = new GifSprite(r.gif, true);
    else if (r?.tex) this.rider = new Sprite(r.tex);
    if (this.rider) {
      this.rider.anchor.set(0.5, 1);
      this.rider.scale.set(RIDER_H / (this.rider.texture.height || RIDER_H));
      this.riderBox.addChild(this.rider);
    }

    this.nameText.text = show.name;
    this.bannerText.text = `Cảm ơn ${show.name} đã tặng ${show.giftName}!`;
    this.bannerText.scale.set(Math.min(1, 940 / Math.max(1, this.bannerText.width)));
    const bw = Math.min(1000, this.bannerText.width * this.bannerText.scale.x + 90);
    this.bannerBg.clear()
      .roundRect(-bw / 2, -40, bw, 80, 40).fill({ color: 0x1a0638, alpha: 0.88 })
      .roundRect(-bw / 2, -40, bw, 80, 40).stroke({ width: 4, color: 0xffd23f });

    this.t = 0;
    this.acc = 0;
    this.sparkAcc = 0;
    this.fw = 0.5;
    this.visible = true;
  }

  update(dt: number) {
    if (this.gap > 0) this.gap -= dt;
    if (this.t < 0) {
      if (this.queue.length && this.gap <= 0) this.start(this.queue.shift()!);
      else this.stepNotes(dt);
      return;
    }
    this.t += dt;
    if (this.t >= DUR) {
      this.t = -1;
      this.gap = MIN_GAP;
      this.visible = this.notes.some((n) => n.live);
      this.dim.alpha = 0; this.rays.clear(); this.rings.clear(); this.flash.alpha = 0;
      this.position.set(0, 0);
      for (const p of this.parts) { p.live = false; p.s.visible = false; }
      const done = this.cur;
      this.cur = undefined;
      done?.onEnd?.();
      return;
    }
    const t = this.t;
    const a = Math.min(1, t / 0.5, (DUR - t) / 0.7);
    const rise = (1 - easeOutBack(Math.min(1, t / 0.9))) * 380;
    const bob = Math.sin(t * 2.4) * 18;

    this.dim.alpha = 0.62 * a;
    this.drawRays(t, a);
    this.drawRings(t, a);
    // một lần loé sáng lúc vào (chỉ ~0.35s, không nhấp nháy liên tục) + rung nhẹ khi con thú xuất hiện
    this.flash.alpha = 0.4 * Math.max(0, 1 - t / 0.35);
    const amp = 11 * Math.max(0, 1 - t / 0.7);
    this.position.set(rand(-amp, amp), rand(-amp, amp));
    this.glow.position.set(STAGE_W / 2, 960);
    this.glow.scale.set(2000 / this.glow.texture.width);
    this.glow.alpha = 0.6 * a * (0.9 + 0.1 * Math.sin(t * 9));

    // con thú + vị trí chỗ ngồi của avatar
    let riderX = STAGE_W / 2, riderY = 1000;
    if (this.kind === 'phoenix' && this.phoenix) {
      const p = this.phoenix;
      p.step(dt);
      p.alpha = a;
      p.scale.set((1040 / p.texture.width) * (1 + 0.015 * Math.sin(t * 7)));
      p.position.set(STAGE_W / 2, 960 + rise + bob);
      // phượng nhìn thẳng, thấy đầu ở phía trên: avatar đứng trên đầu/đỉnh lưng để thân và cánh vẫn lộ ra
      riderX = p.x; riderY = p.y - p.height / 2 + p.height * 0.24;
    } else if (this.dragon) {
      const d = this.dragon;
      d.step(dt);
      d.alpha = a;
      d.scale.set(1180 / d.texture.width);
      d.position.set(STAGE_W / 2 + 25 * Math.sin(t * 1.3), 1040 + rise + bob);
      d.rotation = 0.03 * Math.sin(t * 1.7);
      // rồng nhìn nghiêng: avatar ngồi trên lưng, chân đặt lên đường lưng phía trên thân
      riderX = d.x + 40; riderY = d.y - d.height * 0.16;
    }

    // mây vàng tiền cảnh trôi chậm dưới chân con thú
    this.clouds.forEach((c, i) => {
      c.step(dt);
      c.alpha = a * 0.95;
      c.scale.set((1500 / c.texture.width) * (i ? -1 : 1), 1500 / c.texture.width);
      c.position.set(STAGE_W / 2 + (i ? 160 : -120) + Math.sin(t * 0.8 + i * 2) * 50, 1700 + i * 130 + rise * 0.6);
    });

    if (this.rider) {
      if (this.rider instanceof GifSprite) this.rider.step(dt);
      this.riderBox.alpha = a;
      this.riderBox.position.set(riderX, riderY);
      this.riderBox.scale.set(1 + 0.03 * Math.abs(Math.sin(t * 4)));
    }
    this.nameText.alpha = a;
    this.nameText.scale.set(1 + 0.05 * Math.abs(Math.sin(t * 5)));
    this.riderGlow.position.set(riderX, riderY - RIDER_H * 0.45);
    this.riderGlow.scale.set(900 / this.riderGlow.texture.width);
    this.riderGlow.alpha = 0.55 * a * (0.8 + 0.2 * Math.sin(t * 6));
    this.nameText.position.set(riderX, Math.max(470, riderY - (this.rider ? RIDER_H : 120) - 40));

    // dải cảm ơn trượt từ trái vào
    const slide = (1 - easeOutBack(Math.min(1, t / 0.7))) * -900;
    this.banner.position.set(STAGE_W / 2 + slide, 360);
    this.banner.alpha = a;

    // mưa tiền giấy
    if (t > 0.4 && t < DUR - 1.2) {
      this.acc += dt * 40;
      while (this.acc >= 1) { this.acc -= 1; this.spawnNote(); }
    }
    this.stepNotes(dt);

    // lấp lánh toả khắp cảnh + pháo hoa nổ ở nửa trên
    if (t < DUR - 0.8) {
      this.sparkAcc += dt * 60;
      while (this.sparkAcc >= 1) {
        this.sparkAcc -= 1;
        this.spawnPart(this.starTex, rand(40, 1040), rand(480, 1550), rand(-25, 25), rand(-120, -30), 0, rand(0.9, 1.7), 0.25, rand(0.7, 1.3), SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0], rand(-2, 2));
      }
      this.fw -= dt;
      if (this.fw <= 0) { this.fw = rand(0.5, 0.85); this.firework(rand(160, 920), rand(520, 1150)); }
    }
    this.stepParts(dt);
    this.addChild(this.flash); // luôn trên cùng
  }

  private spawnPart(tex: Texture, x: number, y: number, vx: number, vy: number, ay: number, life: number, s0: number, s1: number, tint: number, spin: number) {
    const p = this.parts.find((q) => !q.live);
    if (!p) return;
    p.live = true;
    p.s.visible = true;
    p.s.texture = tex;
    p.s.tint = tint;
    p.s.position.set(x, y);
    p.s.rotation = rand(0, 6.28);
    p.vx = vx; p.vy = vy; p.ay = ay; p.life = p.max = life; p.s0 = s0; p.s1 = s1; p.spin = spin;
  }

  private firework(x: number, y: number) {
    const col = SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0];
    const n = 22;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rand(-0.1, 0.1);
      const sp = rand(220, 430);
      this.spawnPart(i % 3 ? this.dotTex : this.starTex, x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, 280, rand(0.9, 1.3), 1.5, 0.2, col, rand(-3, 3));
    }
  }

  private stepParts(dt: number) {
    for (const p of this.parts) {
      if (!p.live) continue;
      p.life -= dt;
      if (p.life <= 0) { p.live = false; p.s.visible = false; continue; }
      p.vy += p.ay * dt;
      p.s.x += p.vx * dt; p.s.y += p.vy * dt; p.s.rotation += p.spin * dt;
      const k = 1 - p.life / p.max;
      p.s.scale.set(p.s0 + (p.s1 - p.s0) * k);
      p.s.alpha = Math.min(1, p.life / (p.max * 0.45)) * (0.7 + 0.3 * Math.sin((p.s.x + p.s.y) * 0.05 + k * 30));
    }
  }

  private drawRings(t: number, a: number) {
    const g = this.rings;
    g.clear();
    for (let k = 0; k < 3; k++) {
      const q = (t - 0.15 - k * 0.28) / 1.4;
      if (q <= 0 || q >= 1) continue;
      g.circle(STAGE_W / 2, 960, 90 + 950 * q).stroke({ width: 22 * (1 - q) + 2, color: k % 2 ? 0xff9ad0 : 0xffd25a, alpha: 0.75 * (1 - q) * a });
    }
  }

  private drawRays(t: number, a: number) {
    const g = this.rays;
    g.clear();
    const cx = STAGE_W / 2, cy = 900, n = 18, len = 1600;
    const pulse = 0.8 + 0.2 * Math.sin(t * 3);
    const cols = this.theme.rays;
    // hai lớp tia quay ngược chiều nhau cho cảm giác rực rỡ
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < n; i++) {
        const ang = (layer ? -t * 0.22 : t * 0.16) + (i / n) * Math.PI * 2;
        const w = (layer ? 0.035 : 0.06) * (0.85 + 0.15 * Math.sin(t * 2 + i));
        g.poly([cx, cy, cx + Math.cos(ang - w) * len, cy + Math.sin(ang - w) * len, cx + Math.cos(ang + w) * len, cy + Math.sin(ang + w) * len])
          .fill({ color: cols[(i + layer * 2) % cols.length], alpha: (layer ? 0.12 : 0.16) * a * pulse });
      }
    }
  }

  private spawnNote() {
    const n = this.notes.find((q) => !q.live);
    if (!n) return;
    n.live = true;
    n.s.visible = true;
    n.s.position.set(rand(-20, STAGE_W + 20), -30);
    n.s.rotation = rand(0, 6.28);
    n.s.texture = this.fallTex[this.theme.fall];
    n.s.tint = this.theme.colors[(Math.random() * this.theme.colors.length) | 0];
    n.s.scale.set(this.theme.fall === 'coin' ? rand(1.0, 1.7) : rand(1.1, 2));
    n.vx = rand(-70, 70);
    n.vy = rand(380, 640);
    n.spin = rand(-4, 4);
  }

  private stepNotes(dt: number) {
    for (const n of this.notes) {
      if (!n.live) continue;
      n.s.x += (n.vx + Math.sin(n.s.y * 0.012 + n.spin) * 60) * dt;
      n.s.y += n.vy * dt;
      n.s.rotation += n.spin * dt;
      if (n.s.y > STAGE_H + 40) { n.live = false; n.s.visible = false; }
    }
    if (this.t < 0 && !this.notes.some((n) => n.live)) this.visible = false;
  }
}
