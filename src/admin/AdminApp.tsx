import { useEffect, useMemo, useState } from 'react';
import { DemoDirector } from '../engine/demo';
import { LiveEventAdapter } from '../engine/adapter';
import { Bus } from '../shared/bus';
import { useBar } from '../shared/store';
import type { LiveEvent, Settings } from '../shared/types';

const TRACKS: [string, string][] = [
  ['synth:neon', 'Neon Drive (synth 124 BPM)'],
  ['synth:pulse', 'Pulse (synth 128 BPM)'],
];
const GIFT_PRESETS: [string, number][] = [['Hoa hồng', 1], ['Gấu bông', 99], ['Bó hoa', 299], ['Xe đua', 1000], ['Sư tử', 5000]];

export function AdminApp() {
  const bus = useMemo(() => new Bus(), []);
  const { settings, status, setSettings, setStatus } = useBar();
  const [name, setName] = useState('Khách thử nghiệm');
  const [text, setText] = useState('Xin chào quán bar!');
  const [gift, setGift] = useState(1);
  const [testN, setTestN] = useState(20);
  const [file, setFile] = useState('');
  const [bulk, setBulk] = useState('');
  const bulkItems = bulk.split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { const y = parseYoutube(l); return y ? `yt:${y}` : /^\/[^\s]+\.(mp3|wav|ogg|m4a|aac)$/i.test(l) ? `file:${l}` : ''; })
    .filter(Boolean);
  const [scrub, setScrub] = useState<number | null>(null); // đang kéo thanh tua
  const ytId = parseYoutube(file);
  const fileOk = /^\/[^\s]+\.(mp3|wav|ogg|m4a|aac)$/i.test(file.trim());
  // DemoDirector chỉ dùng để sinh sự kiện mẫu; adapter ở đây không có handler.
  const demo = useMemo(() => new DemoDirector(new LiveEventAdapter(), () => 0), []);

  useEffect(() => {
    const off = bus.on((m) => {
      if (m.t === 'status') {
        setStatus(m.status);
        // đồng bộ lại cài đặt thật của stage (stage là nguồn sự thật)
        useBar.setState({ settings: m.settings });
      }
    });
    bus.send({ t: 'hello' });
    return () => { off(); };
  }, [bus, setStatus]);

  const set = (patch: Partial<Settings>) => { setSettings(patch); bus.send({ t: 'settings', patch }); };
  const send = (event: LiveEvent) => bus.send({ t: 'event', event });
  const uid = `manual_${name.trim().toLowerCase().replace(/\s+/g, '_') || 'guest'}`;
  const nm = name.trim() || 'Khách';
  const [giftName, diamonds] = GIFT_PRESETS[gift];

  const connLabel: Record<string, string> = { idle: 'Chưa kết nối', connecting: 'Đang kết nối…', open: 'Đã kết nối', closed: 'Mất kết nối (tự thử lại)', error: 'Lỗi kết nối' };

  return (
    <div className="admin">
      <h1>Quán Bar Ảo – Control Panel</h1>
      <p className="muted">Trang này tách riêng khỏi cảnh livestream. Stage: <code>/</code> (9:16, 1080×1920).</p>

      <section>
        <h2>Trạng thái</h2>
        <div className="grid">
          <Stat k="FPS" v={status.fps} />
          <Stat k="Avatar" v={`${status.avatars}/${settings.maxAvatars}`} />
          <Stat k="Hàng đợi" v={status.queue} />
          <Stat k="Sự kiện" v={status.events} />
          <Stat k="Tổng quà" v={status.totalGift.toLocaleString('vi-VN')} />
          <Stat k="Audio" v={status.audio === 'running' ? 'đang chạy' : status.audio === 'suspended' ? 'chờ click vào stage' : 'chưa khởi tạo'} />
        </div>
        {status.fps === 0 && <p className="warn">Chưa thấy stage. Hãy mở <code>/</code> ở tab/cửa sổ khác (hoặc chạy <code>npm run dev:all</code> nếu stage nằm trong OBS).</p>}
      </section>

      <section>
        <h2>Chế độ & nguồn LIVE</h2>
        <label className="row"><input type="checkbox" checked={settings.demo} onChange={(e) => set({ demo: e.target.checked })} /> Chế độ DEMO (tự tạo người xem & sự kiện giả)</label>
        <div className="row">
          <input className="wide" value={settings.liveUrl} onChange={(e) => set({ liveUrl: e.target.value })} placeholder="ws://localhost:8788" />
          <button onClick={() => bus.send({ t: 'cmd', name: 'connect', arg: settings.liveUrl })}>Kết nối</button>
          <button onClick={() => bus.send({ t: 'cmd', name: 'disconnect' })}>Ngắt</button>
        </div>
        <p>Nguồn: <b>{status.source}</b> – <span className={`pill ${status.connection}`}>{connLabel[status.connection]}</span></p>
      </section>

      <section>
        <h2>Avatar</h2>
        <Slider label={`Số avatar tối đa: ${settings.maxAvatars}`} min={5} max={60} step={1} v={settings.maxAvatars} on={(v) => set({ maxAvatars: v })} />
        <Slider label={`Thay avatar im lặng sau: ${settings.idleReplaceSec}s (chỉ khi hết slot)`} min={10} max={600} step={10} v={settings.idleReplaceSec} on={(v) => set({ idleReplaceSec: v })} />
        <div className="row">
          <input type="number" min={1} max={60} value={testN} onChange={(e) => setTestN(Number(e.target.value))} />
          <button onClick={() => bus.send({ t: 'cmd', name: 'spawnTest', arg: testN })}>Tạo {testN} avatar thử</button>
          <button className="danger" onClick={() => bus.send({ t: 'cmd', name: 'reset' })}>Reset quán bar</button>
        </div>
      </section>

      <section>
        <h2>Giả lập sự kiện</h2>
        <div className="row">
          <input className="wide" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên người xem" />
        </div>
        <div className="row">
          <button onClick={() => send({ type: 'JOIN', userId: uid, name: nm })}>JOIN</button>
          <button onClick={() => send({ type: 'LIKE', userId: uid, name: nm, count: 5 })}>LIKE</button>
          <button onClick={() => send({ type: 'FOLLOW', userId: uid, name: nm })}>FOLLOW</button>
          <button onClick={() => send({ type: 'SHARE', userId: uid, name: nm })}>SHARE</button>
          <button onClick={() => send(demo.event('JOIN', demo.newViewer('rnd')))}>JOIN ngẫu nhiên</button>
        </div>
        <div className="row">
          <input className="wide" value={text} onChange={(e) => setText(e.target.value)} />
          <button onClick={() => send({ type: 'COMMENT', userId: uid, name: nm, text })}>COMMENT</button>
        </div>
        <div className="row">
          <select value={gift} onChange={(e) => setGift(Number(e.target.value))}>
            {GIFT_PRESETS.map(([n, d], i) => <option key={n} value={i}>{n} ({d} 💎)</option>)}
          </select>
          <button onClick={() => send({ type: 'GIFT', userId: uid, name: nm, giftId: giftName, giftName, diamonds, repeatCount: 1, repeatEnd: true })}>GIFT</button>
        </div>
        <p className="muted">Cấp quà: ≥{settings.giftLv2} → cấp 2, ≥{settings.giftLv3} → cấp 3.</p>
        <Slider label={`Ngưỡng cấp 2: ${settings.giftLv2}`} min={10} max={1000} step={10} v={settings.giftLv2} on={(v) => set({ giftLv2: v })} />
        <Slider label={`Ngưỡng cấp 3: ${settings.giftLv3}`} min={100} max={10000} step={100} v={settings.giftLv3} on={(v) => set({ giftLv3: v })} />
      </section>

      <section>
        <h2>Nhạc</h2>
        <div className="row">
          <button onClick={() => set({ musicPlaying: !settings.musicPlaying })}>{settings.musicPlaying ? '⏸ Pause' : '▶ Play'}</button>
          <select value={settings.track.startsWith('synth:') ? settings.track : 'custom'} onChange={(e) => e.target.value !== 'custom' && set({ track: e.target.value })}>
            {TRACKS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            <option value="custom">{settings.track.startsWith('yt:') ? 'YouTube: ' + settings.track.slice(3) : settings.track.startsWith('file:') ? 'File: ' + settings.track.slice(5) : 'Link YouTube / file…'}</option>
          </select>
        </div>
        <div className="row">
          <input className="wide" value={file} onChange={(e) => setFile(e.target.value)} placeholder="Link YouTube hoặc /music/ten-bai.mp3" />
          <button disabled={!ytId && !fileOk} onClick={() => set({ track: ytId ? `yt:${ytId}` : `file:${file.trim()}` })}>Dùng nhạc này</button>
          <button disabled={!ytId && !fileOk} onClick={() => { set({ playlist: [...(settings.playlist ?? []), ytId ? `yt:${ytId}` : `file:${file.trim()}`] }); setFile(''); }}>➕ Thêm vào danh sách</button>
        </div>
        <div className="row">
          <textarea className="wide" rows={3} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Dán nhiều link, mỗi dòng một link (YouTube hoặc /music/ten-bai.mp3)'} />
          <button disabled={!bulkItems.length} onClick={() => { set({ playlist: [...(settings.playlist ?? []), ...bulkItems] }); setBulk(''); }}>➕ Thêm {bulkItems.length} link</button>
        </div>
        {(settings.playlist?.length ?? 0) > 0 && (
          <div>
            <p className="muted">Danh sách phát ({settings.playlist.length} bài): hết bài sẽ tự sang bài kế, hết danh sách thì quay lại bài đầu.</p>
            {settings.playlist.map((t, i) => (
              <div className="row" key={`${t}-${i}`}>
                <span style={{ flex: 1, fontWeight: t === settings.track ? 700 : 400 }}>{t === settings.track ? '▶ ' : ''}{i + 1}. {trackLabel(t)}</span>
                <button onClick={() => set({ track: t })}>Phát</button>
                <button onClick={() => set({ playlist: settings.playlist.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <div className="row">
              <button onClick={() => bus.send({ t: 'cmd', name: 'next' })}>⏭ Bài tiếp</button>
              <button onClick={() => set({ playlist: [] })}>Xóa danh sách</button>
            </div>
          </div>
        )}
        {file.trim() && !ytId && !fileOk && <p className="warn">Cần link YouTube (youtube.com/watch?v=… hoặc youtu.be/…) hoặc đường dẫn file trong <code>public/music/</code>, ví dụ <code>/music/ten-bai.mp3</code>.</p>}
        {ytId && <p className="muted">YouTube: chỉ phát video <code>{ytId}</code> (bỏ qua tham số playlist). Đèn chạy theo nhịp nội bộ 120 BPM vì không phân tích được âm thanh từ YouTube.</p>}
        <label className="slider">
          <span>{fmtTime(scrub ?? status.position)} / {status.duration ? fmtTime(status.duration) : '--:--'}{status.duration ? '' : ' (nhạc synth không tua được)'}</span>
          <input type="range" min={0} max={status.duration || 1} step={1} disabled={!status.duration}
            value={Math.min(scrub ?? status.position, status.duration || 1)}
            onChange={(e) => setScrub(Number(e.target.value))}
            onPointerUp={() => { if (scrub !== null) { bus.send({ t: 'cmd', name: 'seek', arg: scrub }); setScrub(null); } }}
            onKeyUp={() => { if (scrub !== null) { bus.send({ t: 'cmd', name: 'seek', arg: scrub }); setScrub(null); } }} />
        </label>
        <Slider label={`Âm lượng: ${Math.round(settings.volume * 100)}%`} min={0} max={1} step={0.01} v={settings.volume} on={(v) => set({ volume: v })} />
        <p className="muted">Chỉ dùng file nhạc bạn có quyền sử dụng. Trình duyệt chặn âm thanh đến khi bạn click vào trang stage một lần (OBS thường bỏ qua – [Unverified]).</p>
      </section>

      <section>
        <h2>Ánh sáng & animation</h2>
        <Slider label={`Cường độ ánh sáng: ${settings.lightIntensity.toFixed(2)}`} min={0} max={1.5} step={0.05} v={settings.lightIntensity} on={(v) => set({ lightIntensity: v })} />
        <Slider label={`Cường độ animation: ${settings.animIntensity.toFixed(2)}`} min={0.3} max={1.5} step={0.05} v={settings.animIntensity} on={(v) => set({ animIntensity: v })} />
        <label className="row"><input type="checkbox" checked={settings.lasers} onChange={(e) => set({ lasers: e.target.checked })} /> Laser</label>
        <label className="row"><input type="checkbox" checked={settings.camera ?? true} onChange={(e) => set({ camera: e.target.checked })} /> Lia camera</label>
      </section>
    </div>
  );
}

function parseYoutube(input: string): string | null {
  try {
    const u = new URL(input.trim());
    let id = '';
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
    else if (/(^|\.)youtube\.com$/.test(u.hostname)) {
      id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/)?.[1] ?? '';
    }
    return /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return <div className="stat"><span>{k}</span><b>{v}</b></div>;
}

function trackLabel(t: string) {
  return t.startsWith('yt:') ? `YouTube: ${t.slice(3)}` : t.startsWith('file:') ? `File: ${t.slice(5)}` : t;
}

function fmtTime(s: number) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function Slider(p: { label: string; min: number; max: number; step: number; v: number; on: (v: number) => void }) {
  return (
    <label className="slider">
      <span>{p.label}</span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.v} onChange={(e) => p.on(Number(e.target.value))} />
    </label>
  );
}
