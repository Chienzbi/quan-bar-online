/**
 * Âm nhạc + phân tích nhịp.
 * - Track mặc định là nhạc synth tự sinh bằng Web Audio (không dính bản quyền).
 * - Track file: đặt file được cấp quyền vào public/music/ và chọn 'file:/music/ten.mp3'.
 * - beat (số nhịp liên tục) luôn chạy kể cả khi tạm dừng nhạc, để đèn/nhân vật không đứng yên.
 */
import { asset } from '../shared/assets';

export const BANDS = 16;

interface SynthDef { bpm: number; root: number; scale: number[]; prog: number[] }
const SYNTHS: Record<string, SynthDef> = {
  'synth:neon': { bpm: 124, root: 45, scale: [0, 3, 7, 10], prog: [0, 0, 5, 3] }, // A minor
  'synth:pulse': { bpm: 128, root: 41, scale: [0, 3, 7, 12], prog: [0, 3, 5, 7] }, // F minor
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx?: AudioContext;
  private master?: GainNode;
  private analyser?: AnalyserNode;
  private freq = new Uint8Array(0);
  private media?: HTMLAudioElement;
  private mediaSrc?: MediaElementAudioSourceNode;
  private worker?: Worker;
  private fallback?: number;
  private yt?: any; // YT.Player (IFrame API không có type chính thức ở đây)
  private ytKey = '';
  private ytApi?: Promise<void>;
  private step = 0;
  private nextTime = 0;

  playing = false;
  /** true: bài hết thì phát lại chính nó; false (có danh sách >1 bài): gọi onEnded để sang bài tiếp. */
  loopTrack = true;
  onEnded?: () => void;
  volume = 0.6;
  track = 'synth:neon';
  bpm = 124;
  beat = 0; // số nhịp liên tục
  pulse = 0; // 0..1 bùng ở mỗi nhịp, giảm dần
  bass = 0; mid = 0; high = 0;
  bands = new Float32Array(BANDS);
  private lastBeatInt = 0;
  private avgBass = 0;
  private beatCool = 0;

  get state(): 'none' | 'suspended' | 'running' {
    if (!this.ctx) return 'none';
    return this.ctx.state === 'running' ? 'running' : 'suspended';
  }

  /** Tạo AudioContext (cần cử chỉ người dùng hoặc autoplay-policy cho phép). */
  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.7;
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.master.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
    try { this.yt?.setVolume?.(Math.round(v * 100)); } catch { /* player chưa sẵn sàng */ }
  }

  /** Gọi sau cử chỉ người dùng: mở khóa AudioContext và thử phát lại nguồn ngoài. */
  nudge() {
    this.ensure();
    if (!this.playing) return;
    if (this.track.startsWith('yt:')) { try { this.yt?.playVideo?.(); } catch { /* ignore */ } }
    else if (this.track.startsWith('file:')) void this.media?.play().catch(() => {});
  }

  private loadYtApi(): Promise<void> {
    const w = window as any;
    if (w.YT?.Player) return Promise.resolve();
    if (!this.ytApi) {
      this.ytApi = new Promise((res) => {
        const prev = w.onYouTubeIframeAPIReady;
        w.onYouTubeIframeAPIReady = () => { prev?.(); res(); };
        const sc = document.createElement('script');
        sc.src = 'https://www.youtube.com/iframe_api';
        sc.onerror = () => { this.ytApi = undefined; };
        document.head.appendChild(sc);
      });
    }
    return this.ytApi;
  }

  private async playYt(id: string) {
    console.info('[AUDIO] loading YouTube API for', id);
    await this.loadYtApi();
    console.info('[AUDIO] YouTube API loaded');
    if (!this.playing || this.track !== `yt:${id}`) return;
    if (this.yt && this.ytKey === id) { this.yt.playVideo(); return; }
    this.destroyYt();
    // Player nằm ngoài khung hình (stage chỉ cần âm thanh).
    const host = document.createElement('div');
    host.id = 'yt-audio-host';
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;pointer-events:none';
    const inner = document.createElement('div');
    host.appendChild(inner);
    document.body.appendChild(host);
    const YT = (window as any).YT;
    this.ytKey = id;
    this.yt = new YT.Player(inner, {
      width: '320', height: '180', videoId: id,
      playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1 },
      events: {
        onReady: (e: any) => { console.info('[AUDIO] YouTube player ready'); e.target.setVolume(Math.round(this.volume * 100)); e.target.playVideo(); },
        onStateChange: (e: any) => {
          console.info('[AUDIO] YouTube state', e?.data); // -1 chưa bắt đầu, 0 kết thúc, 1 đang phát, 2 tạm dừng, 3 đệm
          if (e?.data === 0) this.trackEnded();
        },
        onError: (e: any) => {
          console.warn('[AUDIO] YouTube player error', e?.data); // 2 id sai, 5 lỗi HTML5, 100 không tìm thấy, 101/150 chặn nhúng
          if (!this.loopTrack) this.onEnded?.(); // bài lỗi: nhảy sang bài tiếp trong danh sách
        },
      },
    });
  }

  /** Bài hiện tại phát hết: lặp lại (khi chỉ có 1 bài) hoặc báo để chuyển bài. */
  private trackEnded() {
    if (!this.playing) return;
    if (this.loopTrack) {
      if (this.track.startsWith('yt:')) { try { this.yt?.seekTo?.(0, true); this.yt?.playVideo?.(); } catch { /* ignore */ } }
      else if (this.media) { this.media.currentTime = 0; void this.media.play().catch(() => {}); }
    } else this.onEnded?.();
  }

  private destroyYt() {
    try { this.yt?.destroy?.(); } catch { /* ignore */ }
    this.yt = undefined; this.ytKey = '';
    document.getElementById('yt-audio-host')?.remove();
  }

  setTrack(id: string) {
    if (id === this.track && (this.playing || !this.ctx)) { this.track = id; return; }
    const was = this.playing;
    this.pause();
    this.track = id;
    if (was) this.play();
  }

  play() {
    this.playing = true;
    this.ensure();
    if (!this.ctx || !this.master) return;
    if (this.track.startsWith('yt:')) {
      this.stopTimer();
      this.bpm = 120; // không phân tích được âm thanh trong iframe => nhịp đèn theo đồng hồ nội bộ
      void this.playYt(this.track.slice(3));
    } else if (this.track.startsWith('file:')) {
      const url = this.track.slice(5);
      if (!this.media) {
        this.media = new Audio();
        this.media.loop = false;
        this.media.addEventListener('ended', () => this.trackEnded());
        this.media.addEventListener('error', () => { if (this.playing && !this.loopTrack) this.onEnded?.(); });
        this.media.crossOrigin = 'anonymous';
        this.mediaSrc = this.ctx.createMediaElementSource(this.media);
        this.mediaSrc.connect(this.master);
      }
      const src = url.startsWith('/') ? asset(url) : url; // '/music/x.mp3' -> đúng cả khi deploy dưới /<repo>/
      if (!this.media.src.endsWith(src.replace(/^\.\//, ''))) this.media.src = src;
      void this.media.play().catch(() => { /* chờ cử chỉ người dùng */ });
      this.bpm = 120;
    } else {
      const def = SYNTHS[this.track] ?? SYNTHS['synth:neon'];
      this.bpm = def.bpm;
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.08;
      this.stopTimer();
      // Worker không bị trình duyệt làm chậm như timer của tab nền; lỗi thì dùng setInterval
      const useFallback = () => {
        this.worker?.terminate(); this.worker = undefined;
        if (this.fallback === undefined) this.fallback = window.setInterval(() => this.schedule(def), 25);
      };
      try {
        const url = URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),50)'], { type: 'text/javascript' }));
        this.worker = new Worker(url);
        this.worker.onmessage = () => this.schedule(def);
        this.worker.onerror = useFallback;
      } catch {
        useFallback();
      }
    }
  }

  /** Vị trí hiện tại (giây) của nhạc file / YouTube; 0 với synth. */
  get position(): number {
    try {
      if (this.track.startsWith('file:')) return this.media?.currentTime || 0;
      if (this.track.startsWith('yt:')) return Number(this.yt?.getCurrentTime?.()) || 0;
    } catch { /* player chưa sẵn sàng */ }
    return 0;
  }

  /** Độ dài (giây); 0 nếu không tua được (synth sinh vô hạn, hoặc chưa tải xong). */
  get duration(): number {
    try {
      if (this.track.startsWith('file:')) { const d = this.media?.duration; return d && isFinite(d) ? d : 0; }
      if (this.track.startsWith('yt:')) return Number(this.yt?.getDuration?.()) || 0;
    } catch { /* player chưa sẵn sàng */ }
    return 0;
  }

  seek(sec: number) {
    const d = this.duration;
    if (!d) return;
    const t = Math.min(Math.max(0, sec), Math.max(0, d - 0.25));
    try {
      if (this.track.startsWith('file:') && this.media) this.media.currentTime = t;
      else if (this.track.startsWith('yt:')) this.yt?.seekTo?.(t, true);
    } catch { /* ignore */ }
  }

  pause() {
    this.playing = false;
    this.stopTimer();
    this.media?.pause();
    try { this.yt?.pauseVideo?.(); } catch { /* ignore */ }
  }

  private stopTimer() {
    this.worker?.terminate();
    this.worker = undefined;
    window.clearInterval(this.fallback);
    this.fallback = undefined;
  }

  // ---- synth ----
  private schedule(def: SynthDef) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') { if (ctx) this.nextTime = ctx.currentTime + 0.05; return; }
    const spb = 60 / def.bpm / 4; // 1/16
    while (this.nextTime < ctx.currentTime + 0.4) {
      this.note(def, this.step, this.nextTime);
      this.nextTime += spb;
      this.step++;
    }
  }

  private env(g: GainNode, t: number, peak: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  }

  private note(def: SynthDef, step: number, t: number) {
    const ctx = this.ctx!; const out = this.master!;
    const bar = Math.floor(step / 16) % 4;
    const s16 = step % 16;
    const rootNote = def.root + def.prog[bar];
    // kick
    if (s16 % 4 === 0) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      this.env(g, t, 0.9, 0.22); o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
      const delay = Math.max(0, (t - ctx.currentTime) * 1000);
      window.setTimeout(() => { if (this.playing) this.hit(); }, delay);
    }
    // clap
    if (s16 === 4 || s16 === 12) this.noise(t, 0.22, 1800, 0.14);
    // hat
    if (s16 % 2 === 0) this.noise(t, s16 % 4 === 2 ? 0.1 : 0.05, 7500, s16 % 4 === 2 ? 0.1 : 0.04);
    // bass off-beat
    if (s16 % 4 === 2) {
      const o = ctx.createOscillator(); const g = ctx.createGain(); const f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = mtof(rootNote);
      f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.18);
      this.env(g, t, 0.28, 0.2); o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.22);
    }
    // arpeggio
    if (s16 % 2 === 1 || s16 % 4 === 0) {
      const n = rootNote + 24 + def.scale[(step * 3 + bar) % def.scale.length];
      const o = ctx.createOscillator(); const g = ctx.createGain(); const f = ctx.createBiquadFilter();
      o.type = 'square'; o.frequency.value = mtof(n);
      f.type = 'lowpass'; f.frequency.value = 2400;
      this.env(g, t, 0.05, 0.12); o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.14);
    }
    // pad mỗi bar
    if (s16 === 0) {
      for (const iv of [0, 3, 7]) {
        const o = ctx.createOscillator(); const g = ctx.createGain(); const f = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = mtof(rootNote + 12 + iv); o.detune.value = (iv - 3) * 4;
        f.type = 'lowpass'; f.frequency.value = 1100;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + (60 / def.bpm) * 4);
        o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + (60 / def.bpm) * 4 + 0.05);
      }
    }
  }

  private noise(t: number, dur: number, hp: number, vol: number) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain(); this.env(g, t, vol, dur);
    s.connect(f).connect(g).connect(this.master!); s.start(t);
  }

  private hit() { this.pulse = 1; }

  /** Gọi mỗi frame. */
  update(dt: number) {
    this.beat += (dt * this.bpm) / 60;
    const ext = this.track.startsWith('yt:');
    const live = this.playing && !ext && this.ctx?.state === 'running' && this.analyser;
    const synth = this.track.startsWith('synth:');

    if (live) {
      this.analyser!.getByteFrequencyData(this.freq);
      const n = this.freq.length;
      for (let b = 0; b < BANDS; b++) {
        const a = Math.floor(Math.pow(b / BANDS, 1.8) * n * 0.6);
        const z = Math.max(a + 1, Math.floor(Math.pow((b + 1) / BANDS, 1.8) * n * 0.6));
        let sum = 0;
        for (let i = a; i < z; i++) sum += this.freq[i];
        const v = sum / (z - a) / 255;
        this.bands[b] += (v - this.bands[b]) * 0.5;
      }
      const avg = (a: number, z: number) => { let s = 0; for (let i = a; i < z; i++) s += this.freq[i]; return s / (z - a) / 255; };
      this.bass = avg(1, 6); this.mid = avg(6, 40); this.high = avg(40, Math.min(n, 120));
      if (!synth) { // phát hiện nhịp từ năng lượng bass cho file nhạc
        this.beatCool -= dt;
        this.avgBass += (this.bass - this.avgBass) * 0.03;
        if (this.bass > this.avgBass * 1.25 + 0.05 && this.beatCool <= 0) { this.hit(); this.beatCool = 0.28; }
      }
    } else {
      // nhịp giả khi không có âm thanh
      const bi = Math.floor(this.beat);
      if (bi !== this.lastBeatInt) { this.lastBeatInt = bi; this.pulse = 0.85; }
      const ph = this.beat % 1;
      for (let b = 0; b < BANDS; b++) {
        const v = (0.25 + 0.35 * Math.max(0, Math.sin(this.beat * 2 + b * 0.7)) + 0.3 * this.pulse) * (1 - b / (BANDS * 1.6));
        this.bands[b] += (v - this.bands[b]) * 0.25;
      }
      this.bass = 0.3 + 0.5 * this.pulse; this.mid = 0.3 + 0.2 * Math.sin(this.beat * 3); this.high = 0.3 + 0.2 * (1 - ph);
    }
    this.pulse = Math.max(0, this.pulse - dt * 3.2);
  }
}
