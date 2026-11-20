import type { LiveEvent } from '../shared/types';
import type { LiveEventAdapter } from './adapter';

const NAMES = [
  'Minh Anh', 'Bảo Ngọc', 'Hải Đăng', 'Thu Hà', 'Quốc Việt', 'Lan Chi', 'Đức Anh', 'Mai Linh', 'Tuấn Kiệt', 'Ngọc Trâm',
  'Khánh Vy', 'Gia Hưng', 'Phương Thảo', 'Anh Khoa', 'Thanh Tùng', 'Bích Hạnh', 'Hoàng Long', 'Yến Nhi', 'Trung Hiếu', 'Diệu Linh',
  'mixer_09', 'night_owl', 'sakura88', 'dj_nam', 'cutemeo', 'bao_pro', 'luna.vn', 'kimchi_boy', 'tra_sua_nho', 'neon_fox',
  'Hà My', 'Công Phát', 'Thùy Dương', 'Nhật Minh', 'Cẩm Tú', 'Đình Nam', 'Kim Ngân', 'Việt Hoàng', 'Thảo Vy', 'Hữu Phước',
];
const GIFTS: [string, number][] = [['Hoa hồng', 1], ['Kem', 5], ['Ly bia', 10], ['Gấu bông', 99], ['Bó hoa', 299], ['Xe đua', 1000], ['Sư tử', 5000]];

const SEED_COUNT = 10; // số avatar nền ở chế độ DEMO

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export interface Viewer { userId: string; name: string }

/** Nguồn sự kiện giả lập (DEMO). Đi qua LiveEventAdapter như mọi nguồn thật. */
export class DemoDirector {
  private timer?: number;
  private viewers: Viewer[] = [];
  private n = 0;
  running = false;

  constructor(private adapter: LiveEventAdapter, private getCount: () => number) {}

  newViewer(prefix = 'demo'): Viewer {
    const v = { userId: `${prefix}_${++this.n}_${Math.random().toString(36).slice(2, 6)}`, name: Math.random() < 0.5 ? pick(NAMES) : `${pick(NAMES)} ${10 + Math.floor(Math.random() * 90)}` };
    this.viewers.push(v);
    if (this.viewers.length > 400) this.viewers.shift();
    return v;
  }

  randomViewer(): Viewer { return this.viewers.length ? pick(this.viewers) : this.newViewer(); }

  event(type: LiveEvent['type'], who?: Viewer): LiveEvent {
    const v = who ?? this.randomViewer();
    switch (type) {
      case 'JOIN': return { type, userId: v.userId, name: v.name };
      case 'LIKE': return { type, userId: v.userId, name: v.name, count: 1 + Math.floor(Math.random() * 12) };
      case 'COMMENT': return { type, userId: v.userId, name: v.name, text: '' };
      case 'FOLLOW': return { type, userId: v.userId, name: v.name };
      case 'SHARE': return { type, userId: v.userId, name: v.name };
      case 'GIFT': {
        const [giftName, diamonds] = pick(GIFTS);
        return { type, userId: v.userId, name: v.name, giftId: giftName, giftName, diamonds, repeatCount: 1, repeatEnd: true };
      }
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    // chỉ vài avatar nền cho đỡ trống; không giả lập người vào / người tặng quà nữa
    let seed = Math.max(0, SEED_COUNT - this.getCount());
    const fill = () => {
      if (!this.running) return;
      if (seed-- > 0) { this.adapter.emit(this.event('JOIN', this.newViewer())); this.timer = window.setTimeout(fill, 90); } else loop();
    };
    const loop = () => {
      if (!this.running) return;
      const r = Math.random();
      // chỉ hoạt động của các avatar nền; không có JOIN, GIFT và bình luận giả (chỉ lấy từ live thật hoặc Panel)
      if (r < 0.77) this.adapter.emit(this.event('LIKE'));
      else if (r < 0.89) this.adapter.emit(this.event('FOLLOW'));
      else this.adapter.emit(this.event('SHARE'));
      this.timer = window.setTimeout(loop, 900 + Math.random() * 2200);
    };
    fill();
  }

  stop() {
    this.running = false;
    window.clearTimeout(this.timer);
  }
}
