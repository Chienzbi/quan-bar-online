import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';

const MAX_FLY = 40;
const MAX_PETALS = 160;
const MAX_PILE = 14;
const PILE_HOLD = 30; // giây giữ bó hoa sau lần cuối có hoa đáp xuống, rồi mờ dần
const BLOOM_EVERY = 10; // cứ 10 bông thì bó hoa "nở" một lần (không hiện số trên màn hình)
const MAX_THROWN = 5; // một lượt tặng nhiều hoa chỉ ném tối đa 5 bông để không rối mắt
const PETAL_COLORS = [0xff4f6d, 0xe0214a, 0xff7a93, 0xc2183a, 0xff9ab0];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Flyer { s: Sprite; x0: number; y0: number; x1: number; y1: number; t: number; dur: number; h: number; spin: number; live: boolean }
interface Petal { s: Sprite; vx: number; vy: number; ay: number; spin: number; life: number; max: number; live: boolean }
interface Pending { at: number; x: number; y: number }

/**
 * Hiệu ứng riêng cho quà Hoa hồng (loại quà nhiều nhất):
 * mỗi bông được ném từ avatar sang bàn DJ theo vòng cung, đáp xuống rải cánh hoa, dồn lại thành bó hoa nằm ở bàn DJ;
 * cứ 10 bông bó hoa nở ra một lần với mưa cánh hoa và vòng sáng hồng. Nhẹ, không zoom camera, không che cảnh.
 * Đặt trong thế giới camera nên phóng to cùng cảnh.
 */
export class RoseFx extends Container {
  /** Gọi mỗi khi một bông đáp xuống (renderer gắn âm thanh). */
  onLand?: () => void;

  private flyers: Flyer[] = [];
  private petals: Petal[] = [];
  private pile: Sprite[] = [];
  private pileLayer = new Container();
  private ring = new Graphics();
  private pending: Pending[] = [];
  private roseTex: Texture;
  private petalTex: Texture;
  private landed = 0;
  private idle = 0;
  private ringT = -1;
  private soundGap = 0;
  private clock = 0;

  /** getTarget: toạ độ (trong thế giới camera) của mặt bàn DJ nơi hoa đáp xuống. */
  constructor(app: Application, private getTarget: () => [number, number]) {
    super();
    this.eventMode = 'none';

    const g = new Graphics();
    // cuống + lá
    g.moveTo(30, 50).lineTo(30, 90).stroke({ width: 4, color: 0x2f9e44 });
    g.poly([30, 70, 47, 60, 45, 76]).fill(0x2f9e44);
    g.poly([30, 78, 14, 70, 16, 84]).fill(0x37b24d);
    // bông hoa nhìn từ trên: nền sẫm, 5 cánh ngoài, vòng xoắn bên trong
    g.circle(30, 30, 26).fill(0xa30f2d);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.circle(30 + Math.cos(a) * 13, 30 + Math.sin(a) * 13, 12.5).fill(0xd81e45);
    }
    g.circle(30, 30, 15).fill(0xe8365d);
    g.arc(30, 30, 10, 0.3, 4.6).stroke({ width: 2.5, color: 0xff8aa3 });
    g.arc(30, 30, 5.5, 3, 7.4).stroke({ width: 2.5, color: 0xff8aa3 });
    g.circle(23, 22, 5).fill({ color: 0xffffff, alpha: 0.3 });
    this.roseTex = app.renderer.generateTexture(g);
    g.destroy();

    const pg = new Graphics();
    pg.ellipse(0, 0, 8, 13).fill(0xffffff).ellipse(-2, -3, 3.5, 7).fill({ color: 0xffffff, alpha: 0.4 });
    this.petalTex = app.renderer.generateTexture(pg);
    pg.destroy();

    this.ring.blendMode = 'add';
    this.addChild(this.pileLayer, this.ring);
    for (let i = 0; i < MAX_FLY; i++) {
      const s = new Sprite(this.roseTex);
      s.anchor.set(0.5, 0.35);
      s.visible = false;
      this.addChild(s);
      this.flyers.push({ s, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 1, h: 0, spin: 0, live: false });
    }
    for (let i = 0; i < MAX_PETALS; i++) {
      const s = new Sprite(this.petalTex);
      s.anchor.set(0.5);
      s.visible = false;
      this.addChild(s);
      this.petals.push({ s, vx: 0, vy: 0, ay: 0, spin: 0, life: 0, max: 1, live: false });
    }
  }

  /** Ném `count` bông hoa hồng từ (x, y) sang bàn DJ. */
  toss(x: number, y: number, count: number) {
    const n = Math.max(1, Math.min(MAX_THROWN, count));
    // các bông cách nhau ~0.09 giây; số bông vượt quá MAX_THROWN vẫn được tính vào bó hoa
    for (let i = 0; i < n; i++) this.pending.push({ at: this.clock + i * 0.09, x, y });
    this.landed += Math.max(0, count - n);
    this.afterLand(Math.max(0, count - n));
  }

  private launch(x: number, y: number) {
    const f = this.flyers.find((q) => !q.live);
    if (!f) { this.landOne(); return; }
    const [tx, ty] = this.getTarget();
    f.live = true;
    f.s.visible = true;
    f.x0 = x; f.y0 = y;
    f.x1 = tx + rand(-70, 70);
    f.y1 = ty + rand(-6, 8);
    f.t = 0;
    f.dur = rand(0.85, 1.15);
    f.h = rand(220, 380);
    f.spin = rand(-7, 7);
    f.s.scale.set(0.9);
    f.s.position.set(x, y);
  }

  private landOne() {
    this.landed++;
    this.afterLand(1);
  }

  /** Cập nhật đếm bông và kích hoạt nở hoa mỗi BLOOM_EVERY bông. */
  private afterLand(added: number) {
    if (added <= 0) return;
    const before = this.landed - added;
    if (Math.floor(this.landed / BLOOM_EVERY) > Math.floor(before / BLOOM_EVERY)) this.bloom();
  }

  private petalBurst(x: number, y: number, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const p = this.petals.find((q) => !q.live);
      if (!p) return;
      const a = rand(-Math.PI, 0); // toả lên rồi rơi xuống
      const sp = rand(speed * 0.4, speed);
      p.live = true;
      p.s.visible = true;
      p.s.position.set(x, y);
      p.s.rotation = rand(0, 6.28);
      p.s.tint = PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0];
      p.s.scale.set(rand(0.8, 1.5));
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.ay = 260;
      p.spin = rand(-4, 4);
      p.life = p.max = rand(1.0, 1.8);
    }
  }

  private bloom() {
    const [tx, ty] = this.getTarget();
    this.petalBurst(tx, ty - 20, 40, 520);
    this.ringT = 0;
    // bó hoa nảy lên một nhịp
    this.pileLayer.scale.set(1.12);
  }

  private addToPile(x: number, y: number) {
    let s: Sprite;
    if (this.pile.length >= MAX_PILE) s = this.pile.shift()!;
    else { s = new Sprite(this.roseTex); s.anchor.set(0.5, 0.35); this.pileLayer.addChild(s); }
    s.position.set(x, y);
    s.rotation = rand(-0.7, 0.7);
    s.scale.set(rand(0.6, 0.8));
    this.pile.push(s);
  }

  /** Xoá sạch hoa đang bay, cánh hoa và bó hoa (khi Reset quán bar). */
  reset() {
    this.pending = [];
    for (const f of this.flyers) { f.live = false; f.s.visible = false; }
    for (const p of this.petals) { p.live = false; p.s.visible = false; }
    for (const s of this.pile) s.destroy();
    this.pile = [];
    this.landed = 0;
    this.ringT = -1;
  }

  update(dt: number) {
    this.clock += dt;
    if (this.soundGap > 0) this.soundGap -= dt;

    // phóng các bông đã đến lượt
    while (this.pending.length && this.pending[0].at <= this.clock) {
      const p = this.pending.shift()!;
      this.launch(p.x, p.y);
    }

    for (const f of this.flyers) {
      if (!f.live) continue;
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      f.s.x = lerp(f.x0, f.x1, u);
      f.s.y = lerp(f.y0, f.y1, u) - f.h * 4 * u * (1 - u); // vòng cung
      f.s.rotation += f.spin * dt;
      if (u >= 1) {
        f.live = false;
        f.s.visible = false;
        this.petalBurst(f.x1, f.y1, 6, 200);
        this.addToPile(f.x1, f.y1);
        this.idle = 0;
        this.landOne();
        if (this.soundGap <= 0) { this.soundGap = 0.12; this.onLand?.(); }
      }
    }

    for (const p of this.petals) {
      if (!p.live) continue;
      p.life -= dt;
      if (p.life <= 0) { p.live = false; p.s.visible = false; continue; }
      p.vy += p.ay * dt;
      p.vx *= 1 - 0.8 * dt;
      p.s.x += (p.vx + Math.sin(this.clock * 4 + p.s.y * 0.02) * 25) * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.spin * dt;
      p.s.alpha = Math.min(1, p.life / (p.max * 0.4));
    }

    // bó hoa: nảy về kích thước thường, mờ dần khi lâu không có hoa mới
    if (this.pile.length) {
      this.idle += dt;
      const k = this.pileLayer.scale.x;
      if (k > 1) this.pileLayer.scale.set(Math.max(1, k - dt * 0.5));
      this.pileLayer.alpha = Math.min(1, Math.max(0, (PILE_HOLD + 3 - this.idle) / 3));
      if (this.idle > PILE_HOLD + 3) {
        for (const s of this.pile) s.destroy();
        this.pile = [];
      }
      // phóng to quanh tâm bàn DJ thay vì gốc toạ độ
      const [tx, ty] = this.getTarget();
      this.pileLayer.pivot.set(tx, ty);
      this.pileLayer.position.set(tx, ty);
    }

    this.ring.clear();
    if (this.ringT >= 0) {
      this.ringT += dt;
      const q = this.ringT / 1.1;
      if (q >= 1) this.ringT = -1;
      else {
        const [tx, ty] = this.getTarget();
        this.ring.ellipse(tx, ty, 40 + 330 * q, 14 + 110 * q).stroke({ width: 10 * (1 - q) + 2, color: 0xff6f9a, alpha: 0.85 * (1 - q) });
      }
    }
  }
}
