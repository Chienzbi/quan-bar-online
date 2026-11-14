import { Application, Container, Texture } from 'pixi.js';
import { loadGifFrames, type GifFrames } from './gifFrames';
import type { AvatarState, RenderSink, TopEntry } from '../engine/avatars';
import { STAGE_H, STAGE_W } from '../engine/slots';
import type { Clip } from '../shared/types';
import type { AudioEngine } from './audio';
import { ChibiView } from './chibi/rig';
import { Fx } from './fx';
import { Camera } from './camera';
import { BarScene } from './scene';
import { AvatarView, StickerView } from './sticker';
import { TopBoard } from './topboard';
import { JoinTicker, type Tier } from './ticker';

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
  private avatars = new Container();
  private views = new Map<string, View>();
  private dying: { v: AvatarView; left: number }[] = [];
  private stickers: (Texture | GifFrames)[] = [];
  private dj: ChibiView;
  private topList: TopEntry[] = [];
  params = { anim: 1, light: 1, lasers: true, camera: true };
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
    app.stage.addChild(this.camera.world, this.ticker); // dải chữ nằm ngoài camera nên không bị zoom
    this.camera.pick = () => this.pickShot();

    app.ticker.add((tk) => this.frame(Math.min(0.05, tk.deltaMS / 1000)));
  }

  static async create(host: HTMLElement, audio: AudioEngine): Promise<BarRenderer> {
    const app = new Application();
    await app.init({ width: STAGE_W, height: STAGE_H, background: 0x07030f, antialias: true, resolution: 1, autoDensity: false, powerPreference: 'high-performance' });
    host.appendChild(app.canvas);
    let bg: Texture | undefined;
    try { if (!location.search.includes('noimg')) bg = await loadImageTexture('/bg/bar-top.png'); } catch { console.warn('Không nạp được /bg/bar-top.png, dùng scene vector'); }
    const stickers: (Texture | GifFrames)[] = [];
    try {
      const res = await fetch('/stickers/index.json');
      const names: unknown = await res.json();
      if (Array.isArray(names)) {
        for (const n of names.slice(0, 40)) {
          try {
            const url = `/stickers/${encodeURIComponent(String(n))}`;
            if (/\.gif$/i.test(String(n))) stickers.push(await loadGifFrames(url));
            else stickers.push(await loadImageTexture(url));
          } catch { console.warn('Không nạp được sticker', n); }
        }
      }
    } catch { /* chưa có sticker: dùng chibi */ }
    const r = new BarRenderer(app, audio, host, bg, stickers);
    if (bg) {
      try {
        const [body, armL, armR] = await Promise.all(['body', 'armL', 'armR'].map((n) => loadImageTexture(`/bg/dj-${n}.png`)));
        r.scene.addDj({ body, armL, armR });
      } catch { console.warn('Không nạp được DJ'); }
      try {
        const [l, rt] = await Promise.all(['a', 'b'].map((n) => loadImageTexture(`/bg/pet-${n}.png`)));
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
    if (v) this.fx.welcome(v.a.slot.x, v.a.slot.y, v.a.slot.scale, tier);
    this.ticker.push(name, tier);
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

  gift(userId: string, level: 1 | 2 | 3, giftName: string) {
    const v = this.views.get(userId);
    if (!v) return;
    const { x, y, scale } = v.a.slot;
    const top = y - 120 * scale;
    v.view.glowFor(level === 1 ? 1.5 : 3);
    this.fx.giftIcon(x, top - 20, giftName, level);
    this.fx.hearts(x, top + 20, level === 1 ? 5 : 8);
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
  }

  destroy() {
    this.ro?.disconnect();
    this.app.destroy(true, { children: true });
  }
}
