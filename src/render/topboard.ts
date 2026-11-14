import { Container, Graphics, Text } from 'pixi.js';
import type { TopEntry } from '../engine/avatars';

const MEDAL = [0xffd23f, 0xdfe6ff, 0xffa86b];

const style = (size: number, fill: number, weight: 'normal' | 'bold' = 'bold') => ({
  fontFamily: 'Arial, Helvetica, sans-serif', fontSize: size, fontWeight: weight, fill,
  stroke: { color: 0x120728, width: 4 },
});

const SPEED = 110; // px/giây
const VIEW_W = 384;
const GAP = 90;

/**
 * Bảng TOP supporter.
 * compact = true: khung 404×128 đè lên bảng vẽ sẵn trong ảnh nền, bên trong là một dòng chữ chạy ngang.
 * compact = false: bảng 3 dòng đứng (dùng cho scene vector).
 */
export class TopBoard extends Container {
  private rows: { medal: Graphics; name: Text; val: Text }[] = [];
  private total?: Text;
  // marquee
  private track = new Container();
  private trackW = 0;
  private compact: boolean;

  constructor(compact = false) {
    super();
    this.compact = compact;
    this.eventMode = 'none';

    if (compact) {
      // dải mỏng chỉ che thanh tiêu đề vẽ sẵn trong ảnh, không che DJ hay bàn DJ
      const bg = new Graphics();
      bg.roundRect(-192, -19, 384, 38, 19).fill(0x0b0626).stroke({ width: 2.5, color: 0x2de2ff });
      this.addChild(bg);
      const mask = new Graphics();
      mask.rect(-VIEW_W / 2 + 4, -18, VIEW_W - 8, 36).fill(0xffffff);
      this.addChild(mask);
      this.track.mask = mask;
      this.track.position.set(VIEW_W / 2, 0);
      this.addChild(this.track);
      this.build([], 0);
      return;
    }

    const title = new Text({ text: 'TOP SUPPORTER', style: style(30, 0x2de2ff) });
    title.anchor.set(0.5); title.y = -118;
    this.addChild(title);
    for (let i = 0; i < 3; i++) {
      const y = -62 + i * 54;
      const medal = new Graphics();
      medal.circle(0, 0, 17).fill(MEDAL[i]).stroke({ width: 2, color: 0x120728 });
      medal.position.set(-170, y);
      const n = new Text({ text: String(i + 1), style: { ...style(20, 0x2a1346), stroke: { color: 0xffffff, width: 0 } } });
      n.anchor.set(0.5); n.position.set(-170, y);
      const name = new Text({ text: '—', style: style(26, 0xffffff) });
      name.anchor.set(0, 0.5); name.position.set(-140, y);
      const val = new Text({ text: '', style: style(24, 0xffe27a) });
      val.anchor.set(1, 0.5); val.position.set(185, y);
      this.addChild(medal, n, name, val);
      this.rows.push({ medal, name, val });
    }
    this.total = new Text({ text: 'Tổng quà: 0', style: style(24, 0xff9ad0) });
    this.total.anchor.set(0.5); this.total.y = 112;
    this.addChild(this.total);
  }

  /** Dựng lại dòng chữ chạy: "#1 Tên 5.000  ★  #2 Tên 5.000  ★  ...  ★  Tổng quà: N" */
  private build(list: TopEntry[], total: number) {
    for (const ch of this.track.removeChildren()) ch.destroy();
    let x = 0;
    const add = (text: string, fill: number, size = 24) => {
      const t = new Text({ text, style: style(size, fill) });
      t.anchor.set(0, 0.5); t.x = x;
      this.track.addChild(t);
      x += t.width + 14;
    };
    if (!list.length) {
      add('Chưa có quà nào – hãy tặng quà để lên bảng TOP!', 0xffffff);
    } else {
      list.forEach((e, i) => {
        const name = e.name.length > 16 ? e.name.slice(0, 15) + '…' : e.name;
        add(`#${i + 1}`, MEDAL[i]);
        add(name, 0xffffff);
        add(e.total.toLocaleString('vi-VN'), 0xffe27a);
        add('★', 0xff6fd0); x += 10;
      });
    }
    add(`Tổng quà: ${total.toLocaleString('vi-VN')}`, 0xff9ad0);
    this.trackW = x + GAP;
    // giữ nguyên vị trí cuộn khi nội dung cập nhật (không giật về đầu mỗi lần có quà)
  }

  setData(list: TopEntry[], total: number) {
    if (this.compact) { this.build(list, total); return; }
    this.rows.forEach((r, i) => {
      const e = list[i];
      r.name.text = e ? (e.name.length > 13 ? e.name.slice(0, 12) + '…' : e.name) : '—';
      r.val.text = e ? e.total.toLocaleString('vi-VN') : '';
      r.name.alpha = e ? 1 : 0.4;
      r.medal.alpha = e ? 1 : 0.35;
    });
    if (this.total) this.total.text = `Tổng quà: ${total.toLocaleString('vi-VN')}`;
  }

  /** Gọi mỗi frame: cuộn dòng chữ sang trái, hết thì quay lại mép phải. */
  update(dt: number) {
    if (!this.compact) return;
    this.track.x -= SPEED * dt;
    if (this.track.x < -VIEW_W / 2 - this.trackW + GAP) this.track.x = VIEW_W / 2;
  }
}
