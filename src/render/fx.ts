import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { STAGE_W } from '../engine/slots';

interface P {
  s: Sprite; vx: number; vy: number; ay: number; life: number; max: number;
  spin: number; s0: number; s1: number; a0: number; live: boolean;
}
interface Beam { x: number; y: number; r: number; t: number; dur: number; color: number }
interface Bubble { c: Container; t: number; dur: number; key: string }
interface Floater { t: Text; vy: number; life: number }
interface Welcome { x: number; y: number; s: number; color: number; tier: 'gold' | 'pink' | 'white'; t: number; dur: number; acc: number }

const MAX_PARTICLES = 420;
const MAX_BUBBLES = 14;
const MAX_BEAMS = 2;
const MAX_WELCOME = 5;
const WELCOME_COLOR = { gold: 0xffd23f, pink: 0xff6fd0, white: 0xffffff };
const POP = [0xff4fa3, 0xffd23f, 0x2de2ff, 0x9d5cff, 0x39ff88, 0xff7a3d];

function star(g: Graphics, x: number, y: number, r: number) {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.poly(pts).fill(0xffffff);
}

/** Hạt, spotlight, bong bóng bình luận. Mọi object được pool/giới hạn để chạy lâu không phình bộ nhớ. */
export class Fx {
  readonly layer = new Container();
  /** spotlight vẽ dưới avatar nhưng trên sàn: scene chèn vào đúng chỗ */
  readonly beams = new Graphics();
  private particles: P[] = [];
  private pt: Container;
  private tex: Record<'heart' | 'star' | 'spark' | 'conf' | 'gift', Texture>;
  private active: Beam[] = [];
  private bubbles: Bubble[] = [];
  private floaters: Floater[] = [];
  private welcomes: Welcome[] = [];
  private rainLeft = 0;
  private rainAcc = 0;

  constructor(app: Application) {
    const mk = (draw: (g: Graphics) => void) => {
      const g = new Graphics(); draw(g);
      const t = app.renderer.generateTexture(g); g.destroy(); return t;
    };
    this.tex = {
      heart: mk((g) => { g.circle(-6, -4, 7.2).circle(6, -4, 7.2).fill(0xffffff); g.poly([-12.8, -1, 12.8, -1, 0, 14]).fill(0xffffff); }),
      star: mk((g) => star(g, 0, 0, 10)),
      spark: mk((g) => { g.circle(0, 0, 14).fill({ color: 0xffffff, alpha: 0.18 }).circle(0, 0, 8).fill({ color: 0xffffff, alpha: 0.5 }).circle(0, 0, 3.5).fill(0xffffff); }),
      conf: mk((g) => { g.rect(-4, -7, 8, 14).fill(0xffffff); }),
      gift: mk((g) => {
        g.roundRect(-14, -4, 28, 20, 3).fill(0xff4f6d).rect(-14, -10, 28, 8).fill(0xff7a93);
        g.rect(-3, -10, 6, 26).fill(0xffd23f);
        g.circle(-5, -13, 5).stroke({ width: 3, color: 0xffd23f }).circle(5, -13, 5).stroke({ width: 3, color: 0xffd23f });
      }),
    };
    this.beams.blendMode = 'add';
    this.pt = new Container();
    this.layer.addChild(this.pt);
    this.layer.eventMode = 'none';
  }

  private emit(o: { tex: keyof Fx['tex']; x: number; y: number; vx: number; vy: number; ay?: number; life: number; s0: number; s1: number; tint: number; spin?: number; add?: boolean; a?: number }) {
    let p = this.particles.find((q) => !q.live);
    if (!p) {
      if (this.particles.length >= MAX_PARTICLES) return;
      const s = new Sprite(this.tex[o.tex]); s.anchor.set(0.5);
      this.pt.addChild(s);
      p = { s, vx: 0, vy: 0, ay: 0, life: 0, max: 1, spin: 0, s0: 1, s1: 1, a0: 1, live: false };
      this.particles.push(p);
    }
    p.s.texture = this.tex[o.tex]; p.s.tint = o.tint; p.s.blendMode = o.add ? 'add' : 'normal';
    p.s.position.set(o.x, o.y); p.s.rotation = Math.random() * 6; p.s.visible = true;
    p.vx = o.vx; p.vy = o.vy; p.ay = o.ay ?? 0; p.life = p.max = o.life; p.spin = o.spin ?? 0;
    p.s0 = o.s0; p.s1 = o.s1; p.a0 = o.a ?? 1; p.live = true;
  }

  hearts(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.emit({
        tex: 'heart', x: x + (Math.random() - 0.5) * 50, y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 50, vy: -70 - Math.random() * 60, ay: -10, life: 1.1 + Math.random() * 0.5,
        s0: 0.4, s1: 1, tint: Math.random() < 0.7 ? 0xff4f8b : 0xff8fb8, spin: (Math.random() - 0.5) * 1.2,
      });
    }
  }

  sparkles(x: number, y: number, n: number, color: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2; const sp = 40 + Math.random() * 110;
      this.emit({
        tex: Math.random() < 0.5 ? 'star' : 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, ay: 60,
        life: 0.7 + Math.random() * 0.6, s0: 0.9, s1: 0.1, tint: color, add: true, spin: 4,
      });
    }
  }

  confetti(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8; const sp = 180 + Math.random() * 280;
      this.emit({
        tex: 'conf', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 420, life: 1.6 + Math.random(),
        s0: 1, s1: 0.8, tint: POP[(Math.random() * POP.length) | 0], spin: 8 + Math.random() * 8,
      });
    }
  }

  /** mưa pháo giấy trên toàn sân (cấp 3), có giới hạn thời gian */
  rain(sec: number) { this.rainLeft = Math.max(this.rainLeft, sec); }

  giftIcon(x: number, y: number, label: string, level: 1 | 2 | 3) {
    this.emit({ tex: 'gift', x, y, vx: 0, vy: -55, ay: 0, life: 1.8, s0: 0.5 + level * 0.25, s1: 1 + level * 0.35, tint: 0xffffff });
    if (this.floaters.length < 8) {
      const t = new Text({ text: label, style: { fontFamily: 'Arial', fontSize: 24, fontWeight: '700', fill: 0xffe27a, stroke: { color: 0x3a0b4f, width: 5 } } });
      t.anchor.set(0.5); t.position.set(x, y + 22); this.layer.addChild(t);
      this.floaters.push({ t, vy: -45, life: 1.8 });
    }
  }

  spotlight(x: number, y: number, r: number, dur: number, color = 0xfff2a8) {
    if (this.active.length >= MAX_BEAMS) this.active.shift();
    this.active.push({ x, y, r, t: 0, dur, color });
  }

  /** Đèn từ giàn truss soi xuống chỗ người mới + vòng sóng và viền sáng theo cấp (vàng: đã tặng quà, hồng: đã follow, trắng: thường). */
  welcome(x: number, y: number, scale: number, tier: 'gold' | 'pink' | 'white') {
    if (this.welcomes.length >= MAX_WELCOME) this.welcomes.shift();
    this.welcomes.push({ x, y, s: scale, color: WELCOME_COLOR[tier], tier, t: 0, dur: 3.4, acc: 0 });
    const cy = y - 50 * scale;
    if (tier === 'gold') { this.sparkles(x, cy, 24, 0xffd23f); this.confetti(x, cy, 12); }
    else if (tier === 'pink') { this.hearts(x, cy, 7); this.sparkles(x, cy, 12, 0xff6fd0); }
    else this.sparkles(x, cy, 10, 0xffffff);
  }

  bubble(key: string, x: number, y: number, text: string) {
    const old = this.bubbles.findIndex((b) => b.key === key);
    if (old >= 0) { this.bubbles[old].c.destroy({ children: true }); this.bubbles.splice(old, 1); }
    while (this.bubbles.length >= MAX_BUBBLES) this.bubbles.shift()!.c.destroy({ children: true });
    const c = new Container();
    const t = new Text({ text, style: { fontFamily: 'Arial', fontSize: 25, fontWeight: '600', fill: 0x2a1346, wordWrap: true, wordWrapWidth: 230, align: 'center' } });
    t.anchor.set(0.5);
    const w = t.width + 28; const h = t.height + 18;
    const bg = new Graphics();
    bg.roundRect(-w / 2, -h / 2, w, h, 16).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ width: 2, color: 0xff9ad0 });
    bg.poly([-8, h / 2 - 1, 8, h / 2 - 1, 0, h / 2 + 10]).fill({ color: 0xffffff, alpha: 0.95 });
    c.addChild(bg, t);
    // giữ bong bóng trong khung hình
    c.position.set(Math.min(STAGE_W - w / 2 - 6, Math.max(w / 2 + 6, x)), y - h / 2 - 10);
    c.scale.set(0.2);
    this.layer.addChild(c);
    this.bubbles.push({ c, t: 0, dur: 4.2, key });
  }

  clearBubble(key: string) {
    const i = this.bubbles.findIndex((b) => b.key === key);
    if (i >= 0) { this.bubbles[i].c.destroy({ children: true }); this.bubbles.splice(i, 1); }
  }

  reset() {
    this.particles.forEach((p) => { p.live = false; p.s.visible = false; });
    this.bubbles.forEach((b) => b.c.destroy({ children: true })); this.bubbles = [];
    this.floaters.forEach((f) => f.t.destroy()); this.floaters = [];
    this.active = []; this.welcomes = []; this.beams.clear(); this.rainLeft = 0;
  }

  update(dt: number) {
    for (const p of this.particles) {
      if (!p.live) continue;
      p.life -= dt;
      if (p.life <= 0) { p.live = false; p.s.visible = false; continue; }
      p.vy += p.ay * dt;
      p.s.x += p.vx * dt; p.s.y += p.vy * dt; p.s.rotation += p.spin * dt;
      const k = 1 - p.life / p.max;
      p.s.scale.set(p.s0 + (p.s1 - p.s0) * k);
      p.s.alpha = p.a0 * Math.min(1, p.life / (p.max * 0.4));
    }

    if (this.rainLeft > 0) {
      this.rainLeft -= dt; this.rainAcc += dt * 40;
      while (this.rainAcc >= 1) {
        this.rainAcc -= 1;
        this.emit({
          tex: 'conf', x: Math.random() * STAGE_W, y: -20, vx: (Math.random() - 0.5) * 80, vy: 120 + Math.random() * 120, ay: 40,
          life: 3, s0: 1, s1: 1, tint: POP[(Math.random() * POP.length) | 0], spin: 6, a: 0.9,
        });
      }
    }

    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]; b.t += dt;
      const pop = Math.min(1, b.t / 0.18);
      b.c.scale.set(pop < 1 ? 0.2 + 0.9 * pop : 1.1 - 0.1 * Math.min(1, (b.t - 0.18) / 0.15));
      b.c.alpha = Math.min(1, (b.dur - b.t) / 0.5);
      if (b.t >= b.dur) { b.c.destroy({ children: true }); this.bubbles.splice(i, 1); }
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]; f.life -= dt; f.t.y += f.vy * dt; f.t.alpha = Math.min(1, f.life / 0.6);
      if (f.life <= 0) { f.t.destroy(); this.floaters.splice(i, 1); }
    }

    this.beams.clear();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i]; b.t += dt;
      if (b.t >= b.dur) { this.active.splice(i, 1); continue; }
      const a = Math.min(1, b.t / 0.35, (b.dur - b.t) / 0.5) * 0.4;
      this.beams.poly([b.x - 16, 150, b.x + 16, 150, b.x + b.r, b.y, b.x - b.r, b.y]).fill({ color: b.color, alpha: a * 0.55 });
      this.beams.ellipse(b.x, b.y, b.r, b.r * 0.32).fill({ color: b.color, alpha: a });
      this.beams.ellipse(b.x, b.y, b.r * 0.6, b.r * 0.2).fill({ color: 0xffffff, alpha: a * 0.6 });
    }

    for (let i = this.welcomes.length - 1; i >= 0; i--) {
      const w = this.welcomes[i]; w.t += dt; w.acc += dt;
      if (w.t >= w.dur) { this.welcomes.splice(i, 1); continue; }
      const fade = Math.min(1, w.t / 0.3, (w.dur - w.t) / 0.7);
      const R = 95 * w.s + 30;
      const flick = 0.85 + 0.15 * Math.sin(w.t * 12);
      // chùm đèn từ truss + đốm sáng trên sàn
      this.beams.poly([w.x - 14, 230, w.x + 14, 230, w.x + R, w.y, w.x - R, w.y]).fill({ color: w.color, alpha: 0.26 * fade * flick });
      this.beams.poly([w.x - 6, 230, w.x + 6, 230, w.x + R * 0.45, w.y, w.x - R * 0.45, w.y]).fill({ color: 0xffffff, alpha: 0.14 * fade });
      this.beams.ellipse(w.x, w.y, R, R * 0.32).fill({ color: w.color, alpha: 0.4 * fade });
      this.beams.ellipse(w.x, w.y, R * 0.55, R * 0.18).fill({ color: 0xffffff, alpha: 0.3 * fade });
      // viền sáng quanh người (hào quang theo cấp)
      this.beams.ellipse(w.x, w.y - 60 * w.s, 70 * w.s + 22, 112 * w.s).fill({ color: w.color, alpha: 0.12 * fade * flick });
      this.beams.ellipse(w.x, w.y - 60 * w.s, 70 * w.s + 22, 112 * w.s).stroke({ width: 4, color: w.color, alpha: 0.65 * fade * flick });
      // hai vòng sóng nở ra trên sàn
      for (let k = 0; k < 2; k++) {
        const p = (w.t * 0.9 + k * 0.5) % 1;
        const rr = R * (0.5 + 1.2 * p);
        this.beams.ellipse(w.x, w.y, rr, rr * 0.32).stroke({ width: 5 * (1 - p) + 1, color: w.color, alpha: 0.8 * (1 - p) * fade });
      }
      // hạt bay lên theo cấp
      if (w.acc > 0.12 && w.t < w.dur - 0.8) {
        w.acc = 0;
        const px = w.x + (Math.random() - 0.5) * R * 1.4;
        this.emit({ tex: w.tier === 'pink' ? 'heart' : 'star', x: px, y: w.y - Math.random() * 20, vx: 0, vy: -90 - Math.random() * 50, life: 1.1, s0: 0.5, s1: 0.1, tint: w.color, add: w.tier !== 'pink', spin: 2 });
      }
    }
  }
}
