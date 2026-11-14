import type { BusMsg } from './types';

/** Relay chạy trên máy người dùng: nếu trang được host ở nơi khác (vd. GitHub Pages) thì nối tới localhost. */
function defaultRelayUrl() {
  const h = location.hostname;
  const local = !h || h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.endsWith('.local');
  return `ws://${local ? h || 'localhost' : 'localhost'}:8787`;
}

interface Env { id: string; from: string; m: BusMsg }

/**
 * Kênh liên lạc Control Panel <-> Stage.
 * - BroadcastChannel: cùng trình duyệt, không cần server.
 * - WebSocket relay (server/relay.mjs): cho stage chạy trong OBS/TikTok LIVE Studio.
 * Message trùng (đến từ cả 2 đường) được loại bằng id.
 */
export class Bus {
  private bc = new BroadcastChannel('quan-bar');
  private ws?: WebSocket;
  private readonly me = Math.random().toString(36).slice(2);
  private n = 0;
  private seen = new Set<string>();
  private handlers = new Set<(m: BusMsg) => void>();
  private closed = false;

  constructor(private relayUrl = defaultRelayUrl()) {
    this.bc.onmessage = (e) => this.recv(e.data as Env);
    this.openWs();
  }

  private openWs() {
    if (this.closed) return;
    try {
      const ws = new WebSocket(this.relayUrl);
      this.ws = ws;
      ws.onmessage = (e) => {
        try { this.recv(JSON.parse(String(e.data)) as Env); } catch { /* bỏ qua */ }
      };
      ws.onclose = () => { this.ws = undefined; setTimeout(() => this.openWs(), 3000); };
      ws.onerror = () => ws.close();
    } catch {
      setTimeout(() => this.openWs(), 3000);
    }
  }

  private recv(env: Env) {
    if (!env || env.from === this.me || this.seen.has(env.id)) return;
    this.seen.add(env.id);
    if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value as string);
    this.handlers.forEach((h) => h(env.m));
  }

  send(m: BusMsg) {
    const env: Env = { id: `${this.me}:${this.n++}`, from: this.me, m };
    this.bc.postMessage(env);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(env));
  }

  on(h: (m: BusMsg) => void) {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  close() {
    this.closed = true;
    this.bc.close();
    this.ws?.close();
  }
}
