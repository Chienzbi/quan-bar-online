import { Container, Graphics, Text } from 'pixi.js';
import { STAGE_W } from '../engine/slots';

export type Tier = 'gold' | 'pink' | 'white';
export const TIER_COLOR: Record<Tier, number> = { gold: 0xffd23f, pink: 0xff6fd0, white: 0xffffff };

/** Vị trí dọc của dải chữ (px trên sân khấu 1080x1920). Tăng nếu UI TikTok che mất. */
const TICKER_Y = 150;
const BAR_H = 64;
const SPEED = 230; // px/s
const MAX_PENDING = 40;
const MAX_NAMES = 3; // một lượt chữ ghi tối đa 3 tên, phần dư gộp "và N người nữa"

interface Pending { name: string; tier: Tier }

/**
 * Dải chữ chạy trên cùng: "<tên> đã vào bar 🎉".
 * Nhiều người vào cùng lúc thì gộp thành một lượt để không dồn ứ. Nằm ngoài camera nên không bị zoom.
 */
export class JoinTicker extends Container {
  private bar = new Graphics();
  private row = new Container();
  private pending: Pending[] = [];
  private cur: { w: number } | null = null;
  private fade = 0;

  constructor() {
    super();
    this.eventMode = 'none';
    this.bar.roundRect(0, 0, STAGE_W, BAR_H, 0).fill({ color: 0x120728, alpha: 0.72 });
    this.bar.rect(0, 0, STAGE_W, 3).fill({ color: 0xff6fd0, alpha: 0.9 }).rect(0, BAR_H - 3, STAGE_W, 3).fill({ color: 0x6ff0ff, alpha: 0.9 });
    this.bar.position.set(0, TICKER_Y);
    this.bar.alpha = 0;
    this.row.position.set(STAGE_W + 20, TICKER_Y + BAR_H / 2);
    this.row.visible = false;
    this.addChild(this.bar, this.row);
  }

  push(name: string, tier: Tier) {
    if (this.pending.length >= MAX_PENDING) this.pending.shift();
    this.pending.push({ name: name.length > 16 ? name.slice(0, 15) + '…' : name, tier });
  }

  private make(text: string, color: number, bold = true) {
    const t = new Text({ text, style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 34, fontWeight: bold ? '800' : '600', fill: color, stroke: { color: 0x1a0b33, width: 5 } } });
    t.anchor.set(0, 0.5);
    return t;
  }

  private startNext() {
    const batch = this.pending.splice(0, MAX_NAMES);
    const rest = this.pending.length;
    this.pending = [];
    const row = this.row;
    row.removeChildren().forEach((c) => c.destroy());
    let x = 0;
    const add = (t: Text) => { t.x = x; row.addChild(t); x += t.width; };
    add(this.make('🎉 ', 0xffffff, false));
    batch.forEach((b, i) => {
      if (i) add(this.make(', ', 0xffffff, false));
      add(this.make(b.name, TIER_COLOR[b.tier]));
    });
    if (rest > 0) add(this.make(` và ${rest} người nữa`, 0xffffff, false));
    add(this.make(' đã vào bar 🎉', 0xffffff, false));
    row.x = STAGE_W + 20;
    row.visible = true;
    this.cur = { w: x };
  }

  update(dt: number) {
    if (!this.cur && this.pending.length) this.startNext();
    const active = !!this.cur;
    this.fade = Math.min(1, Math.max(0, this.fade + (active ? dt * 4 : -dt * 3)));
    this.bar.alpha = this.fade;
    if (!this.cur) { this.row.visible = false; return; }
    this.row.x -= SPEED * dt;
    if (this.row.x + this.cur.w < -20) {
      this.cur = null;
      this.row.visible = false;
    }
  }

  reset() {
    this.pending = [];
    this.cur = null;
    this.row.visible = false;
    this.bar.alpha = 0;
    this.fade = 0;
  }
}

const HINT_W = 230;
const HINT_H = 262;
const HINT_LINES: [string, string][] = [
  ['!đỏ / !xanh', 'chọn phe'],
  ['!tỉnh Đà Nẵng', 'quê bạn'],
  ['!cheers', 'cụng ly'],
  ['!tim @tên', 'bắn tim'],
  ['!nhảy 1-4', 'đổi điệu'],
];

/** Khung vuông hướng dẫn lệnh bình luận, đặt ở góc phải trên (đối xứng với bản đồ ở góc trái). */
export class CommandHint extends Container {
  private frame = new Graphics();
  private t = 0;

  constructor() {
    super();
    this.eventMode = 'none';
    const title = new Text({ text: 'GÕ LỆNH', style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 22, fontWeight: '800', fill: 0xffe27a, stroke: { color: 0x1a0b33, width: 4 } } });
    title.anchor.set(0.5, 0);
    title.position.set(HINT_W / 2, 12);
    this.addChild(this.frame, title);
    HINT_LINES.forEach(([cmd, what], i) => {
      const y = 50 + i * 41;
      const c = new Text({ text: cmd, style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 20, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x1a0b33, width: 4 } } });
      c.position.set(14, y);
      const w = new Text({ text: what, style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 15, fontWeight: '600', fill: 0x9ff4ff, stroke: { color: 0x1a0b33, width: 3 } } });
      w.position.set(16, y + 25);
      this.addChild(c, w);
    });
    this.position.set(STAGE_W - 24 - HINT_W, 350);
    this.draw(0.8);
  }

  private draw(a: number) {
    this.frame.clear()
      .roundRect(0, 0, HINT_W, HINT_H, 16).fill({ color: 0x120728, alpha: 0.6 })
      .roundRect(0, 0, HINT_W, HINT_H, 16).stroke({ width: 2, color: 0x2de2ff, alpha: a });
  }

  update(dt: number) {
    this.t += dt;
    this.draw(0.6 + 0.3 * Math.sin(this.t * 2));
  }
}
