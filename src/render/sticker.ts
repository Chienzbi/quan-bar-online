import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { GifFrames } from './gifFrames';
import type { Clip } from '../shared/types';
import { DANCE_CLIPS, ONE_SHOT_CLIPS, clipDuration } from './chibi/poses';

/** Giao diện chung của avatar (ChibiView và StickerView đều thỏa). */
export interface AvatarView extends Container {
  baseScale: number;
  labelScale: number;
  dead: boolean;
  setName(name: string): void;
  setBadges(follower: boolean, rank: number): void;
  play(clip: Clip): void;
  glowFor(sec: number): void;
  hideLabel(): void;
  update(dt: number, beat: number, intensity: number): void;
}

const PI = Math.PI;
const TAU = PI * 2;
const S = Math.sin;
const ab = Math.abs;
const H = 120; // chiều cao sticker ở scale 1
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutBack = (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

interface P { x: number; y: number; rot: number; sx: number; sy: number; a: number; s: number }
const REST: P = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, a: 1, s: 1 };

/** Sticker là một ảnh nguyên khối nên chỉ có chuyển động toàn thân (nhún, nghiêng, bẹp, xoay). */
function pose(clip: Clip, p: number, u: number): P {
  const o = { ...REST };
  switch (clip) {
    case 'dance_01': o.rot = S(p * PI) * 0.14; o.y = -ab(S(p * TAU)) * 6; o.x = S(p * PI) * 6; break;
    case 'dance_02': { const j = ab(S(p * PI)); o.y = -j * 26; o.sy = 1 - 0.1 * Math.pow(1 - j, 4) + 0.04 * j; o.sx = 1 + 0.08 * Math.pow(1 - j, 4); break; }
    case 'dance_03': o.rot = S(p * TAU) * 0.22; o.x = S(p * PI) * 9; o.y = -ab(S(p * PI)) * 8; break;
    case 'dance_04': { const q = p * 2; o.y = -ab(S(q * PI)) * 13; o.rot = S(q * PI) * 0.1; o.sx = 1 + 0.05 * S(q * TAU); o.sy = 1 - 0.05 * S(q * TAU); break; }
    case 'cheer': o.y = -ab(S(u * PI * 3)) * 30; o.rot = S(u * 40) * 0.12; o.sy = 1 + 0.06 * S(u * PI * 6); break;
    case 'wave': o.rot = S(u * TAU * 4) * 0.2; o.y = -ab(S(u * PI * 4)) * 4; break;
    case 'like_react': o.y = -ab(S(u * PI * 2)) * 24; o.sx = 1 + 0.08 * S(u * TAU * 3); o.sy = 1 - 0.08 * S(u * TAU * 3); break;
    case 'follow_react': { const t = Math.cos(u * TAU * 1.5); o.sx = ab(t) < 0.18 ? 0.18 * Math.sign(t || 1) : t; o.y = -ab(S(u * PI * 2)) * 32; break; }
    case 'gift_react': o.y = -ab(S(u * PI * 2)) * 40; o.rot = S(u * 22) * 0.16; o.sy = 1 + 0.07 * S(u * PI * 8); break;
    case 'spawn': { const k = easeOutBack(clamp01(u)); o.a = clamp01(u * 3); o.s = Math.max(0.01, k); o.y = -(1 - clamp01(u)) * 70; break; }
    case 'despawn': o.a = 1 - clamp01(u); o.y = -u * 45; o.s = 1 - 0.15 * u; break;
    default: o.y = -ab(S(p * PI)) * 3; o.sy = 1 + 0.025 * S(p * TAU); // idle
  }
  return o;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class StickerView extends Container implements AvatarView {
  baseScale = 1;
  labelScale = 1;
  dead = false;
  private shadow = new Graphics();
  private aura = new Graphics();
  private body: Sprite;
  private nameTag = new Container();
  private pill = new Graphics();
  private nameText: Text;
  private follower = false;
  private rank = 0;
  private speed = 0.9 + Math.random() * 0.2;
  private offset = Math.random() * 4;
  private loop: Clip = 'dance_01';
  private loopLeft = 0;
  private shot: { clip: Clip; t: number; dur: number } | null = null;
  private last: P = { ...REST };
  private from: P | null = null;
  private blendT = 0;
  private glow = 0;
  private t = 0;
  private gif: GifFrames | null = null;
  private gifT = 0;
  private gifI = 0;

  constructor(src: Texture | GifFrames, name: string) {
    super();
    this.shadow.ellipse(0, 1, 26, 7).fill({ color: 0x000000, alpha: 0.35 });
    this.aura.blendMode = 'add';
    this.aura.circle(0, -H / 2, 50).fill({ color: 0xffd23f, alpha: 0.28 }).circle(0, -H / 2, 32).fill({ color: 0xffffff, alpha: 0.2 });
    this.aura.visible = false;

    this.gif = src instanceof Texture ? null : src;
    this.body = new Sprite(this.gif ? this.gif.textures[0] : (src as Texture));
    if (this.gif) this.gifT = Math.random() * this.gif.total;
    this.body.anchor.set(0.5, 1);
    const k = H / (this.body.texture.height || H);
    this.body.scale.set(k);

    this.nameText = new Text({
      text: name,
      style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 22, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x1a0b33, width: 4 } },
    });
    this.nameText.anchor.set(0.5, 0.5);
    this.nameTag.addChild(this.pill, this.nameText);
    this.nameTag.position.set(0, -H - 16);
    this.setName(name);

    this.addChild(this.shadow, this.aura, this.body, this.nameTag);
    this.eventMode = 'none';
    this.pickLoop();
  }

  setName(name: string) {
    this.nameText.text = name.length > 14 ? name.slice(0, 13) + '…' : name;
    this.redrawPill();
  }

  setBadges(follower: boolean, rank: number) {
    this.follower = follower; this.rank = rank;
    this.redrawPill();
  }

  private redrawPill() {
    const badgesW = (this.follower ? 18 : 0) + (this.rank ? 18 : 0);
    const w = this.nameText.width + 18 + badgesW;
    this.pill.clear().roundRect(-w / 2, -15, w, 30, 15).fill({ color: 0x120728, alpha: 0.62 });
    let x = -w / 2 + 14;
    if (this.rank) { this.pill.circle(x, 0, 7).fill(this.rank === 1 ? 0xffd23f : this.rank === 2 ? 0xdfe6ff : 0xffa86b); x += 18; }
    if (this.follower) { this.pill.circle(x, 0, 6).fill(0xff4f9a); }
    this.nameText.x = -w / 2 + 9 + badgesW + this.nameText.width / 2;
  }

  hideLabel() { this.nameTag.visible = false; }
  glowFor(sec: number) { this.glow = sec; }

  play(clip: Clip) {
    if (this.dead) return;
    if (ONE_SHOT_CLIPS.has(clip)) {
      if (clip !== 'spawn') { this.from = { ...this.last }; this.blendT = 0.16; }
      this.shot = { clip, t: 0, dur: clipDuration(clip) };
      if (clip === 'despawn') this.dead = true;
    } else { this.loop = clip; this.shot = null; }
  }

  private pickLoop() {
    const dances = DANCE_CLIPS;
    const next = dances[Math.floor(Math.random() * dances.length)];
    if (next !== this.loop) { this.from = { ...this.last }; this.blendT = 0.3; }
    this.loop = next;
    this.loopLeft = 6 + Math.random() * 10;
  }

  update(dt: number, beat: number, intensity: number) {
    this.t += dt;
    const p = beat * this.speed + this.offset;
    let cur: P;
    if (this.shot) {
      this.shot.t += dt;
      const u = Math.min(1, this.shot.t / this.shot.dur);
      cur = pose(this.shot.clip, p, u);
      if (u >= 1 && !this.dead) { this.shot = null; this.from = { ...this.last }; this.blendT = 0.2; }
    } else {
      this.loopLeft -= dt;
      if (this.loopLeft <= 0) this.pickLoop();
      cur = pose(this.loop, p, 0);
    }
    // cường độ (a, s giữ nguyên)
    cur = { ...cur, x: cur.x * intensity, y: cur.y * intensity, rot: cur.rot * intensity, sx: 1 + (cur.sx - 1) * intensity, sy: 1 + (cur.sy - 1) * intensity };
    if (this.blendT > 0 && this.from) {
      this.blendT -= dt;
      const f = 1 - Math.max(0, this.blendT) / 0.25;
      const a = this.from;
      cur = { x: lerp(a.x, cur.x, f), y: lerp(a.y, cur.y, f), rot: lerp(a.rot, cur.rot, f), sx: lerp(a.sx, cur.sx, f), sy: lerp(a.sy, cur.sy, f), a: lerp(a.a, cur.a, f), s: lerp(a.s, cur.s, f) };
    }
    // GIF đã có sẵn động tác: không lắc/nghiêng sang hai bên
    if (this.gif) cur = { ...cur, x: 0, y: this.shot?.clip === 'spawn' || this.shot?.clip === 'despawn' ? cur.y : 0, rot: 0, sx: 1, sy: 1 };
    this.last = cur;

    if (this.gif) {
      this.gifT = (this.gifT + dt) % this.gif.total;
      let acc = 0, idx = 0;
      while (idx < this.gif.delays.length - 1 && acc + this.gif.delays[idx] <= this.gifT) acc += this.gif.delays[idx++];
      if (idx !== this.gifI) { this.gifI = idx; this.body.texture = this.gif.textures[idx]; }
    }

    this.body.position.set(cur.x, cur.y);
    this.body.rotation = cur.rot;
    const k = H / (this.body.texture.height || H);
    this.body.scale.set(k * cur.sx, k * cur.sy);

    const air = Math.max(0, -cur.y) / 40;
    this.shadow.scale.set(1 - air * 0.3);
    this.shadow.alpha = 1 - air * 0.4;

    if (this.glow > 0) {
      this.glow -= dt;
      this.aura.visible = true;
      this.aura.alpha = Math.min(1, this.glow) * (0.8 + 0.2 * Math.sin(this.t * 10));
    } else if (this.aura.visible) this.aura.visible = false;

    const sc = this.baseScale * cur.s;
    this.scale.set(sc);
    this.alpha = cur.a;
    this.nameTag.scale.set(this.labelScale / sc);
  }
}
