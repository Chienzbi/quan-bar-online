import type { Clip, LiveEvent, Settings } from '../shared/types';
import { fold, parseCommand } from './commands';
import { sanitizeComment } from './filter';
import { matchProvince, PROVINCES } from './provinces';
import { fillOrder, generateSlots, type Slot } from './slots';

export const TEMPLATE_COUNT = 15;

export interface AvatarState {
  userId: string;
  name: string;
  template: number;
  slot: Slot;
  joinedAt: number;
  lastActive: number;
  giftTotal: number;
  follower: boolean;
  lastLike: number;
  lastCmd: number;
  team?: 'red' | 'blue';
  /** lần gần nhất hiện đèn soi + dòng chữ "đã vào bar" */
  welcomedAt?: number;
}

export interface TeamState {
  active: boolean;
  red: number;
  blue: number;
  left: number; // giây còn lại của vòng
  winsRed: number;
  winsBlue: number;
  winner: 'red' | 'blue' | null; // khác null trong lúc công bố kết quả
  members: { red: number; blue: number };
}

export interface TopEntry { userId: string; name: string; total: number }

/** Renderer implement interface này; engine không biết gì về PixiJS. */
export interface RenderSink {
  spawn(a: AvatarState): void;
  despawn(userId: string): void;
  react(userId: string, clip: Clip): void;
  bubble(userId: string, text: string): void;
  heart(userId: string, n: number): void;
  sparkle(userId: string, n: number, color: number): void;
  glow(userId: string, sec: number): void;
  badge(userId: string): void;
  /** combo = số lượt tặng liên tiếp của cùng một người (≥ 1). */
  /** units = số quà trong lần tặng này (combo gộp), combo = tổng lượt liên tiếp. */
  gift(userId: string, level: 1 | 2 | 3, giftName: string, combo: number, units: number): void;
  /** Người mới vào: đèn soi + viền theo cấp + dòng chữ chạy trên cùng. */
  welcome(userId: string, name: string, tier: 'gold' | 'pink' | 'white'): void;
  /** Hiệu ứng nối hai avatar: cụng ly (from=to nếu đứng một mình) hoặc bắn tim. */
  link(fromId: string, toId: string, kind: 'cheers' | 'love'): void;
  /** Đổi kiểu nhảy (n = 1..4). */
  dance(userId: string, n: number): void;
  /** Nhãn tỉnh trên avatar; announce != null thì hiện chữ nổi (tỉnh mới sáng trên bản đồ). */
  province(userId: string, label: string | null, announce?: string): void;
  /** Cập nhật bản đồ: số người theo từng tỉnh; lit = tỉnh vừa sáng lần đầu. */
  provinces(counts: Record<number, number>, lit?: number): void;
  team(userId: string, team: 'red' | 'blue' | null): void;
  teams(s: TeamState): void;
  teamResult(winner: 'red' | 'blue'): void;
  top(list: TopEntry[], total: number): void;
}

const LIKE_COOLDOWN = 1200;
const REACT_BUDGET_PER_SEC = 24;
const MAX_BIG_FX = 3;
const BIG_FX_MS = 3200;
const FADE_MS = 900;
const CMD_COOLDOWN = 4000;
const COMBO_MS = 8000; // tặng tiếp trong 8 giây thì tính là combo
const ROUND_SEC = 60;
const RESULT_SEC = 12;
const USER_CAP = 12; // mỗi người tối đa 12 điểm / vòng để một người spam không quyết định kết quả
const LS_PROV = 'quan-bar:provinces';
const LS_USER_PROV = 'quan-bar:user-province';
const CHEERS_RANGE = 300; // px trên sân khấu

export class AvatarManager {
  readonly slots = generateSlots();
  private order = fillOrder(this.slots);
  private avatars = new Map<string, AvatarState>();
  private leaveMs = 0;
  private demo = false; // đang ở chế độ DEMO: người giả lập không được chào / không lên dải chữ
  /** Nhớ người đã follow / tặng quà kể cả khi avatar đã bị thay, để lần vào sau vẫn được viền đúng cấp. */
  private history = new Map<string, { follower: boolean; gift: number }>();
  private slotOwner = new Map<number, string>();
  private pending = new Set<number>(); // slot đang chờ avatar cũ mờ dần
  private queue: { userId: string; name: string; gift: boolean }[] = [];
  private tops = new Map<string, TopEntry>();
  /** Số người theo từng tỉnh (lưu qua các buổi live) và tỉnh của từng người. */
  private provCounts: Record<number, number> = {};
  private userProv = new Map<string, number>();
  private round = { left: ROUND_SEC, red: 0, blue: 0, per: new Map<string, number>() };
  private teamsOn = true;
  private combos = new Map<string, { n: number; t: number }>();
  private wins = { red: 0, blue: 0 };
  private result: { winner: 'red' | 'blue'; left: number } | null = null;
  totalGift = 0;
  events = 0;
  private budget = REACT_BUDGET_PER_SEC;
  private budgetT = 0;
  private bigFx: number[] = [];
  private maxAvatars = 60;
  private idleMs = 60000;
  private lv2 = 100;
  private lv3 = 1000;

  constructor(private out: RenderSink) {
    try {
      this.provCounts = JSON.parse(localStorage.getItem(LS_PROV) ?? '{}');
      this.userProv = new Map(Object.entries(JSON.parse(localStorage.getItem(LS_USER_PROV) ?? '{}')).map(([k, v]) => [k, Number(v)]));
    } catch { /* localStorage có thể bị chặn */ }
    this.out.provinces(this.provCounts);
  }

  get count() { return this.avatars.size; }
  get queued() { return this.queue.length; }
  has(id: string) { return this.avatars.has(id); }
  ids() { return [...this.avatars.keys()]; }

  configure(s: Settings) {
    this.demo = s.demo;
    this.setTeamsOn(s.teams ?? true);
    this.idleMs = s.idleReplaceSec * 1000;
    this.leaveMs = (s.leaveMin ?? 0) * 60000;
    this.lv2 = s.giftLv2;
    this.lv3 = s.giftLv3;
    if (s.maxAvatars !== this.maxAvatars) {
      this.maxAvatars = s.maxAvatars;
      this.enforceMax();
      this.drainQueue();
    }
  }

  reset() {
    for (const id of [...this.avatars.keys()]) this.out.despawn(id);
    this.avatars.clear();
    this.slotOwner.clear();
    this.pending.clear();
    this.queue = [];
    this.tops.clear();
    this.wins = { red: 0, blue: 0 };
    this.result = null;
    this.resetRound();
    this.totalGift = 0;
    this.out.top([], 0);
  }

  /** Gọi mỗi giây ~ vài lần: nạp ngân sách phản ứng, xử lý hàng đợi. */
  tick(dtSec: number) {
    this.budgetT += dtSec;
    if (this.budgetT >= 1) { this.budgetT = 0; this.budget = REACT_BUDGET_PER_SEC; }
    const now = performance.now();
    this.bigFx = this.bigFx.filter((t) => now - t < BIG_FX_MS);
    // TikTok không báo người rời phòng: coi như đã rời nếu im lặng quá lâu (không áp dụng cho avatar DEMO)
    if (!this.demo && this.leaveMs > 0) {
      for (const a of [...this.avatars.values()]) {
        if (!this.pending.has(a.slot.id) && now - a.lastActive > this.leaveMs) this.evict(a);
      }
    }
    this.tickTeams(dtSec);
    if (this.queue.length) this.drainQueue();
  }

  handle(ev: LiveEvent) {
    this.events++;
    const now = performance.now();
    const existed = this.avatars.has(ev.userId);
    if (ev.type === 'JOIN' && ev.follower) this.remember(ev.userId, { follower: true });
    const a = this.ensure(ev.userId, ev.name, ev.type === 'GIFT');
    if (!a) return; // vào hàng đợi
    a.lastActive = now;

    switch (ev.type) {
      case 'JOIN':
        if (existed) {
          // vào lại khi avatar còn trên sân (TikTok không báo lúc rời): chào lại bằng đèn soi + dòng chữ
          if (!this.demo && now - (a.welcomedAt ?? 0) > 8000) {
            const h = this.history.get(a.userId);
            a.welcomedAt = now;
            this.out.welcome(a.userId, a.name, h && h.gift > 0 ? 'gold' : h?.follower || a.follower ? 'pink' : 'white');
          }
          if (this.spend()) this.out.react(a.userId, 'wave');
        } // spawn mới đã xử lý trong ensure()
        break;
      case 'LIKE':
        if (now - a.lastLike < LIKE_COOLDOWN) return; // gộp like liên tục
        a.lastLike = now;
        if (this.spend()) { this.out.heart(a.userId, Math.min(6, 2 + Math.floor((ev.count ?? 1) / 5))); this.out.react(a.userId, 'like_react'); }
        break;
      case 'COMMENT': {
        this.score(a);
        const c = parseCommand(ev.text);
        if (c) { this.runCommand(a, c); break; } // lệnh không hiện thành bong bóng
        const text = sanitizeComment(ev.text);
        if (text) this.out.bubble(a.userId, text);
        break;
      }
      case 'FOLLOW':
        a.follower = true;
        this.remember(ev.userId, { follower: true });
        this.out.badge(a.userId);
        this.out.glow(a.userId, 2.5);
        if (this.spend()) { this.out.react(a.userId, 'follow_react'); this.out.sparkle(a.userId, 14, 0xffd23f); }
        break;
      case 'SHARE':
        if (this.spend()) { this.out.sparkle(a.userId, 12, 0x6ff0ff); this.out.react(a.userId, Math.random() < 0.5 ? 'wave' : 'cheer'); }
        break;
      case 'GIFT': {
        const units = Math.max(1, ev.repeatCount ?? 1);
        const value = Math.max(1, ev.diamonds) * units;
        a.giftTotal += value;
        this.remember(ev.userId, { gift: value });
        this.totalGift += value;
        this.updateTop(a);
        let level: 1 | 2 | 3 = value >= this.lv3 ? 3 : value >= this.lv2 ? 2 : 1;
        // giới hạn hiệu ứng lớn đồng thời
        if (level > 1 && this.bigFx.length >= MAX_BIG_FX) level = 1;
        if (level > 1) this.bigFx.push(now);
        const c = this.combos.get(a.userId);
        const combo = c && now - c.t < COMBO_MS ? c.n + units : units;
        this.combos.set(a.userId, { n: combo, t: now });
        if (this.combos.size > 500) this.combos.delete(this.combos.keys().next().value as string);
        this.out.gift(a.userId, level, ev.giftName, combo, units);
        this.out.react(a.userId, 'gift_react');
        break;
      }
    }
  }

  // ---- nội bộ ----

  private runCommand(a: AvatarState, c: NonNullable<ReturnType<typeof parseCommand>>) {
    const now = performance.now();
    if (now - a.lastCmd < CMD_COOLDOWN || !this.spend()) return;
    a.lastCmd = now;
    if (c.cmd === 'team') {
      if (!this.teamsOn) return; a.team = c.team; this.out.team(a.userId, c.team); return; }
    if (c.cmd === 'province') { this.setProvince(a, c.text); return; }
    if (c.cmd === 'dance') { this.out.dance(a.userId, c.n); return; }
    if (c.cmd === 'cheers') {
      let best: AvatarState | null = null;
      let bd = CHEERS_RANGE;
      for (const o of this.avatars.values()) {
        if (o === a || this.pending.has(o.slot.id)) continue;
        const d = Math.hypot(o.slot.x - a.slot.x, o.slot.y - a.slot.y);
        if (d < bd) { bd = d; best = o; }
      }
      this.out.link(a.userId, best?.userId ?? a.userId, 'cheers');
      return;
    }
    const t = fold(c.target);
    let hit: AvatarState | null = null;
    let rank = 0;
    for (const o of this.avatars.values()) {
      if (o === a) continue;
      const n = fold(o.name);
      const r = n === t ? 3 : n.startsWith(t) ? 2 : n.includes(t) ? 1 : 0;
      if (r > rank) { rank = r; hit = o; }
    }
    if (hit) this.out.link(a.userId, hit.userId, 'love');
  }

  private setProvince(a: AvatarState, text: string) {
    const idx = matchProvince(text);
    if (idx === null) return;
    const prev = this.userProv.get(a.userId);
    if (prev === idx) return;
    if (prev !== undefined) this.provCounts[prev] = Math.max(0, (this.provCounts[prev] ?? 0) - 1);
    const wasLit = (this.provCounts[idx] ?? 0) > 0;
    this.provCounts[idx] = (this.provCounts[idx] ?? 0) + 1;
    this.userProv.delete(a.userId);
    this.userProv.set(a.userId, idx);
    if (this.userProv.size > 3000) this.userProv.delete(this.userProv.keys().next().value as string);
    try {
      localStorage.setItem(LS_PROV, JSON.stringify(this.provCounts));
      localStorage.setItem(LS_USER_PROV, JSON.stringify(Object.fromEntries(this.userProv)));
    } catch { /* ignore */ }
    const name = PROVINCES[idx].name;
    const covered = PROVINCES.reduce((n, _, i) => n + ((this.provCounts[i] ?? 0) > 0 ? 1 : 0), 0);
    this.out.province(a.userId, name, wasLit ? `📍 ${name}` : `📍 ${name} · ${covered}/${PROVINCES.length}`);
    this.out.provinces(this.provCounts, wasLit ? undefined : idx);
  }

  private score(a: AvatarState) {
    if (!a.team || this.result) return;
    const used = this.round.per.get(a.userId) ?? 0;
    if (used >= USER_CAP) return;
    this.round.per.set(a.userId, used + 1);
    this.round[a.team]++;
  }

  /** Tắt đối kháng: bỏ phe của mọi avatar, ẩn thanh tỉ số, xoá vòng đang chạy. */
  private setTeamsOn(on: boolean) {
    if (on === this.teamsOn) return;
    this.teamsOn = on;
    if (on) return;
    for (const a of this.avatars.values()) if (a.team) { a.team = undefined; this.out.team(a.userId, null); }
    this.result = null;
    this.wins = { red: 0, blue: 0 };
    this.resetRound();
  }

  private resetRound() {
    this.round = { left: ROUND_SEC, red: 0, blue: 0, per: new Map() };
  }

  private tickTeams(dt: number) {
    const members = { red: 0, blue: 0 };
    for (const a of this.avatars.values()) if (a.team) members[a.team]++;
    const active = members.red + members.blue > 0;
    const r = this.round;
    if (this.result) {
      this.result.left -= dt;
      if (this.result.left <= 0) { this.result = null; this.resetRound(); }
    } else if (active) {
      r.left -= dt;
      if (r.left <= 0) {
        if (r.red !== r.blue) {
          const winner = r.red > r.blue ? 'red' : 'blue';
          this.wins[winner]++;
          this.result = { winner, left: RESULT_SEC };
          this.out.teamResult(winner);
        } else this.resetRound(); // hoà: chơi lại vòng
      }
    }
    this.out.teams({
      active: active || !!this.result, red: r.red, blue: r.blue, left: Math.max(0, r.left),
      winsRed: this.wins.red, winsBlue: this.wins.blue, winner: this.result?.winner ?? null, members,
    });
  }

  private spend() { return this.budget-- > 0; }

  private remember(userId: string, p: { follower?: boolean; gift?: number }) {
    const h = this.history.get(userId) ?? { follower: false, gift: 0 };
    if (p.follower) h.follower = true;
    if (p.gift) h.gift += p.gift;
    this.history.delete(userId);
    this.history.set(userId, h);
    if (this.history.size > 3000) this.history.delete(this.history.keys().next().value as string);
  }

  /** Trả về avatar (có sẵn hoặc vừa tạo) hoặc null nếu phải xếp hàng đợi. */
  private ensure(userId: string, name: string, isGift: boolean): AvatarState | null {
    const ex = this.avatars.get(userId);
    if (ex) {
      if (ex.name !== name) ex.name = name;
      return ex;
    }
    const slot = this.allocSlot(isGift);
    if (!slot) {
      const q = this.queue.find((x) => x.userId === userId);
      if (q) q.gift ||= isGift;
      else this.queue.push({ userId, name, gift: isGift });
      if (isGift) this.queue.sort((a, b) => Number(b.gift) - Number(a.gift));
      return null;
    }
    return this.place(userId, name, slot);
  }

  private place(userId: string, name: string, slot: Slot): AvatarState {
    const now = performance.now();
    const a: AvatarState = {
      userId, name, slot,
      template: Math.floor(Math.random() * TEMPLATE_COUNT),
      joinedAt: now, lastActive: now, giftTotal: 0, follower: false, lastLike: 0, lastCmd: 0,
    };
    this.avatars.set(userId, a);
    this.slotOwner.set(slot.id, userId);
    this.out.spawn(a);
    const h = this.history.get(userId);
    if (h?.follower) { a.follower = true; this.out.badge(userId); }
    const pi = this.userProv.get(userId);
    if (pi !== undefined) this.out.province(userId, PROVINCES[pi]?.name ?? null);
    a.welcomedAt = now;
    if (!this.demo) this.out.welcome(userId, name, h && h.gift > 0 ? 'gold' : h?.follower ? 'pink' : 'white');
    return a;
  }

  private activeSlotIds() { return new Set(this.order.slice(0, this.maxAvatars)); }

  private allocSlot(isGift: boolean): Slot | null {
    const active = this.activeSlotIds();
    const free = this.order.filter((id) => active.has(id) && !this.slotOwner.has(id) && !this.pending.has(id));
    if (free.length) return this.slots[free[0]];
    // hết slot: thay avatar ít ưu tiên nhất (chỉ khi đã im lặng đủ lâu, hoặc người mới là gifter)
    const victim = this.pickVictim(isGift);
    if (!victim) return null;
    this.evict(victim);
    return null; // slot sẽ mở sau FADE_MS; hàng đợi xử lý tiếp
  }

  private pickVictim(isGift: boolean): AvatarState | null {
    const now = performance.now();
    let best: AvatarState | null = null;
    let bestScore = Infinity;
    for (const a of this.avatars.values()) {
      if (!this.activeSlotIds().has(a.slot.id) || this.pending.has(a.slot.id)) continue;
      const idle = now - a.lastActive;
      if (!isGift && idle < this.idleMs) continue;
      if (isGift && a.giftTotal > 0 && idle < this.idleMs) continue; // gifter chỉ bị thay bởi gifter khi cũng im lặng
      const score = a.giftTotal * 1e6 + a.lastActive; // gift cao => giữ lại, im lâu => thay trước
      if (score < bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  private evict(a: AvatarState) {
    this.pending.add(a.slot.id);
    this.out.despawn(a.userId);
    this.avatars.delete(a.userId);
    const sid = a.slot.id;
    setTimeout(() => {
      this.slotOwner.delete(sid);
      this.pending.delete(sid);
      this.drainQueue();
    }, FADE_MS);
  }

  private enforceMax() {
    const active = this.activeSlotIds();
    for (const a of [...this.avatars.values()]) {
      if (!active.has(a.slot.id)) this.evict(a);
    }
  }

  private drainQueue() {
    while (this.queue.length) {
      const active = this.activeSlotIds();
      const freeId = this.order.find((id) => active.has(id) && !this.slotOwner.has(id) && !this.pending.has(id));
      if (freeId === undefined) {
        // thử thay avatar im lặng cho người đầu hàng đợi
        if (this.pending.size < this.queue.length) {
          const victim = this.pickVictim(this.queue[0].gift);
          if (victim) this.evict(victim);
        }
        return;
      }
      const q = this.queue.shift()!;
      this.place(q.userId, q.name, this.slots[freeId]);
    }
  }

  private updateTop(a: AvatarState) {
    this.tops.set(a.userId, { userId: a.userId, name: a.name, total: a.giftTotal });
    const list = [...this.tops.values()].sort((x, y) => y.total - x.total).slice(0, 3);
    this.out.top(list, this.totalGift);
  }
}
