import { LiveEventAdapter, WsSource } from '../engine/adapter';
import { AvatarManager } from '../engine/avatars';
import { DemoDirector } from '../engine/demo';
import { AudioEngine } from '../render/audio';
import { BarRenderer } from '../render/renderer';
import { Bus } from '../shared/bus';
import { useBar } from '../shared/store';
import type { BusMsg, Settings } from '../shared/types';

/**
 * Nối các lớp lại với nhau:
 *   Nguồn sự kiện -> LiveEventAdapter -> AvatarManager -> (RenderSink) BarRenderer
 *   Control Panel <-> Bus <-> controller
 * Đổi nguồn sự kiện chỉ cần gọi adapter.setSource(...), renderer không đổi.
 */
export async function startStage(host: HTMLElement): Promise<() => void> {
  const audio = new AudioEngine();
  const renderer = await BarRenderer.create(host, audio);
  const manager = new AvatarManager(renderer);
  const adapter = new LiveEventAdapter();
  const bus = new Bus();
  const demo = new DemoDirector(adapter, () => manager.count);

  adapter.onEvent((e) => manager.handle(e));

  let prev: Partial<Settings> = {};
  const apply = (s: Settings) => {
    manager.configure(s);
    renderer.params.anim = s.animIntensity;
    renderer.params.light = s.lightIntensity;
    renderer.params.lasers = s.lasers;
    renderer.params.camera = s.camera ?? true;
    audio.loopTrack = (s.playlist?.length ?? 0) < 2;
    if (s.volume !== prev.volume) audio.setVolume(s.volume);
    if (s.track !== prev.track) audio.setTrack(s.track);
    if (s.musicPlaying !== prev.musicPlaying) (s.musicPlaying ? audio.play() : audio.pause());
    if (s.demo !== prev.demo) (s.demo ? demo.start() : demo.stop());
    prev = { ...s };
  };
  apply(useBar.getState().settings);
  const unsub = useBar.subscribe((st) => apply(st.settings));

  const resume = () => {
    audio.nudge();
  };
  window.addEventListener('pointerdown', resume);
  window.addEventListener('keydown', resume);

  /** Sang bài kế tiếp trong danh sách (hết danh sách thì quay lại bài đầu). */
  const nextTrack = () => {
    const { track, playlist } = useBar.getState().settings;
    if (!playlist?.length) return;
    const i = playlist.indexOf(track);
    const next = playlist[(i + 1) % playlist.length];
    if (next === track) audio.seek(0);
    else useBar.getState().setSettings({ track: next });
  };
  audio.onEnded = nextTrack;

  const doReset = () => { manager.reset(); renderer.fx.reset(); };

  const offBus = bus.on((m: BusMsg) => {
    switch (m.t) {
      case 'event': adapter.emit(m.event); break;
      case 'settings': useBar.getState().setSettings(m.patch); break;
      case 'cmd':
        if (m.name === 'reset') doReset();
        else if (m.name === 'seek') audio.seek(Number(m.arg) || 0);
        else if (m.name === 'next') nextTrack();
        else if (m.name === 'spawnTest') {
          const n = Math.min(60, Number(m.arg) || 10);
          for (let i = 0; i < n; i++) window.setTimeout(() => adapter.emit(demo.event('JOIN', demo.newViewer('test'))), i * 70);
        } else if (m.name === 'connect') {
          useBar.getState().setSettings({ demo: false }); // dùng dữ liệu thật thì tắt người xem giả lập
          adapter.setSource(new WsSource(String(m.arg || useBar.getState().settings.liveUrl), adapter));
          adapter.connect();
        } else if (m.name === 'disconnect') {
          adapter.disconnect(); adapter.setSource(undefined);
        }
        break;
      case 'hello': sendStatus(); break;
      default: break;
    }
  });

  const sendStatus = () => {
    const status = {
      fps: Math.round(renderer.fps), avatars: manager.count, queue: manager.queued, slots: manager.slots.length,
      connection: adapter.status, source: adapter.sourceName, audio: audio.state, totalGift: manager.totalGift, events: manager.events,
      position: audio.position, duration: audio.duration,
    };
    useBar.getState().setStatus(status);
    bus.send({ t: 'status', status, settings: useBar.getState().settings });
  };

  // Log trạng thái âm thanh khi có thay đổi (mở F12 > Console để xem)
  let lastLog = '';
  window.setInterval(() => {
    const line = `state=${audio.state} playing=${audio.playing} track=${audio.track}`;
    if (line !== lastLog) { lastLog = line; console.info(`[AUDIO] ${line}`); }
  }, 500);

  const tick = window.setInterval(() => manager.tick(0.25), 250);
  const st = window.setInterval(sendStatus, 1000);

  return () => {
    window.clearInterval(tick); window.clearInterval(st);
    window.removeEventListener('pointerdown', resume); window.removeEventListener('keydown', resume);
    offBus(); unsub(); demo.stop(); audio.pause(); bus.close(); renderer.destroy();
  };
}
