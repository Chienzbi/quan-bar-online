import { Container, Graphics, Text } from 'pixi.js';
import type { Clip } from '../../shared/types';
import { shade, TEMPLATES, type ChibiTemplate } from './templates';
import {
  applyIntensity, clipDuration, DANCE_CLIPS, evalClip, lerpPose, ONE_SHOT_CLIPS, REST, type Pose,
} from './poses';

const CY = -26; // tâm đầu trong hệ tọa độ của head
const HIP_Y = -26; // hông cách chân 26px
const OUTLINE = 0x2b1b3a;

function star(g: Graphics, x: number, y: number, r: number, color: number) {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.poly(pts).fill(color);
}

// ---------------------------------------------------------------- hair

function hairBack(g: Graphics, t: ChibiTemplate) {
  const c = t.hairColor;
  switch (t.hair) {
    case 'bob': g.roundRect(-36, CY - 26, 72, 52, 20).fill(c); break;
    case 'long': g.roundRect(-35, CY - 26, 70, 74, 24).fill(c); break;
    case 'twin':
      g.ellipse(-40, CY + 14, 10, 21).fill(c).ellipse(40, CY + 14, 10, 21).fill(c);
      g.circle(-37, CY - 2, 4).fill(0xffffff).circle(37, CY - 2, 4).fill(0xffffff);
      break;
    case 'afro': g.circle(0, CY - 8, 44).fill(c); break;
    case 'pony': g.ellipse(36, CY + 12, 9, 22).fill(c).circle(33, CY - 4, 4).fill(0xff4fa3); break;
    default: break;
  }
}

function hairFront(g: Graphics, t: ChibiTemplate) {
  const c = t.hairColor;
  const dark = shade(c, 0.78);
  const bangs = (zig = true) => {
    g.moveTo(-33, CY + 2).quadraticCurveTo(-36, CY - 36, 0, CY - 33).quadraticCurveTo(36, CY - 36, 33, CY + 2);
    if (zig) {
      g.lineTo(25, CY - 9).lineTo(17, CY - 15).lineTo(9, CY - 7).lineTo(0, CY - 16)
        .lineTo(-9, CY - 7).lineTo(-17, CY - 15).lineTo(-25, CY - 9);
    } else {
      g.lineTo(26, CY - 12).lineTo(-26, CY - 12);
    }
    g.closePath().fill(c);
  };
  switch (t.hair) {
    case 'short': bangs(); break;
    case 'bob': case 'long': bangs(false); g.rect(-33, CY - 14, 12, 28).fill(c).rect(21, CY - 14, 12, 28).fill(c); break;
    case 'twin': case 'pony': bangs(); break;
    case 'spiky': {
      bangs();
      const tips = [[-30, -46], [-18, -56], [-5, -50], [9, -58], [22, -50], [32, -42]];
      tips.forEach(([x, y], i) => {
        const bx = -32 + i * 12;
        g.poly([bx, CY - 26, x, CY + y + 6, bx + 13, CY - 28]).fill(dark);
      });
      break;
    }
    case 'bun': bangs(); g.circle(0, CY - 38, 12).fill(c).circle(0, CY - 38, 12).stroke({ width: 1.5, color: dark }); break;
    case 'mohawk': g.poly([-9, CY - 22, -6, CY - 52, 0, CY - 40, 6, CY - 55, 9, CY - 22]).fill(c); break;
    case 'afro': g.moveTo(-26, CY - 10).quadraticCurveTo(0, CY - 40, 26, CY - 10).lineTo(18, CY - 14).lineTo(0, CY - 20).lineTo(-18, CY - 14).closePath().fill(c); break;
    default: break;
  }
}

// ---------------------------------------------------------------- face

function ears(g: Graphics, t: ChibiTemplate) {
  const s = t.skin;
  switch (t.species) {
    case 'cat':
      for (const d of [-1, 1]) {
        g.poly([d * 12, CY - 22, d * 30, CY - 28, d * 24, CY - 50]).fill(s);
        g.poly([d * 16, CY - 25, d * 26, CY - 29, d * 23, CY - 42]).fill(0xff9ab0);
      }
      break;
    case 'bear': case 'panda':
      for (const d of [-1, 1]) {
        g.circle(d * 24, CY - 22, 11).fill(t.species === 'panda' ? 0x20202c : s);
        g.circle(d * 24, CY - 22, 5.5).fill(t.species === 'panda' ? 0x4a4a5c : shade(s, 1.25));
      }
      break;
    case 'bunny':
      for (const d of [-1, 1]) {
        g.ellipse(d * 14, CY - 50, 8, 22).fill(s).stroke({ width: 1, color: 0xd8d0e8 });
        g.ellipse(d * 14, CY - 48, 4, 15).fill(0xffa8c4);
      }
      break;
    case 'dog':
      for (const d of [-1, 1]) g.ellipse(d * 32, CY - 4, 10, 19).fill(shade(s, 0.72));
      break;
    default: break;
  }
}

function face(g: Graphics, t: ChibiTemplate) {
  g.ellipse(0, CY, 31, 27).fill(t.skin).stroke({ width: 2.6, color: 0x2b1b3a, alpha: 0.9 });
  if (t.species !== 'human') {
    const m = shade(t.skin, 1.14);
    g.ellipse(0, CY + 11, 13, 9).fill(t.species === 'panda' || t.species === 'bunny' ? 0xfff2f2 : m);
    g.ellipse(0, CY + 6, 3.2, 2.4).fill(t.species === 'cat' ? 0xff7a9a : OUTLINE);
    if (t.species === 'cat') {
      for (const d of [-1, 1]) {
        g.moveTo(d * 14, CY + 9).lineTo(d * 27, CY + 6).moveTo(d * 14, CY + 12).lineTo(d * 27, CY + 14)
          .stroke({ width: 1.2, color: 0x6b5b7b });
      }
    }
  }
  if (t.species === 'panda') {
    for (const d of [-1, 1]) g.ellipse(d * 11.5, CY + 3, 8, 10).fill(0x20202c);
  }
}

function eyes(t: ChibiTemplate): Container {
  const c = new Container();
  const g = new Graphics();
  const col = t.species === 'panda' ? 0xffffff : OUTLINE;
  const open = (x: number) => {
    g.ellipse(x, CY + 3, 4.6, 6.2).fill(col);
    g.circle(x + 1.5, CY + 0.6, 1.9).fill(0xffffff).circle(x - 1.2, CY + 5, 0.9).fill(0xffffff);
  };
  const arc = (x: number) => g.moveTo(x - 4.5, CY + 5).quadraticCurveTo(x, CY - 3, x + 4.5, CY + 5).stroke({ width: 2.2, color: OUTLINE, cap: 'round' });
  switch (t.face) {
    case 'happy': arc(-11); arc(11); break;
    case 'wink': open(-11); arc(11); break;
    case 'star': star(g, -11, CY + 3, 6.5, 0xffd23f); star(g, 11, CY + 3, 6.5, 0xffd23f); break;
    case 'cool':
      open(-11); open(11);
      g.rect(-17, CY - 4, 12, 4).fill({ color: t.skin }).rect(5, CY - 4, 12, 4).fill({ color: t.skin });
      g.moveTo(-16, CY - 3).lineTo(-6, CY - 3).moveTo(6, CY - 3).lineTo(16, CY - 3).stroke({ width: 1.8, color: OUTLINE });
      break;
    default: open(-11); open(11);
  }
  c.addChild(g);
  return c;
}

function accessory(g: Graphics, t: ChibiTemplate) {
  const a = t.accColor;
  switch (t.acc) {
    case 'cap':
      g.moveTo(-31, CY - 8).quadraticCurveTo(-32, CY - 42, 0, CY - 40).quadraticCurveTo(32, CY - 42, 31, CY - 8).closePath().fill(a);
      g.roundRect(-2, CY - 14, 40, 7, 3.5).fill(shade(a, 0.8));
      g.circle(0, CY - 40, 3).fill(0xffffff);
      break;
    case 'glasses':
      g.circle(-11, CY + 3, 8.5).stroke({ width: 2, color: a }).circle(11, CY + 3, 8.5).stroke({ width: 2, color: a });
      g.moveTo(-2.5, CY + 3).lineTo(2.5, CY + 3).stroke({ width: 2, color: a });
      break;
    case 'shades':
      g.roundRect(-20, CY - 3, 17, 11, 4).fill(a).roundRect(3, CY - 3, 17, 11, 4).fill(a);
      g.rect(-3, CY - 1, 6, 2.5).fill(a);
      g.moveTo(-18, CY - 1).lineTo(-12, CY - 1).stroke({ width: 1.5, color: 0xffffff, alpha: 0.6 });
      break;
    case 'phones':
      g.moveTo(-33, CY + 2).bezierCurveTo(-33, CY - 48, 33, CY - 48, 33, CY + 2).stroke({ width: 5, color: 0x2b2250 });
      g.ellipse(-33, CY + 5, 7, 11).fill(a).ellipse(33, CY + 5, 7, 11).fill(a);
      g.ellipse(-33, CY + 5, 3, 6).fill(0x2b2250).ellipse(33, CY + 5, 3, 6).fill(0x2b2250);
      break;
    case 'crown':
      g.poly([-16, CY - 27, -16, CY - 42, -8, CY - 33, 0, CY - 46, 8, CY - 33, 16, CY - 42, 16, CY - 27]).fill(a).stroke({ width: 1, color: 0xb88a00 });
      g.circle(0, CY - 33, 2.2).fill(0xff4f6d);
      break;
    case 'bow':
      g.poly([20, CY - 24, 38, CY - 34, 38, CY - 14]).fill(a).poly([20, CY - 24, 2, CY - 34, 2, CY - 14]).fill(a);
      g.circle(20, CY - 24, 4.5).fill(shade(a, 0.8));
      break;
    case 'band':
      g.moveTo(-31, CY - 12).quadraticCurveTo(0, CY - 26, 31, CY - 12).stroke({ width: 6, color: a });
      break;
    case 'star':
      star(g, -21, CY - 20, 8, a);
      break;
    default: break;
  }
}

// ---------------------------------------------------------------- body parts

const LONG_SLEEVE = new Set(['hoodie', 'jacket', 'uniform']);

function drawTorso(g: Graphics, t: ChibiTemplate) {
  const c = t.top;
  g.roundRect(-15, -30, 30, 36, 9).fill(c).stroke({ width: 2.2, color: 0x2b1b3a, alpha: 0.9 });
  switch (t.outfit) {
    case 'hoodie':
      g.roundRect(-9, -9, 18, 9, 3).fill(shade(c, 0.82));
      g.ellipse(0, -29, 13, 5).fill(shade(c, 0.9));
      g.moveTo(-4, -26).lineTo(-4, -16).moveTo(4, -26).lineTo(4, -16).stroke({ width: 1.6, color: t.top2 });
      break;
    case 'tee':
      g.rect(-15, -18, 30, 4).fill({ color: t.top2, alpha: 0.85 });
      g.ellipse(0, -30, 6, 3).fill(t.skin);
      break;
    case 'jacket':
      g.moveTo(0, -30).lineTo(0, 6).stroke({ width: 2, color: t.top2 });
      g.poly([-13, -30, 0, -22, -3, -30]).fill(t.top2).poly([13, -30, 0, -22, 3, -30]).fill(t.top2);
      break;
    case 'dress':
      g.poly([-15, -4, -23, 15, 23, 15, 15, -4]).fill(c).stroke({ width: 1.2, color: shade(c, 0.6), alpha: 0.8 });
      g.rect(-23, 12, 46, 3).fill(t.top2);
      g.ellipse(0, -30, 6, 3).fill(t.skin);
      break;
    case 'uniform':
      g.poly([-12, -30, 0, -20, -4, -30]).fill(t.top2).poly([12, -30, 0, -20, 4, -30]).fill(t.top2);
      g.poly([0, -22, -3, -8, 0, -4, 3, -8]).fill(0xe0262f);
      break;
    case 'overalls':
      g.rect(-15, -30, 30, 14).fill(t.top2);
      g.roundRect(-11, -16, 22, 22, 4).fill(c);
      g.rect(-11, -30, 4, 14).fill(c).rect(7, -30, 4, 14).fill(c);
      g.circle(-9, -16, 1.8).fill(0xffd23f).circle(9, -16, 1.8).fill(0xffd23f);
      break;
  }
}

function makeLeg(t: ChibiTemplate, side: number): Container {
  const c = new Container();
  const g = new Graphics();
  const color = t.outfit === 'dress' ? t.skin : t.pants;
  g.roundRect(-5, 0, 10, 22, 5).fill(color);
  g.ellipse(side * 0.8, 22.5, 8.5, 4.6).fill(t.shoes).stroke({ width: 1, color: shade(t.shoes, 0.6), alpha: 0.7 });
  c.addChild(g);
  c.position.set(side * 8, 0);
  return c;
}

function makeArm(t: ChibiTemplate, side: number): { arm: Container; fore: Container } {
  const arm = new Container();
  const fore = new Container();
  const sleeve = t.top;
  const longSleeve = LONG_SLEEVE.has(t.outfit);
  const u = new Graphics();
  u.roundRect(-4, 0, 8, 15, 4).fill(t.outfit === 'overalls' ? t.top2 : sleeve);
  const f = new Graphics();
  f.roundRect(-3.6, 0, 7.2, 13, 3.6).fill(longSleeve ? sleeve : t.skin);
  f.circle(0, 13.5, 5).fill(t.skin).stroke({ width: 1, color: shade(t.skin, 0.7), alpha: 0.7 });
  if (longSleeve) f.rect(-3.6, 8, 7.2, 3).fill(t.top2);
  fore.addChild(f);
  fore.position.set(0, 14);
  arm.addChild(u, fore);
  arm.position.set(side * 17, -25);
  return { arm, fore };
}

function makeTail(t: ChibiTemplate): Container | null {
  if (t.species !== 'cat' && t.species !== 'dog' && t.species !== 'bunny') return null;
  const c = new Container();
  const g = new Graphics();
  if (t.species === 'bunny') g.circle(0, 0, 8).fill(0xffffff).stroke({ width: 1, color: 0xd8d0e8 });
  else g.ellipse(0, -9, 5.5, 14).fill(t.skin).stroke({ width: 1, color: shade(t.skin, 0.7), alpha: 0.7 });
  c.addChild(g);
  c.position.set(-9, -2);
  return c;
}

// ---------------------------------------------------------------- view

export class ChibiView extends Container {
  readonly tpl: ChibiTemplate;
  baseScale = 1;
  labelScale = 1;
  private shadow = new Graphics();
  private aura = new Graphics();
  private hip = new Container();
  private head = new Container();
  private legL: Container; private legR: Container;
  private armL: Container; private foreL: Container;
  private armR: Container; private foreR: Container;
  private tail: Container | null;
  private eyesC: Container;
  private mouthOpen = new Graphics();
  private mouthClosed = new Graphics();
  private nameTag = new Container();
  private pill = new Graphics();
  private nameText: Text;
  private follower = false;
  private rank = 0;

  // animation state
  private speed = 0.9 + Math.random() * 0.2;
  private offset = Math.random() * 4;
  private loop: Clip = 'idle';
  private loopLeft = 0;
  private shot: { clip: Clip; t: number; dur: number } | null = null;
  private last: Pose = { ...REST };
  private blendFrom: Pose | null = null;
  private blendT = 0;
  private blink = 1 + Math.random() * 3;
  private glow = 0;
  private t = 0;
  dead = false;

  constructor(tplIndex: number, name: string) {
    super();
    this.tpl = TEMPLATES[tplIndex % TEMPLATES.length];
    const t = this.tpl;

    this.shadow.ellipse(0, 1, 23, 7).fill({ color: 0x000000, alpha: 0.38 });
    this.aura.blendMode = 'add';
    this.aura.circle(0, -48, 46).fill({ color: 0xffd23f, alpha: 0.28 }).circle(0, -48, 30).fill({ color: 0xffffff, alpha: 0.2 });
    this.aura.visible = false;

    this.legL = makeLeg(t, -1);
    this.legR = makeLeg(t, 1);
    this.tail = makeTail(t);

    const torso = new Graphics();
    drawTorso(torso, t);
    torso.position.set(0, 0);

    const aL = makeArm(t, -1);
    const aR = makeArm(t, 1);
    this.armL = aL.arm; this.foreL = aL.fore;
    this.armR = aR.arm; this.foreR = aR.fore;

    // đầu
    const hb = new Graphics(); hairBack(hb, t);
    const ea = new Graphics(); ears(ea, t);
    const fc = new Graphics(); face(fc, t);
    this.eyesC = eyes(t);
    this.mouthClosed.moveTo(-4.5, CY + 13).quadraticCurveTo(0, CY + 19, 4.5, CY + 13).stroke({ width: 2, color: OUTLINE, cap: 'round' });
    this.mouthOpen.ellipse(0, CY + 15, 4.6, 5.4).fill(0x7a1f3d).ellipse(0, CY + 17.5, 2.8, 2).fill(0xff6f8e);
    this.mouthOpen.visible = false;
    const bl = new Graphics();
    if (t.blush) bl.ellipse(-19, CY + 11, 5.5, 3.2).fill({ color: 0xff6f9a, alpha: 0.5 }).ellipse(19, CY + 11, 5.5, 3.2).fill({ color: 0xff6f9a, alpha: 0.5 });
    const hf = new Graphics(); hairFront(hf, t);
    const ac = new Graphics(); accessory(ac, t);
    this.head.addChild(hb, ea, fc, bl, this.eyesC, this.mouthClosed, this.mouthOpen, hf, ac);
    this.head.position.set(0, -30);

    if (this.tail) this.hip.addChild(this.tail);
    this.hip.addChild(this.legL, this.legR, torso, this.armL, this.armR, this.head);
    this.hip.position.set(0, HIP_Y);

    // nhãn tên
    this.nameText = new Text({
      text: name,
      style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 22, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x1a0b33, width: 4 } },
    });
    this.nameText.anchor.set(0.5, 0.5);
    this.nameTag.addChild(this.pill, this.nameText);
    this.nameTag.position.set(0, -134);
    this.setName(name);

    this.addChild(this.shadow, this.aura, this.hip, this.nameTag);
    this.eventMode = 'none';
    this.pickLoop();
  }

  setName(name: string) {
    const n = name.length > 14 ? name.slice(0, 13) + '…' : name;
    this.nameText.text = n;
    this.redrawPill();
  }

  setBadges(follower: boolean, rank: number) {
    this.follower = follower; this.rank = rank;
    this.redrawPill();
  }

  private redrawPill() {
    const w = this.nameText.width + 18 + (this.follower ? 18 : 0) + (this.rank ? 18 : 0);
    const h = 30;
    this.pill.clear().roundRect(-w / 2, -h / 2, w, h, 15).fill({ color: 0x120728, alpha: 0.62 });
    let x = -w / 2 + 14;
    if (this.rank) { star(this.pill, x, 0, 7, this.rank === 1 ? 0xffd23f : this.rank === 2 ? 0xdfe6ff : 0xffa86b); x += 18; }
    if (this.follower) { this.pill.circle(x, 0, 6).fill(0xff4f9a); x += 18; }
    const badgesW = (this.follower ? 18 : 0) + (this.rank ? 18 : 0);
    this.nameText.x = -w / 2 + 9 + badgesW + this.nameText.width / 2;
  }

  /** Chuyển clip. Clip một lần sẽ tự quay về vòng lặp nhảy. */
  play(clip: Clip) {
    if (this.dead) return;
    if (ONE_SHOT_CLIPS.has(clip)) {
      if (clip !== 'spawn') this.blendFrom = { ...this.last };
      if (clip !== 'spawn') this.blendT = 0.16;
      this.shot = { clip, t: 0, dur: clipDuration(clip) };
      if (clip === 'despawn') this.dead = true;
    } else {
      this.loop = clip;
      this.shot = null;
    }
  }

  glowFor(sec: number) { this.glow = sec; }
  hideLabel() { this.nameTag.visible = false; }

  private pickLoop() {
    const next = DANCE_CLIPS[Math.floor(Math.random() * DANCE_CLIPS.length)];
    if (next !== this.loop) { this.blendFrom = { ...this.last }; this.blendT = 0.35; }
    this.loop = next;
    this.loopLeft = 6 + Math.random() * 10;
  }

  update(dt: number, beat: number, intensity: number) {
    this.t += dt;
    const p = beat * this.speed + this.offset;
    let pose: Pose;
    if (this.shot) {
      this.shot.t += dt;
      const u = Math.min(1, this.shot.t / this.shot.dur);
      pose = evalClip(this.shot.clip, p, u);
      if (u >= 1 && !this.dead) { this.shot = null; this.blendFrom = { ...this.last }; this.blendT = 0.2; }
    } else {
      this.loopLeft -= dt;
      if (this.loopLeft <= 0) this.pickLoop();
      pose = evalClip(this.loop, p, 0);
    }
    pose = applyIntensity(pose, intensity);
    if (this.blendT > 0 && this.blendFrom) {
      this.blendT -= dt;
      pose = lerpPose(this.blendFrom, pose, 1 - Math.max(0, this.blendT) / 0.3);
    }
    this.last = pose;

    // Mỗi bộ phận lệch pha nhẹ => cảm giác có độ trễ tự nhiên (tay/đầu đã có phase riêng trong clip)
    this.hip.position.set(pose.x, HIP_Y + pose.y);
    this.hip.rotation = pose.rot;
    this.hip.scale.set(pose.sx, pose.sy);
    this.head.position.set(0, -30 + pose.headY);
    this.head.rotation = pose.head;
    this.armL.rotation = pose.aL; this.foreL.rotation = pose.fL;
    this.armR.rotation = -pose.aR; this.foreR.rotation = -pose.fR;
    this.legL.rotation = pose.lL; this.legR.rotation = pose.lR;
    if (this.tail) this.tail.rotation = 0.35 * Math.sin(p * Math.PI * 2 + 1) - 0.2;

    const open = pose.mouth > 0.5;
    this.mouthOpen.visible = open;
    this.mouthClosed.visible = !open;

    this.blink -= dt;
    this.eyesC.scale.y = this.blink < 0 && this.blink > -0.12 ? 0.1 : 1;
    if (this.blink < -0.12) this.blink = 2 + Math.random() * 4;

    const air = Math.max(0, -pose.y) / 36;
    this.shadow.scale.set(1 - air * 0.3, 1 - air * 0.3);
    this.shadow.alpha = 1 - air * 0.4;

    if (this.glow > 0) {
      this.glow -= dt;
      this.aura.visible = true;
      this.aura.alpha = Math.min(1, this.glow) * (0.8 + 0.2 * Math.sin(this.t * 10));
    } else if (this.aura.visible) this.aura.visible = false;

    const k = this.baseScale * pose.s;
    this.scale.set(k);
    this.alpha = pose.a;
    this.nameTag.scale.set(this.labelScale / k);
  }

  override destroy() {
    super.destroy({ children: true });
  }
}
