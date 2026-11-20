import { Container } from 'pixi.js';
import { STAGE_H, STAGE_W } from '../engine/slots';

/** Một góc máy: tâm nhìn (toạ độ sân khấu 1080x1920) và mức zoom. */
export interface Shot { x: number; y: number; zoom: number }

/** Renderer cung cấp: trả về DJ hoặc một nhân vật ngẫu nhiên để focus (null nếu chưa có gì). */
export type ShotPicker = () => Shot | null;

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

type Phase = 'idle' | 'in' | 'hold' | 'out';

/**
 * Máy quay: thỉnh thoảng lia tới một góc, giữ vài giây rồi lia về toàn cảnh.
 * Dùng bằng cách đặt mọi thứ của sân khấu vào `world`.
 */
export class Camera {
  readonly world = new Container();
  enabled = true;
  private phase: Phase = 'idle';
  private left = rand(3, 5);
  private hold = 0; // thời gian giữ góc do focus() yêu cầu (0 = ngẫu nhiên)
  private cool = 0; // giây còn lại trước khi focus tự động được phép lần nữa
  private dur = 1;
  private from = { x: STAGE_W / 2, y: STAGE_H / 2, zoom: 1 };
  private to = { x: STAGE_W / 2, y: STAGE_H / 2, zoom: 1 };
  private cur = { x: STAGE_W / 2, y: STAGE_H / 2, zoom: 1 };
  /** Hàm chọn đối tượng focus, renderer gán vào. */
  pick: ShotPicker = () => null;

  update(dt: number) {
    if (this.cool > 0) this.cool -= dt;
    if (!this.enabled && this.phase === 'idle' && this.cur.zoom === 1) { this.apply(); return; }
    this.left -= dt;
    if (this.phase === 'idle') {
      if (this.left <= 0 && this.enabled) this.startShot();
    } else {
      const t = this.dur > 0 ? Math.min(1, 1 - this.left / this.dur) : 1;
      if (this.phase === 'in' || this.phase === 'out') {
        const k = smooth(Math.max(0, t));
        this.cur = { x: lerp(this.from.x, this.to.x, k), y: lerp(this.from.y, this.to.y, k), zoom: lerp(this.from.zoom, this.to.zoom, k) };
      }
      if (this.left <= 0) this.nextPhase();
    }
    this.apply();
  }

  /**
   * Lia tới một điểm theo yêu cầu (quà lớn, người mới quan trọng...).
   * force = true: ngắt cả khi đang ở góc khác. Không force: chỉ khi đang toàn cảnh và đã qua thời gian chờ.
   */
  focus(s: Shot, hold = 3.5, force = false, always = false) {
    if (!this.enabled && !force && !always) return; // always: bỏ qua công tắc tự động (quà, thao tác thủ công)
    if (!force && (this.phase !== 'idle' || this.cool > 0)) return;
    this.from = { ...this.cur };
    this.to = { x: s.x, y: s.y, zoom: s.zoom };
    this.phase = 'in';
    this.dur = this.left = rand(0.8, 1.2);
    this.hold = hold;
    this.cool = 12;
  }

  /** Về toàn cảnh ngay (dùng khi bấm "Toàn cảnh" trong Panel). */
  release() {
    if (this.phase === 'idle' || this.phase === 'out') return;
    this.from = { ...this.cur };
    this.to = { x: STAGE_W / 2, y: STAGE_H / 2, zoom: 1 };
    this.phase = 'out';
    this.dur = this.left = rand(1.0, 1.4);
  }

  private startShot() {
    const s = this.pick();
    if (!s) { this.left = rand(3, 6); return; }
    this.from = { ...this.cur };
    this.to = { x: s.x, y: s.y, zoom: s.zoom };
    this.phase = 'in';
    this.dur = this.left = rand(1.4, 2.2);
  }

  private nextPhase() {
    if (this.phase === 'in') {
      this.phase = 'hold';
      this.dur = this.left = this.hold || rand(3, 5.5);
      this.hold = 0;
      this.cur = { ...this.to };
    } else if (this.phase === 'hold') {
      this.phase = 'out';
      this.from = { ...this.cur };
      this.to = { x: STAGE_W / 2, y: STAGE_H / 2, zoom: 1 };
      this.dur = this.left = rand(1.4, 2);
    } else {
      this.phase = 'idle';
      this.cur = { ...this.to };
      this.left = rand(6, 10);
    }
  }

  private apply() {
    const z = this.cur.zoom;
    // giữ khung nhìn trong sân khấu, không lộ mép đen
    const hw = STAGE_W / (2 * z);
    const hh = STAGE_H / (2 * z);
    const cx = Math.min(STAGE_W - hw, Math.max(hw, this.cur.x));
    const cy = Math.min(STAGE_H - hh, Math.max(hh, this.cur.y));
    // trong lúc giữ góc, rung nhẹ như máy cầm tay
    const sway = this.phase === 'hold' ? 1 : 0;
    const tt = performance.now() / 1000;
    this.world.pivot.set(cx + sway * Math.sin(tt * 0.7) * 6, cy + sway * Math.cos(tt * 0.5) * 5);
    this.world.position.set(STAGE_W / 2, STAGE_H / 2);
    this.world.scale.set(z);
  }
}
