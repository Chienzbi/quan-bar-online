import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';

const MAX_ITEMS = 40;
const BALLOON_COLORS = [0xff4f6d, 0xff7a9a, 0xff9ac4, 0xe0214a, 0xffb3c7];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

interface Balloon { c: Container; x: number; y: number; vy: number; ph: number; t: number; life: number; pop: boolean }
interface Clink { l: Sprite; r: Sprite; x: number; y: number; t: number; done: boolean }

/**
 * Hai hiệu ứng nhỏ cho các quà rẻ phổ biến, không zoom camera:
 *  - Quà trái tim: chùm bóng bay hình trái tim bay lên khỏi avatar rồi nổ thành tim nhỏ.
 *  - Quà bia: hai ly bia nghiêng vào nhau cụng nhau trên đầu avatar, tia bọt bắn ra.
 * Đặt trong thế giới camera nên phóng to cùng cảnh.
 */
export class EmoteFx extends Container {
  /** Renderer gắn: bóng nổ -> nhả tim nhỏ; ly cụng -> bọt và chữ. */
  onPop?: (x: number, y: number) => void;
  onClink?: (x: number, y: number) => void;

  private balloons: Balloon[] = [];
  private clinks: Clink[] = [];
  private heartTex: Texture;
  private mugTex: Texture;

  constructor(app: Application) {
    super();
    this.eventMode = 'none';

    const hg = new Graphics();
    hg.circle(-9, -6, 11).circle(9, -6, 11).fill(0xffffff);
    hg.poly([-19.5, -1.5, 19.5, -1.5, 0, 22]).fill(0xffffff);
    hg.ellipse(-8, -9, 4, 6).fill({ color: 0xffffff, alpha: 0.0 }); // chừa chỗ highlight nếu muốn
    this.heartTex = app.renderer.generateTexture(hg);
    hg.destroy();

    const mg = new Graphics();
    mg.roundRect(0, 8, 36, 42, 6).fill(0xf5a623);
    mg.rect(4, 14, 5, 30).fill({ color: 0xffffff, alpha: 0.35 });
    mg.circle(8, 8, 8).circle(18, 5, 9).circle(28, 8, 8).fill(0xfffaf0);
    mg.arc(38, 28, 10, -1.3, 1.3).stroke({ width: 5, color: 0xe8e8e8 });
    this.mugTex = app.renderer.generateTexture(mg);
    mg.destroy();
  }

  private count() { return this.balloons.length + this.clinks.length * 2; }

  /** Chùm bóng tim bay lên từ (x, y). n = số bóng. */
  hearts(x: number, y: number, n: number) {
    const count = Math.max(2, Math.min(5, n + 1));
    for (let i = 0; i < count; i++) {
      if (this.count() >= MAX_ITEMS) return;
      const c = new Container();
      const h = new Sprite(this.heartTex);
      h.anchor.set(0.5);
      h.tint = BALLOON_COLORS[(Math.random() * BALLOON_COLORS.length) | 0];
      h.scale.set(rand(1.0, 1.5));
      const str = new Graphics();
      str.moveTo(0, 22 * h.scale.y).bezierCurveTo(8, 40, -8, 55, 0, 70).stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 });
      c.addChild(str, h);
      this.addChild(c);
      this.balloons.push({ c, x: x + (i - (count - 1) / 2) * 34 + rand(-10, 10), y, vy: rand(-170, -110), ph: rand(0, 6.28), t: -i * 0.07, life: rand(2.4, 3.2), pop: false });
    }
  }

  /** Hai ly bia cụng nhau trên đầu avatar tại (x, y). */
  beer(x: number, y: number) {
    if (this.count() >= MAX_ITEMS) return;
    const mk = (dir: 1 | -1) => {
      const s = new Sprite(this.mugTex);
      s.anchor.set(0.5, 1);
      s.scale.set(1.5 * dir, 1.5);
      this.addChild(s);
      return s;
    };
    this.clinks.push({ l: mk(1), r: mk(-1), x, y, t: 0, done: false });
  }

  update(dt: number) {
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const b = this.balloons[i];
      b.t += dt;
      if (b.t < 0) { b.c.visible = false; continue; }
      b.c.visible = true;
      b.y += b.vy * dt;
      b.c.position.set(b.x + Math.sin(b.t * 2.4 + b.ph) * 22, b.y);
      b.c.rotation = Math.sin(b.t * 2.4 + b.ph) * 0.18;
      b.c.alpha = Math.min(1, (b.life - b.t) / 0.5);
      if (b.t >= b.life) {
        if (!b.pop) this.onPop?.(b.c.x, b.c.y);
        b.c.destroy({ children: true });
        this.balloons.splice(i, 1);
      }
    }

    for (let i = this.clinks.length - 1; i >= 0; i--) {
      const k = this.clinks[i];
      k.t += dt;
      const rise = easeOut(Math.min(1, k.t / 0.5));
      const meet = easeOut(Math.min(1, Math.max(0, (k.t - 0.3) / 0.3)));
      const y = k.y - lerp(0, 40, rise);
      // hai ly lệch ra hai bên rồi nghiêng và chạm nhau
      k.l.position.set(k.x - lerp(55, 14, meet), y);
      k.r.position.set(k.x + lerp(55, 14, meet), y);
      k.l.rotation = lerp(-0.2, 0.35, meet);
      k.r.rotation = -lerp(-0.2, 0.35, meet);
      if (!k.done && k.t >= 0.6) { k.done = true; this.onClink?.(k.x, y - 40); }
      const a = Math.min(1, k.t / 0.2, (1.7 - k.t) / 0.4);
      k.l.alpha = k.r.alpha = a;
      if (k.t >= 1.7) {
        k.l.destroy();
        k.r.destroy();
        this.clinks.splice(i, 1);
      }
    }
  }

  reset() {
    for (const b of this.balloons) b.c.destroy({ children: true });
    for (const k of this.clinks) { k.l.destroy(); k.r.destroy(); }
    this.balloons = [];
    this.clinks = [];
  }
}
