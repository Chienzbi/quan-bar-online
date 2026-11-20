import { Container, Graphics, Text } from 'pixi.js';
import { OUTLINE, PROVINCES } from '../engine/provinces';

const PW = 150;
const PH = 335;
const S = 17; // px trên 1 độ vĩ
const MX = 14;
const MY = 62;
const px = (lon: number) => MX + (lon - 102) * 0.96 * S;
const py = (lat: number) => MY + (23.5 - lat) * S;

/** Bản đồ Việt Nam thu nhỏ: mỗi tỉnh có người xem khai báo sẽ sáng lên. */
export class VnMap extends Container {
  private dots = new Graphics();
  private counter: Text;
  private counts: Record<number, number> = {};
  private flash: { i: number; t: number } | null = null;
  private t = 0;

  constructor() {
    super();
    this.eventMode = 'none';
    const panel = new Graphics();
    panel.roundRect(0, 0, PW, PH, 16).fill({ color: 0x120728, alpha: 0.6 }).stroke({ width: 2, color: 0x2de2ff, alpha: 0.8 });
    const shape = new Graphics();
    shape.poly(OUTLINE.flatMap(([lon, lat]) => [px(lon), py(lat)])).fill({ color: 0x3a2a78, alpha: 0.55 }).stroke({ width: 1.5, color: 0x9d7cff, alpha: 0.9 });
    const title = new Text({ text: 'QUÊ BẠN Ở ĐÂU?', style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 15, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x1a0b33, width: 3 } } });
    title.anchor.set(0.5, 0); title.position.set(PW / 2, 8);
    this.counter = new Text({ text: '0/63 tỉnh', style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 20, fontWeight: '800', fill: 0xffe27a, stroke: { color: 0x1a0b33, width: 4 } } });
    this.counter.anchor.set(0.5, 0); this.counter.position.set(PW / 2, 28);
    this.addChild(panel, shape, this.dots, title, this.counter);
  }

  setData(counts: Record<number, number>, lit?: number) {
    this.counts = counts;
    const covered = PROVINCES.reduce((n, _, i) => n + (counts[i] > 0 ? 1 : 0), 0);
    this.counter.text = `${covered}/${PROVINCES.length} tỉnh`;
    if (lit !== undefined) this.flash = { i: lit, t: 0 };
  }

  update(dt: number) {
    this.t += dt;
    const g = this.dots;
    g.clear();
    PROVINCES.forEach((p, i) => {
      const n = this.counts[i] ?? 0;
      const x = px(p.lon), y = py(p.lat);
      if (n <= 0) { g.circle(x, y, 2).fill({ color: 0x7a68b8, alpha: 0.55 }); return; }
      const r = 3 + Math.min(3, Math.log2(n + 1));
      const tw = 0.75 + 0.25 * Math.sin(this.t * 3 + i);
      g.circle(x, y, r + 3).fill({ color: 0xffd23f, alpha: 0.22 * tw });
      g.circle(x, y, r).fill({ color: 0xffe27a, alpha: 0.95 });
    });
    if (this.flash) {
      this.flash.t += dt;
      const f = this.flash.t / 1.6;
      if (f >= 1) this.flash = null;
      else {
        const p = PROVINCES[this.flash.i];
        g.circle(px(p.lon), py(p.lat), 6 + 26 * f).stroke({ width: 3, color: 0xffffff, alpha: 1 - f });
      }
    }
  }
}
