import { Application, Container, Texture } from 'pixi.js';
import { loadGifFrames, type GifBg, type GifFrames } from './gifFrames';
import type { AvatarState, RenderSink, TeamState, TopEntry } from '../engine/avatars';
import { STAGE_H, STAGE_W } from '../engine/slots';
import type { Clip } from '../shared/types';
import { DANCE_CLIPS } from './chibi/poses';
import type { AudioEngine } from './audio';
import { ChibiView } from './chibi/rig';
import { Fx } from './fx';
import { asset } from '../shared/assets';
import { Camera } from './camera';
import { fold } from '../engine/commands';
import { BarScene } from './scene';
import { AvatarView, StickerView } from './sticker';
import { TopBoard } from './topboard';
import { TEAM_COLOR, TeamBar } from './teambar';
import { VnMap } from './vnmap';
import { GiftScene } from './giftscene';
import { ComboText } from './combo';
import { VariantFx } from './variantfx';
import { RoseFx } from './rosefx';
import { EmoteFx } from './emotefx';
import { CommandHint, JoinTicker, type Tier } from './ticker';

/** Nạp ảnh qua HTMLImageElement (tránh đường ImageBitmap của Assets). */
async function loadImageTexture(url: string): Promise<Texture> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return Texture.from(img);
}

interface View { view: AvatarView; a: AvatarState; follower: boolean }

/**
 * Hiện thực RenderSink bằng PixiJS. Engine chỉ gọi interface; không import gì từ đây.
 * Thứ tự lớp: scene (nền, sân khấu, sàn, laser) -> spotlight -> avatar (sort theo Y) -> fx/bubble.
 */
export class BarRenderer implements RenderSink {
  readonly app: Application;
  readonly scene: BarScene;
  readonly fx: Fx;
  readonly board: TopBoard;
  readonly camera = new Camera();
  private ticker = new JoinTicker();
  private hint = new CommandHint();
  private teamBar = new TeamBar();
  private vnmap = new VnMap();
  private giftScene?: GiftScene;
  private combo = new ComboText();
  private variantFx?: VariantFx;
  private roses?: RoseFx;
  private emotes?: EmoteFx;
  private flights = new Map<string, { t: number; dur: number; acc: number }>();
  private t1 = Math.floor(Math.random() * 5); // biến thể quà cấp 1 kế tiếp
  private teamTempo: { winner: 'red' | 'blue'; left: number } | null = null;
  private avatars = new Container();
  private views = new Map<string, View>();
  private dying: { v: AvatarView; left: number }[] = [];
  private stickers: (Texture | GifFrames)[] = [];
  private dj: ChibiView;
  private topList: TopEntry[] = [];
  params = { anim: 1, light: 1, lasers: true, camera: true, wings: true };
  private ro?: ResizeObserver;

  private constructor(app: Application, private audio: AudioEngine, private host: HTMLElement, bg?: Texture, stickers: (Texture | GifFrames)[] = []) {
    this.app = app;
    this.stickers = stickers;
    this.scene = new BarScene(bg);
    this.board = new TopBoard(!!bg);
    this.fx = new Fx(app);
    this.avatars.sortableChildren = true;
    this.avatars.eventMode = 'none';

    this.scene.billboard.addChild(this.board);
    this.dj = new ChibiView(13, 'DJ');
    this.dj.hideLabel();
    this.dj.baseScale = 1.2;
    this.dj.position.set(540, 700);
    if (!this.scene.hasImage) this.scene.djSlot.addChild(this.dj); // ảnh nền: DJ là sprite cắt từ ảnh

    app.stage.eventMode = 'none';
    this.camera.world.addChild(this.scene.root, this.fx.beams, this.avatars, this.fx.layer);
    app.stage.addChild(this.camera.world, this.ticker, this.hint, this.teamBar, this.vnmap);
    this.vnmap.position.set(24, 350); // dải chữ nằm ngoài camera nên không bị zoom
    this.camera.pick = () => this.pickShot();

    app.ticker.add((tk) => this.frame(Math.min(0.05, tk.deltaMS / 1000)));
  }

  static async create(host: HTMLElement, audio: AudioEngine): Promise<BarRenderer> {
    const app = new Application();
    await app.init({ width: STAGE_W, height: STAGE_H, background: 0x07030f, antialias: true, resolution: 1, autoDensity: false, powerPreference: 'high-performance' });
    host.appendChild(app.canvas);
    let bg: Texture | undefined;
    try { if (!location.search.includes('noimg')) bg = await loadImageTexture(asset('bg/bar-top.png')); } catch { console.warn('Không nạp được /bg/bar-top.png, dùng scene vector'); }
    const stickers: (Texture | GifFrames)[] = [];
    try {
      const res = await fetch(asset('stickers/index.json'));
      const names: unknown = await res.json();
      if (Array.isArray(names)) {
        for (const n of names.slice(0, 40)) {
          try {
            const url = asset(`stickers/${encodeURIComponent(String(n))}`);
            if (/\.gif$/i.test(String(n))) stickers.push(await loadGifFrames(url));
            else stickers.push(await loadImageTexture(url));
          } catch { console.warn('Không nạp được sticker', n); }
        }
      }
    } catch { /* chưa có sticker: dùng chibi */ }
    try {
      const [l, rt] = await Promise.all(['l', 'r'].map((n) => loadImageTexture(asset(`bg/wing-${n}.png`))));
      StickerView.wingTex = { l, r: rt };
    } catch { console.warn('Không nạp được cánh'); }
    const gif = async (n: string, mode: GifBg) => { try { return await loadGifFrames(asset(`bg/fx/${n}`), mode); } catch { console.warn('Không nạp được hiệu ứng', n); return undefined; } };
    const [halo, pedestal, phoenix, dragon] = await Promise.all([
      gif('06_hao_quang_vang_xoay_trong_suot.gif', 'keep'),
      gif('03_be_san_khau_neon_chay_vong.gif', 'black'),
      gif('01_phuong_hoang_vo_canh.gif', 'keep'),
      gif('07_rong_vang_uon_luon_nen_den.gif', 'keep'),
    ]);
    const cloud = await gif('04_may_vang_cuon_nen_sang.gif', 'whiteAll');
    let glow: Texture | undefined;
    try { glow = await loadImageTexture(asset('bg/fx/glow-s.png')); } catch { console.warn('Không nạp được glow-s.png'); }
    StickerView.fxTex = { halo, pedestal };
    const r = new BarRenderer(app, audio, host, bg, stickers);
    if (phoenix || dragon) {
      r.giftScene = new GiftScene(app, { phoenix, dragon, cloud, glow });
      app.stage.addChild(r.giftScene); // trên cùng, phủ cả dải chào, bản đồ, khung lệnh
    }
    r.variantFx = new VariantFx(app, () => !!r.giftScene?.busy);
    app.stage.addChildAt(r.variantFx, app.stage.getChildIndex(r.camera.world) + 1); // dưới cảnh quà cấp 3
    r.roses = new RoseFx(app, () => (r.scene.hasImage ? r.scene.ip(470, 866) : [540, 760]));
    r.roses.onLand = () => audio.sfx('rose');
    r.camera.world.addChild(r.roses); // trong thế giới camera nên phóng to cùng cảnh
    r.emotes = new EmoteFx(app);
    r.emotes.onPop = (x, y) => r.fx.hearts(x, y, 3);
    r.emotes.onClink = (x, y) => { r.fx.sparkles(x, y, 14, 0xfff2a8); r.fx.popText(x, y - 30, '🍻 Cheers!'); audio.sfx('rose'); };
    r.camera.world.addChild(r.emotes);
    app.stage.addChild(r.combo); // trên cả cảnh tặng quà
    if (bg) {
      try {
        const [body, armL, armR] = await Promise.all(['body', 'armL', 'armR'].map((n) => loadImageTexture(asset(`bg/dj-${n}.png`))));
        r.scene.addDj({ body, armL, armR });
      } catch { console.warn('Không nạp được DJ'); }
      try {
        const [l, rt] = await Promise.all(['a', 'b'].map((n) => loadImageTexture(asset(`bg/pet-${n}.png`))));
        r.scene.addPets(l, rt);
      } catch { console.warn('Không nạp được hai nhân vật có cánh'); }
    }
    r.fit();
    r.ro = new ResizeObserver(() => r.fit());
    r.ro.observe(host);
    return r;
  }

  /** Giữ đúng tỉ lệ 9:16, không kéo giãn, không thanh cuộn. */
  private fit() {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    const k = Math.min(w / STAGE_W, h / STAGE_H);
    this.app.canvas.style.width = `${Math.floor(STAGE_W * k)}px`;
    this.app.canvas.style.height = `${Math.floor(STAGE_H * k)}px`;
  }

  get fps() { return this.app.ticker.FPS; }

  private frame(dt: number) {
    this.audio.update(dt);
    this.camera.enabled = this.params.camera;
    this.camera.update(dt);
    this.scene.update(dt, this.audio, { light: this.params.light, lasers: this.params.lasers });
    const beat = this.audio.beat;
    if (!this.scene.hasImage) this.dj.update(dt, beat, this.params.anim);
    for (const { view } of this.views.values()) view.update(dt, beat, this.params.anim);
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.left -= dt;
      d.v.update(dt, beat, this.params.anim);
      if (d.left <= 0) { d.v.destroy(); this.dying.splice(i, 1); }
    }
    this.board.update(dt);
    this.ticker.update(dt);
    this.hint.update(dt);
    for (const { view } of this.views.values()) view.setWings?.(this.params.wings);
    this.giftScene?.update(dt);
    this.variantFx?.update(dt);
    this.roses?.update(dt);
    this.emotes?.update(dt);
    this.combo.update(dt);
    this.updateFlights(dt);
    this.teamBar.update(dt);
    this.vnmap.update(dt);
    this.updateTempo(dt);
    this.fx.update(dt);
  }

  /** Chọn đối tượng cho máy quay: DJ (~35%) hoặc một nhân vật đang đứng trên sàn. */
  private pickShot() {
    const list = [...this.views.values()].filter((v) => !v.view.dead);
    if (!list.length || Math.random() < 0.35) {
      const [x, y] = this.scene.hasImage ? this.scene.ip(470, 700) : [540, 650];
      return { x, y, zoom: 1.9 };
    }
    const { a } = list[Math.floor(Math.random() * list.length)];
    return { x: a.slot.x, y: a.slot.y - 70 * a.slot.scale, zoom: 2.1 + Math.random() * 0.4 };
  }

  // ---- RenderSink ----

  spawn(a: AvatarState) {
    const view: AvatarView = this.stickers.length
      ? new StickerView(this.stickers[a.template % this.stickers.length], a.name)
      : new ChibiView(a.template, a.name);
    view.baseScale = a.slot.scale;
    view.labelScale = 0.78 + 0.22 * a.slot.depth;
    view.position.set(a.slot.x, a.slot.y);
    view.zIndex = a.slot.y;
    view.play('spawn');
    this.avatars.addChild(view);
    this.views.set(a.userId, { view, a, follower: false });
    this.fx.sparkles(a.slot.x, a.slot.y - 50 * a.slot.scale, 5, 0xb98cff);
  }

  despawn(userId: string) {
    const v = this.views.get(userId);
    if (!v) return;
    v.view.play('despawn');
    this.views.delete(userId);
    this.fx.clearBubble(userId);
    this.dying.push({ v: v.view, left: 1.1 });
  }

  welcome(userId: string, name: string, tier: Tier) {
    const v = this.views.get(userId);
    if (v) {
      this.fx.welcome(v.a.slot.x, v.a.slot.y, v.a.slot.scale, tier);
      // người từng follow/tặng quà vào bar: zoom vào chỗ họ đứng (có thời gian chờ, không chen vào góc đang chiếu)
      if (tier !== 'white' && this.params.camera) this.camera.focus({ x: v.a.slot.x, y: v.a.slot.y - 70 * v.a.slot.scale, zoom: 2 }, 3);
    }
    this.ticker.push(name, tier);
  }

  /**
   * Focus thủ công từ Panel. target: 'dj' | 'random' | 'off' (về toàn cảnh) | 'name:<tên>'.
   * Hoạt động cả khi tự động lia camera đang tắt.
   */
  focusOn(target: string) {
    if (target === 'off') { this.camera.release(); return; }
    const HOLD = 8;
    if (target === 'dj') {
      const [x, y] = this.scene.hasImage ? this.scene.ip(470, 700) : [540, 650];
      this.camera.focus({ x, y, zoom: 1.9 }, HOLD, true);
      return;
    }
    let list = [...this.views.values()].filter((v) => !v.view.dead);
    if (target.startsWith('name:')) {
      const q = fold(target.slice(5));
      list = q ? list.filter((v) => fold(v.a.name).includes(q)) : [];
    }
    if (!list.length) return;
    const { a } = list[Math.floor(Math.random() * list.length)];
    this.camera.focus({ x: a.slot.x, y: a.slot.y - 70 * a.slot.scale, zoom: 2.2 }, HOLD, true);
  }

  private updateTempo(dt: number) {
    const t = this.teamTempo;
    if (!t) return;
    t.left -= dt;
    for (const { view, a } of this.views.values()) view.setTempo?.(t.left <= 0 || !a.team ? 1 : a.team === t.winner ? 1.3 : 0.6);
    if (t.left <= 0) this.teamTempo = null;
  }

  province(userId: string, label: string | null, announce?: string) {
    const v = this.views.get(userId);
    if (!v) return;
    v.view.setTag?.(label);
    const s = v.a.slot;
    if (announce) this.fx.popText(s.x, s.y - 150 * s.scale, announce);
  }

  provinces(counts: Record<number, number>, lit?: number) { this.vnmap.setData(counts, lit); }

  team(userId: string, team: 'red' | 'blue' | null) {
    const v = this.views.get(userId);
    if (!v) return;
    v.view.setTeam?.(team ? TEAM_COLOR[team] : null);
    const s = v.a.slot;
    if (team) this.fx.sparkles(s.x, s.y - 40 * s.scale, 8, TEAM_COLOR[team]);
  }

  teams(s: TeamState) { this.teamBar.set(s); }

  teamResult(winner: 'red' | 'blue') {
    this.teamTempo = { winner, left: 15 };
    let n = 0;
    for (const { view, a } of this.views.values()) {
      if (a.team !== winner || n++ >= 12) continue;
      this.fx.confetti(a.slot.x, a.slot.y - 80 * a.slot.scale, 10);
      view.play('cheer');
    }
    this.scene.burst(3);
  }

  link(fromId: string, toId: string, kind: 'cheers' | 'love') {
    const a = this.views.get(fromId);
    const b = this.views.get(toId);
    if (!a || !b) return;
    const pa = a.a.slot, pb = b.a.slot;
    const ya = pa.y - 90 * pa.scale, yb = pb.y - 90 * pb.scale;
    if (kind === 'love') {
      this.fx.fly(pa.x, ya, pb.x, yb, 8, 'heart', 0xff4f8b);
      b.view.play('like_react');
      a.view.play('wave');
      return;
    }
    a.view.play('cheer');
    if (a === b) { this.fx.popText(pa.x, ya - 30, '🥂 Cheers!'); this.fx.sparkles(pa.x, ya, 10, 0xffe27a); return; }
    b.view.play('cheer');
    const mx = (pa.x + pb.x) / 2, my = (ya + yb) / 2;
    this.fx.sparkles(mx, my, 18, 0xffe27a);
    this.fx.popText(mx, my - 30, '🥂 Cheers!');
  }

  dance(userId: string, n: number) {
    const v = this.views.get(userId);
    if (!v) return;
    // GIF không có kiểu nhảy theo clip: cho nảy lên một nhịp thay thế
    const clip: Clip = v.view instanceof StickerView && v.view.animated ? 'cheer' : DANCE_CLIPS[(n - 1) % DANCE_CLIPS.length];
    v.view.play(clip);
    const s = v.a.slot;
    this.fx.sparkles(s.x, s.y - 60 * s.scale, 8, 0x6ff0ff);
  }

  react(userId: string, clip: Clip) { this.views.get(userId)?.view.play(clip); }

  bubble(userId: string, text: string) {
    const v = this.views.get(userId);
    if (!v) return;
    const s = v.a.slot;
    this.fx.bubble(userId, s.x, s.y - 134 * s.scale - 24 * (0.78 + 0.22 * s.depth), text);
  }

  heart(userId: string, n: number) {
    const v = this.views.get(userId);
    if (v) this.fx.hearts(v.a.slot.x, v.a.slot.y - 100 * v.a.slot.scale, n);
  }

  sparkle(userId: string, n: number, color: number) {
    const v = this.views.get(userId);
    if (v) this.fx.sparkles(v.a.slot.x, v.a.slot.y - 60 * v.a.slot.scale, n, color);
  }

  glow(userId: string, sec: number) { this.views.get(userId)?.view.glowFor(sec); }

  badge(userId: string) {
    const v = this.views.get(userId);
    if (!v) return;
    v.follower = true;
    this.refreshBadges();
  }

  /** Quà cấp 1: 5 hiệu ứng nhẹ xoay vòng (tim, pháo giấy, đèn rọi, bong bóng, chùm sao). */
  private smallBurst(x: number, y: number, scale: number) {
    const k = this.t1++ % 5;
    if (k === 0) this.fx.hearts(x, y, 5);
    else if (k === 1) { this.fx.confetti(x, y, 26); this.fx.sparkles(x, y + 20, 10, 0xffd23f); }
    else if (k === 2) { this.fx.spotlight(x, y + 120 * scale, 90 * scale + 40, 2, [0xfff2a8, 0xff9ad0, 0x7ff0ff][(Math.random() * 3) | 0]); this.fx.sparkles(x, y + 20, 12, 0xffffff); }
    else if (k === 3) this.fx.floatBubbles(x, y + 60 * scale, 14);
    else this.fx.starburst(x, y + 30, 16);
  }

  /** Avatar bay một vòng quanh sân (đường cong qua các điểm, có vệt sao) rồi đáp lại chỗ đứng. */
  private startFlight(userId: string) {
    if (this.views.has(userId) && !this.flights.has(userId)) this.flights.set(userId, { t: 0, dur: 3.2, acc: 0 });
  }

  private updateFlights(dt: number) {
    for (const [id, f] of this.flights) {
      const v = this.views.get(id);
      if (!v) { this.flights.delete(id); continue; }
      const s = v.a.slot;
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      if (u >= 1) {
        v.view.position.set(s.x, s.y);
        v.view.baseScale = s.scale;
        v.view.zIndex = s.y;
        this.flights.delete(id);
        continue;
      }
      const pts: [number, number][] = [[s.x, s.y], [540, 820], [900, 980], [180, 1100], [540, 760], [s.x, s.y]];
      const w = u * u * (3 - 2 * u) * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(w));
      const q = w - i;
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * q + (2 * a - 5 * b + 4 * c - d) * q * q + (-a + 3 * b - 3 * c + d) * q * q * q);
      const lift = Math.sin(Math.PI * u);
      const x = cr(p0[0], p1[0], p2[0], p3[0]);
      const y = cr(p0[1], p1[1], p2[1], p3[1]) - 140 * lift;
      v.view.position.set(x, y);
      v.view.baseScale = s.scale * (1 + 0.35 * lift);
      v.view.zIndex = 9999;
      f.acc += dt * 45;
      while (f.acc >= 1) { f.acc -= 1; this.fx.sparkles(x, y - 50 * s.scale, 1, [0xffe27a, 0xff9ad0, 0x7ff0ff][(Math.random() * 3) | 0]); }
    }
  }

  gift(userId: string, level: 1 | 2 | 3, giftName: string, combo = 1, units = 1) {
    const v = this.views.get(userId);
    if (!v) return;
    const { x, y, scale } = v.a.slot;
    const top = y - 120 * scale;
    v.view.glowFor(level === 1 ? 1.5 : 3);
    // Hoa hồng (quà nhiều nhất) có hiệu ứng riêng: ném hoa sang bàn DJ. Quà hoa hồng nhỏ không lia camera, không chữ combo giữa màn hình.
    if (/rose|hoa hong/.test(fold(giftName))) {
      this.roses?.toss(x, y - 100 * scale, units);
      if (combo >= 2) this.fx.popText(x, y - 150 * scale, `🌹 x${combo}`, 0xff6f9a);
      if (level === 1) return;
    }
    // quà trái tim: chùm bóng tim; quà bia: cụng ly. Quà nhỏ chỉ có hiệu ứng riêng, không lia camera.
    const gname = fold(giftName);
    if (/heart|tim|yeu/.test(gname)) {
      this.emotes?.hearts(x, y - 110 * scale, units);
      if (level === 1) return;
    } else if (/bia|beer/.test(gname)) {
      this.emotes?.beer(x, y - 120 * scale);
      if (level === 1) return;
    }
    // camera tự phóng vào avatar tặng quà, không phụ thuộc ô "Tự động lia camera".
    // cấp 1: chỉ khi đang toàn cảnh và đã qua thời gian chờ; cấp 2: ngắt mọi góc; cấp 3: cả màn hình chuyển sang GiftScene nên không cần lia.
    if (level === 1) this.camera.focus({ x, y: y - 70 * scale, zoom: 1.8 }, 2.5, false, true);
    else if (level === 2) {
      this.camera.focus({ x, y: y - 70 * scale, zoom: 2 }, 3.5, true, true);
      const onStart = () => this.audio.sfx('gift');
      const onEnd = () => this.startFlight(userId);
      if (this.variantFx) this.variantFx.play({ name: v.a.name, giftName, onStart, onEnd });
      else { onStart(); onEnd(); }
    } else {
      const onStart = () => this.audio.sfx('big');
      const onEnd = () => this.startFlight(userId); // bay một vòng sau khi cảnh quà kết thúc
      if (this.giftScene) this.giftScene.play({ name: v.a.name, giftName, rider: v.view instanceof StickerView ? v.view.source : null, onStart, onEnd });
      else { onStart(); onEnd(); }
    }
    if (combo >= 2) { this.combo.show(v.a.name, combo); this.audio.sfx('combo', combo); }
    this.fx.giftIcon(x, top - 20, giftName, level);
    if (level === 1) this.smallBurst(x, top + 20, scale);
    else this.fx.hearts(x, top + 20, 8);
    if (level >= 2) {
      this.fx.spotlight(x, y + 6, 120 * scale + 40, 3);
      this.fx.confetti(x, top, level === 2 ? 40 : 70);
      this.fx.sparkles(x, top + 30, 20, 0xffe27a);
    }
    if (level === 3) {
      this.fx.rain(2.5);
      this.scene.burst(4);
      this.fx.spotlight(540, 850, 220, 3.5, 0xff9ad0);
    }
  }

  top(list: TopEntry[], total: number) {
    this.topList = list;
    this.board.setData(list, total);
    this.refreshBadges();
  }

  private refreshBadges() {
    for (const [id, v] of this.views) {
      const rank = this.topList.findIndex((e) => e.userId === id) + 1;
      v.view.setBadges(v.follower, rank);
      v.view.setPedestal?.(rank === 1);
    }
  }

  resetVisuals() {
    for (const id of [...this.views.keys()]) {
      const v = this.views.get(id)!; v.view.destroy();
    }
    this.views.clear();
    this.dying.forEach((d) => d.v.destroy());
    this.dying = [];
    this.fx.reset();
    this.ticker.reset();
    this.teamTempo = null;
    this.flights.clear();
    this.roses?.reset();
    this.emotes?.reset();
  }

  destroy() {
    this.ro?.disconnect();
    this.app.destroy(true, { children: true });
  }
}
