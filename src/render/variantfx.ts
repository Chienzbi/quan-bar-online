import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { STAGE_H, STAGE_W } from '../engine/slots';

export interface VariantShow {
  name: string;
  giftName: string;
  /** Gọi khi hiệu ứng thật sự bắt đầu / kết thúc (sau khi chờ hàng đợi). */
  onStart?: () => void;
  onEnd?: () => void;
}

type Kind = 'petals' | 'coins' | 'pillars' | 'fireworks' | 'meteors' | 'balloons';
const KINDS: Kind[] = ['petals', 'coins', 'pillars', 'fireworks', 'meteors', 'balloons'];

const DUR = 4.2;
const MIN_GAP = 0.8;
const MAX_QUEUE = 3;
const POOL = 140;
const PARTS = 260;
const PETAL_COLORS = [0xff6fa8, 0xff9ac4, 0xe0386f, 0xffb3d1, 0xff4f8b];
const COIN_COLORS = [0xffd23f, 0xffc107, 0xffe27a, 0xffb300];
const PILLAR_COLORS = [0xffd25a, 0xff7ac8, 0x6ff0ff, 0xff9a3a, 0xb98cff];
const BALLOON_COLORS = [0xff4f6d, 0xffd23f, 0x4cd964, 0x3db8ff, 0xb98cff, 0xff9a3a, 0xff7ac8];
const SPARK_COLORS = [0xffe27a, 0xff9ad0, 0x7ff0ff, 0xffffff, 0xffb347];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

type Mode = 'petal' | 'coin' | 'balloon';
interface Bit { s: Sprite; vx: number; vy: number; spin: number; ph: number; live: boolean; mode: Mode }
interface Part { s: Sprite; vx: number; vy: number; ay: number; life: number; max: number; live: boolean }
interface Meteor { x: number; y: number; vx: number; vy: number; life: number; max: number }

/**
 * Hiệu ứng quà cấp 2: sáu biến thể luân phiên
 * (mưa cánh hoa hồng, mưa đồng xu vàng, năm cột sáng, pháo hoa liên tiếp, mưa sao băng, bóng bay nhiều màu),
 * kèm dải cảm ơn. Nhẹ hơn cảnh quà cấp 3: không làm tối cả màn hình. Nằm ngoài camera.
 */
export class VariantFx extends Container {
  private bits: Bit[] = [];
  private parts: Part[] = [];
  private meteors: Meteor[] = [];
  private pillars = new Graphics();
  private meteorG = new Graphics();
  private partLayer = new Container();
  private banner = new Container();
  private bannerBg = new Graphics();
  private bannerText: Text;
  private petalTex: Texture;
  private coinTex: Texture;
  private balloonTex: Texture;
  private starTex: Texture;
  private dotTex: Texture;
  private queue: VariantShow[] = [];
  private cur?: VariantShow;
  private kind: Kind = 'petals';
  private nextIdx = Math.floor(Math.random() * KINDS.length);
  private t = -1;
  private gap = 0;
  private acc = 0;
  private fw = 0;
  private mt = 0;

  /** isBlocked: true khi cảnh quà cấp 3 đang chiếu thì hàng đợi chờ, tránh chồng hai cảnh. */
  constructor(app: Application, private isBlocked: () => boolean) {
    super();
    this.eventMode = 'none';
    this.visible = false;

    const pg = new Graphics();
    pg.ellipse(0, 0, 9, 15).fill(0xffffff).ellipse(-2, -3, 4, 8).fill({ color: 0xffffff, alpha: 0.45 });
    this.petalTex = app.renderer.generateTexture(pg);
    pg.destroy();
    const cg = new Graphics();
    cg.circle(0, 0, 15).fill(0xffffff).circle(0, 0, 10.5).stroke({ width: 2.5, color: 0x000000, alpha: 0.28 }).circle(0, 0, 4).fill({ color: 0x000000, alpha: 0.2 });
    this.coinTex = app.renderer.generateTexture(cg);
    cg.destroy();
    // bóng bay: thân hình trứng + núm + dây mảnh buông xuống
    const bg = new Graphics();
    bg.ellipse(0, 0, 20, 26).fill(0xffffff);
    bg.poly([-4, 25, 4, 25, 0, 31]).fill(0xffffff);
    bg.ellipse(-7, -10, 5, 9).fill({ color: 0x000000, alpha: 0 }); // giữ vùng cho highlight
    bg.moveTo(0, 31).bezierCurveTo(6, 45, -6, 58, 0, 74).stroke({ width: 1.6, color: 0xffffff, alpha: 0.75 });
    this.balloonTex = app.renderer.generateTexture(bg);
    bg.destroy();
    const sg = new Graphics();
    sg.poly([0, -16, 3.5, -3.5, 16, 0, 3.5, 3.5, 0, 16, -3.5, 3.5, -16, 0, -3.5, -3.5]).fill(0xffffff);
    this.starTex = app.renderer.generateTexture(sg);
    sg.destroy();
    const dg = new Graphics();
    dg.circle(0, 0, 10).fill({ color: 0xffffff, alpha: 0.25 }).circle(0, 0, 5).fill({ color: 0xffffff, alpha: 0.6 }).circle(0, 0, 2.5).fill(0xffffff);
    this.dotTex = app.renderer.generateTexture(dg);
    dg.destroy();

    this.pillars.blendMode = 'add';
    this.meteorG.blendMode = 'add';
    this.addChild(this.pillars, this.meteorG);
    for (let i = 0; i < POOL; i++) {
      const s = new Sprite(this.petalTex);
      s.anchor.set(0.5);
      s.visible = false;
      this.addChild(s);
      this.bits.push({ s, vx: 0, vy: 0, spin: 0, ph: 0, live: false, mode: 'petal' });
    }
    this.partLayer.blendMode = 'add';
    this.addChild(this.partLayer);
    for (let i = 0; i < PARTS; i++) {
      const s = new Sprite(this.dotTex);
      s.anchor.set(0.5);
      s.visible = false;
      this.partLayer.addChild(s);
      this.parts.push({ s, vx: 0, vy: 0, ay: 0, life: 0, max: 1, live: false });
    }

    this.bannerText = new Text({ text: '', style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 36, fontWeight: '800', fill: 0xffe27a, stroke: { color: 0x2a0b4f, width: 7 } } });
    this.bannerText.anchor.set(0.5);
    this.banner.addChild(this.bannerBg, this.bannerText);
    this.addChild(this.banner);
  }

  get busy() { return this.t >= 0; }

  play(show: VariantShow) {
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push(show);
  }

  private start(show: VariantShow) {
    this.cur = show;
    show.onStart?.();
    this.kind = KINDS[this.nextIdx % KINDS.length];
    this.nextIdx++;
    this.bannerText.text = `Cảm ơn ${show.name} đã tặng ${show.giftName}!`;
    this.bannerText.scale.set(Math.min(1, 940 / Math.max(1, this.bannerText.width)));
    const bw = Math.min(1000, this.bannerText.width * this.bannerText.scale.x + 90);
    this.bannerBg.clear()
      .roundRect(-bw / 2, -36, bw, 72, 36).fill({ color: 0x1a0638, alpha: 0.85 })
      .roundRect(-bw / 2, -36, bw, 72, 36).stroke({ width: 4, color: 0xffd23f });
    this.t = 0;
    this.acc = 0;
    this.fw = 0.2;
    this.mt = 0;
    this.visible = true;
  }

  private spawn(mode: Mode) {
    const b = this.bits.find((q) => !q.live);
    if (!b) return;
    b.live = true;
    b.mode = mode;
    b.s.visible = true;
    b.ph = rand(0, 6.28);
    if (mode === 'coin') {
      b.s.texture = this.coinTex;
      b.s.position.set(rand(-20, STAGE_W + 20), -30);
      b.s.rotation = rand(0, 6.28);
      b.s.tint = COIN_COLORS[(Math.random() * COIN_COLORS.length) | 0];
      b.s.scale.set(rand(1.1, 1.9));
      b.vx = rand(-40, 40);
      b.vy = rand(520, 820);
      b.spin = rand(5, 10);
    } else if (mode === 'balloon') {
      b.s.texture = this.balloonTex;
      b.s.position.set(rand(40, STAGE_W - 40), STAGE_H + 90);
      b.s.rotation = 0;
      b.s.tint = BALLOON_COLORS[(Math.random() * BALLOON_COLORS.length) | 0];
      b.s.scale.set(rand(1.2, 2));
      b.vx = rand(-20, 20);
      b.vy = rand(-340, -220);
      b.spin = rand(1.5, 3);
    } else {
      b.s.texture = this.petalTex;
      b.s.position.set(rand(-20, STAGE_W + 20), -30);
      b.s.rotation = rand(0, 6.28);
      b.s.tint = PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0];
      b.s.scale.set(rand(1.1, 2.1));
      b.vx = rand(-30, 30);
      b.vy = rand(140, 260);
      b.spin = rand(-2.5, 2.5);
    }
  }

  private stepBits(dt: number) {
    for (const b of this.bits) {
      if (!b.live) continue;
      b.ph += dt;
      if (b.mode === 'coin') {
        b.s.x += b.vx * dt;
        b.s.y += b.vy * dt;
        b.s.scale.x = Math.abs(Math.cos(b.ph * b.spin)) * 1.6 + 0.15; // quay lật mặt đồng xu
      } else if (b.mode === 'balloon') {
        b.s.x += (b.vx + Math.sin(b.ph * b.spin) * 40) * dt;
        b.s.y += b.vy * dt;
        b.s.rotation = Math.sin(b.ph * b.spin) * 0.12;
      } else {
        // cánh hoa đung đưa khi rơi
        b.s.x += (b.vx + Math.sin(b.ph * 2.2) * 70) * dt;
        b.s.y += b.vy * dt;
        b.s.rotation += b.spin * dt;
      }
      if (b.s.y > STAGE_H + 120 || b.s.y < -140) { b.live = false; b.s.visible = false; }
    }
  }

  private spawnPart(tex: Texture, x: number, y: number, vx: number, vy: number, ay: number, life: number, tint: number, scale: number) {
    const p = this.parts.find((q) => !q.live);
    if (!p) return;
    p.live = true;
    p.s.visible = true;
    p.s.texture = tex;
    p.s.tint = tint;
    p.s.position.set(x, y);
    p.s.rotation = rand(0, 6.28);
    p.s.scale.set(scale);
    p.vx = vx; p.vy = vy; p.ay = ay; p.life = p.max = life;
  }

  private firework(x: number, y: number) {
    const col = SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0];
    const n = 26;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rand(-0.08, 0.08);
      const sp = rand(240, 460);
      this.spawnPart(i % 3 ? this.dotTex : this.starTex, x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, 300, rand(1.0, 1.4), col, 1.5);
    }
  }

  private stepParts(dt: number) {
    for (const p of this.parts) {
      if (!p.live) continue;
      p.life -= dt;
      if (p.life <= 0) { p.live = false; p.s.visible = false; continue; }
      p.vy += p.ay * dt;
      p.vx *= 1 - 0.5 * dt;
      p.s.x += p.vx * dt; p.s.y += p.vy * dt;
      p.s.alpha = Math.min(1, p.life / (p.max * 0.5));
      p.s.scale.set(Math.max(0.15, p.s.scale.x * (1 - 0.7 * dt)));
    }
  }

  private drawMeteors(dt: number, active: boolean) {
    if (active) {
      this.mt -= dt;
      if (this.mt <= 0) {
        this.mt = rand(0.07, 0.16);
        const x = rand(STAGE_W * 0.3, STAGE_W + 250);
        const sp = rand(1300, 1900);
        this.meteors.push({ x, y: rand(-200, 400), vx: -sp * 0.55, vy: sp * 0.85, life: 0, max: rand(0.6, 0.95) });
      }
    }
    const g = this.meteorG;
    g.clear();
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.life += dt;
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.life >= m.max) { this.meteors.splice(i, 1); continue; }
      const a = Math.min(1, (m.max - m.life) / 0.25);
      const tx = m.x - m.vx * 0.16, ty = m.y - m.vy * 0.16; // đuôi
      g.moveTo(tx, ty).lineTo(m.x, m.y).stroke({ width: 9, color: 0xffc24a, alpha: 0.22 * a });
      g.moveTo(m.x - m.vx * 0.09, m.y - m.vy * 0.09).lineTo(m.x, m.y).stroke({ width: 4, color: 0xffffff, alpha: 0.9 * a });
      g.circle(m.x, m.y, 7).fill({ color: 0xffffff, alpha: 0.95 * a });
    }
  }

  private drawPillars(t: number, fade: number) {
    const g = this.pillars;
    g.clear();
    if (this.kind !== 'pillars') return;
    const base = 1520;
    for (let i = 0; i < 5; i++) {
      const x = 150 + i * 195;
      const p = Math.min(1, Math.max(0, (t - i * 0.15) / 0.55));
      if (p <= 0) continue;
      const h = 1500 * easeOut(p);
      const col = PILLAR_COLORS[i % PILLAR_COLORS.length];
      const pulse = 0.85 + 0.15 * Math.sin(t * 6 + i);
      g.rect(x - 70, base - h, 140, h).fill({ color: col, alpha: 0.08 * fade * pulse });
      g.rect(x - 40, base - h, 80, h).fill({ color: col, alpha: 0.14 * fade * pulse });
      g.rect(x - 14, base - h, 28, h).fill({ color: 0xffffff, alpha: 0.28 * fade * pulse });
      g.ellipse(x, base, 110, 30).fill({ color: col, alpha: 0.35 * fade });
    }
  }

  update(dt: number) {
    if (this.gap > 0) this.gap -= dt;
    if (this.t < 0) {
      if (this.queue.length && this.gap <= 0 && !this.isBlocked()) this.start(this.queue.shift()!);
      else {
        this.stepBits(dt);
        this.stepParts(dt);
        this.drawMeteors(dt, false);
        if (!this.bits.some((b) => b.live) && !this.parts.some((p) => p.live) && !this.meteors.length) this.visible = false;
      }
      return;
    }
    this.t += dt;
    if (this.t >= DUR) {
      this.t = -1;
      this.gap = MIN_GAP;
      this.pillars.clear();
      this.banner.alpha = 0;
      const done = this.cur;
      this.cur = undefined;
      done?.onEnd?.();
      return;
    }
    const t = this.t;
    const fade = Math.min(1, t / 0.4, (DUR - t) / 0.8);
    const running = t < DUR - 1;

    if (running) {
      const rate = this.kind === 'petals' ? 32 : this.kind === 'coins' ? 40 : this.kind === 'balloons' ? 12 : 0;
      this.acc += dt * rate;
      while (this.acc >= 1) { this.acc -= 1; this.spawn(this.kind === 'coins' ? 'coin' : this.kind === 'balloons' ? 'balloon' : 'petal'); }
      if (this.kind === 'fireworks') {
        this.fw -= dt;
        if (this.fw <= 0) { this.fw = rand(0.3, 0.5); this.firework(rand(150, 930), rand(420, 1200)); }
      }
    }
    this.stepBits(dt);
    this.stepParts(dt);
    this.drawPillars(t, fade);
    this.drawMeteors(dt, running && this.kind === 'meteors');

    this.banner.position.set(STAGE_W / 2 + (1 - easeOutBack(Math.min(1, t / 0.6))) * -900, 330);
    this.banner.alpha = fade;
  }
}
