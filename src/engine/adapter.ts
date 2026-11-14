import type { ConnStatus, LiveEvent } from '../shared/types';

export interface LiveSource {
  readonly name: string;
  connect(): void;
  disconnect(): void;
}

type EventHandler = (e: LiveEvent) => void;
type StatusHandler = (s: ConnStatus) => void;

const TYPES = new Set(['JOIN', 'LIKE', 'COMMENT', 'FOLLOW', 'SHARE', 'GIFT']);

/**
 * Chuẩn hóa mọi nguồn sự kiện về LiveEvent. Giao diện chỉ phụ thuộc lớp này,
 * nên có thể thay nguồn (mock / WebSocket bridge / Spring Boot) mà không sửa renderer.
 *
 * Hỗ trợ 2 dạng payload từ bridge:
 *  1. Đã chuẩn hóa: { type: 'JOIN', userId, name, ... }
 *  2. Dạng thô: { event: 'member'|'like'|'chat'|'follow'|'share'|'gift', data: {...} }
 *     (tên trường theo cộng đồng tiktok-live-connector — [Unverified], cần đối chiếu với bridge thực tế)
 */
export class LiveEventAdapter {
  status: ConnStatus = 'idle';
  sourceName = 'none';
  private source?: LiveSource;
  private handlers = new Set<EventHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private giftSeen = new Map<string, number>(); // userId|giftId -> repeatCount đã tính
  private recent = new Map<string, number>(); // dedupe msgId

  onEvent(h: EventHandler) { this.handlers.add(h); return () => this.handlers.delete(h); }
  onStatus(h: StatusHandler) { this.statusHandlers.add(h); return () => this.statusHandlers.delete(h); }

  setStatus(s: ConnStatus) {
    this.status = s;
    this.statusHandlers.forEach((h) => h(s));
  }

  setSource(src: LiveSource | undefined) {
    this.source?.disconnect();
    this.source = src;
    this.sourceName = src?.name ?? 'none';
  }

  connect() { if (this.source) { this.setStatus('connecting'); this.source.connect(); } }
  disconnect() { this.source?.disconnect(); this.setStatus('idle'); }

  /** Phát một sự kiện đã chuẩn hóa (đi qua kiểm tra + gộp combo quà). */
  emit(ev: LiveEvent) {
    if (!ev || !TYPES.has(ev.type) || !ev.userId) return;
    if (ev.type === 'GIFT') {
      const delta = this.giftDelta(ev);
      if (delta <= 0) return;
      ev = { ...ev, repeatCount: delta };
    }
    this.handlers.forEach((h) => h(ev));
  }

  /** Nhận payload thô từ nguồn ngoài. */
  ingest(raw: unknown) {
    const ev = normalize(raw);
    if (!ev) return;
    const id = (raw as { msgId?: string }).msgId;
    if (id) {
      if (this.recent.has(id)) return;
      this.recent.set(id, Date.now());
      if (this.recent.size > 2000) this.recent.delete(this.recent.keys().next().value as string);
    }
    this.emit(ev);
  }

  /** Tránh tính trùng combo: chỉ lấy phần tăng thêm so với lần trước. */
  private giftDelta(ev: Extract<LiveEvent, { type: 'GIFT' }>): number {
    const total = Math.max(1, ev.repeatCount ?? 1);
    const key = `${ev.userId}|${ev.giftId}`;
    const prev = this.giftSeen.get(key);
    if (ev.repeatEnd) this.giftSeen.delete(key);
    else this.giftSeen.set(key, total);
    if (prev === undefined) return total; // sự kiện đầu của combo (hoặc quà đơn)
    if (total > prev) return total - prev;
    if (total === prev) return 0; // trùng
    return total; // đếm lại từ đầu => combo mới
  }
}

function str(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : v == null ? fb : String(v);
}

export function normalize(raw: unknown): LiveEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  if (typeof r.type === 'string' && TYPES.has(r.type)) return r as unknown as LiveEvent;
  const d = r.data ?? r;
  const userId = str(d.userId ?? d.uniqueId ?? d.user_id);
  const name = str(d.nickname ?? d.name ?? d.uniqueId, 'Khách').slice(0, 24);
  switch (r.event) {
    case 'member': return { type: 'JOIN', userId, name, follower: d.isFollower === true };
    case 'like': return { type: 'LIKE', userId, name, count: Number(d.likeCount ?? 1) };
    case 'chat': return { type: 'COMMENT', userId, name, text: str(d.comment ?? d.text) };
    case 'follow': return { type: 'FOLLOW', userId, name };
    case 'share': return { type: 'SHARE', userId, name };
    case 'gift':
      return {
        type: 'GIFT', userId, name,
        giftId: str(d.giftId), giftName: str(d.giftName, 'Gift'),
        diamonds: Number(d.diamondCount ?? d.diamonds ?? 1),
        repeatCount: Number(d.repeatCount ?? 1),
        // giftType === 1 là quà dạng streak trong thư viện cộng đồng — [Unverified]
        repeatEnd: d.giftType === 1 ? Boolean(d.repeatEnd) : true,
      };
    default: return null;
  }
}

/** Nguồn WebSocket (bridge Node/Spring Boot gửi JSON). Tự kết nối lại. */
export class WsSource implements LiveSource {
  readonly name: string;
  private ws?: WebSocket;
  private stopped = true;
  private timer?: number;

  constructor(private url: string, private adapter: LiveEventAdapter) {
    this.name = `ws:${url}`;
  }

  connect() {
    this.stopped = false;
    this.open();
  }

  private open() {
    if (this.stopped) return;
    this.adapter.setStatus('connecting');
    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => this.adapter.setStatus('open');
      ws.onmessage = (e) => {
        try { this.adapter.ingest(JSON.parse(String(e.data))); } catch { /* bỏ qua payload lỗi */ }
      };
      ws.onerror = () => this.adapter.setStatus('error');
      ws.onclose = () => {
        if (this.stopped) return;
        this.adapter.setStatus('closed');
        this.timer = window.setTimeout(() => this.open(), 3000);
      };
    } catch {
      this.adapter.setStatus('error');
    }
  }

  disconnect() {
    this.stopped = true;
    window.clearTimeout(this.timer);
    this.ws?.close();
    this.ws = undefined;
  }
}
