// Bridge TikTok LIVE -> WebSocket (ws://localhost:8788) cho stage. Cần Node >= 20.
// Chạy:  npm run bridge -- <tiktok_username>     (hoặc  TIKTOK_USER=<username> npm run bridge)
// Stage > admin > ô liveUrl = ws://localhost:8788 > "Kết nối".
// Dùng thư viện cộng đồng tiktok-live-connector 2.x (không chính thức) — có thể hỏng khi TikTok đổi giao thức.
// Tùy chọn: EULER_API_KEY=<key> nếu dịch vụ ký (sign) yêu cầu khóa.
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { WebSocketServer } from 'ws';

const user = (process.argv[2] || process.env.TIKTOK_USER || '').replace(/^@/, '').trim();
const port = Number(process.env.BRIDGE_PORT || 8788);
if (!user) {
  console.error('Thiếu username. Ví dụ: npm run bridge -- ten_kenh_tiktok');
  process.exit(1);
}

const wss = new WebSocketServer({ port });
const send = (event, data) => {
  console.log(`[bridge] ${event}: ${data.nickname || data.uniqueId || ''}${data.comment ? ' "' + data.comment + '"' : ''}${data.giftName ? ' ' + data.giftName + ' x' + data.repeatCount : ''}${data.isFollower ? ' (follower)' : ''} [userId=${JSON.stringify(data.userId)} uniqueId=${JSON.stringify(data.uniqueId)}]`);
  const msg = JSON.stringify({ event, data });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
};
wss.on('connection', () => console.log(`[bridge] stage đã kết nối (${wss.clients.size} client)`));
console.log(`[bridge] ws://localhost:${port}  (kênh: @${user})`);

// Chuẩn hóa người dùng. Thực tế TikTok (proto v2) để userId/uniqueId trống, mã thật nằm ở user.id,
// tên đăng nhập ở user.displayId, còn nickname là tên hiển thị.
const who = (m) => {
  const u = m.user ?? {};
  const uniqueId = String(u.displayId || u.uniqueId || '');
  const userId = String(u.id || u.idStr || u.userId || u.secUid || m.userId || uniqueId || '');
  return { userId, uniqueId, nickname: u.nickname || uniqueId || 'Khách' };
};

// In cấu trúc của vài tin nhắn quà đầu tiên để đối chiếu tên trường (chưa kiểm chứng với live thật).
let giftDbg = 0;

let conn;
let retry = 0;
let timer;

function schedule() {
  clearTimeout(timer);
  const wait = Math.min(60, 5 * ++retry);
  console.log(`[bridge] thử lại sau ${wait}s (cần kênh đang live)`);
  timer = setTimeout(start, wait * 1000);
}

function start() {
  const options = process.env.EULER_API_KEY ? { signApiKey: process.env.EULER_API_KEY } : {};
  conn = new TikTokLiveConnection(user, options);
  conn.on(WebcastEvent.MEMBER, (m) => send('member', { ...who(m), isFollower: Boolean(m.user?.isFollower) }));
  conn.on(WebcastEvent.CHAT, (m) => send('chat', { ...who(m), comment: m.content ?? m.comment }));
  conn.on(WebcastEvent.LIKE, (m) => send('like', { ...who(m), likeCount: m.likeCount }));
  conn.on(WebcastEvent.FOLLOW, (m) => send('follow', who(m)));
  conn.on(WebcastEvent.SHARE, (m) => send('share', who(m)));
  conn.on(WebcastEvent.GIFT, (m) => {
    if (giftDbg++ < 3) console.log('[bridge][debug] gift keys:', Object.keys(m).join(','), '| giftDetails keys:', Object.keys(m.giftDetails ?? {}).join(','));
    send('gift', {
    ...who(m),
    giftId: String(m.giftId ?? m.giftDetails?.id ?? ''),
    giftName: m.giftDetails?.giftName || 'Gift',
    diamondCount: m.giftDetails?.diamondCount ?? 1,
    repeatCount: m.repeatCount,
    repeatEnd: Boolean(m.repeatEnd),
    giftType: m.giftDetails?.combo ? 1 : 0, // 1 = quà dạng streak (combo)
    });
  });
  conn.on(WebcastEvent.STREAM_END, () => console.warn('[bridge] live đã kết thúc'));
  conn.on(ControlEvent.DISCONNECTED, () => { console.warn('[bridge] mất kết nối TikTok'); schedule(); });
  conn.on(ControlEvent.ERROR, (e) => console.warn('[bridge] lỗi:', e?.message || e));
  conn.connect().then(
    (s) => { retry = 0; console.log(`[bridge] đã vào phòng live ${s?.roomId ?? ''}`); },
    (e) => { console.warn('[bridge] không kết nối được:', e?.message || e); schedule(); },
  );
}
start();
