import { Container, Text } from 'pixi.js';
import { STAGE_W } from '../engine/slots';

const HOLD = 2.2; // giây hiện đầy đủ
const FADE = 0.4;

const easeOutBack = (t: number) => { const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/** Chữ "COMBO xN" lớn, nảy lên mỗi lần số combo tăng. Nằm ngoài camera, trên cả cảnh tặng quà. */
export class ComboText extends Container {
  private big: Text;
  private who: Text;
  private t = -1;

  constructor() {
    super();
    this.eventMode = 'none';
    this.big = new Text({ text: '', style: { fontFamily: 'Arial Black, Arial, Helvetica, sans-serif', fontSize: 120, fontWeight: '900', fill: 0xffe27a, stroke: { color: 0x3a0b6f, width: 16 } } });
    this.big.anchor.set(0.5);
    this.who = new Text({ text: '', style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 40, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x3a0b6f, width: 8 } } });
    this.who.anchor.set(0.5);
    this.who.y = -92;
    this.addChild(this.who, this.big);
    this.position.set(STAGE_W / 2, 1300);
    this.visible = false;
  }

  show(name: string, n: number) {
    this.who.text = name;
    this.big.text = `COMBO x${n}`;
    // càng nhiều combo càng chuyển từ vàng sang hồng
    this.big.style.fill = n >= 10 ? 0xff6fd0 : n >= 5 ? 0xffb347 : 0xffe27a;
    this.t = 0;
    this.visible = true;
  }

  update(dt: number) {
    if (this.t < 0) return;
    this.t += dt;
    const total = HOLD + FADE;
    if (this.t >= total) { this.t = -1; this.visible = false; return; }
    const pop = easeOutBack(Math.min(1, this.t / 0.3));
    this.scale.set(0.5 + 0.5 * pop + 0.35 * Math.max(0, 1 - this.t / 0.3));
    this.rotation = 0.05 * Math.sin(this.t * 14) * Math.max(0, 1 - this.t / 0.6);
    this.alpha = Math.min(1, (total - this.t) / FADE);
  }
}
