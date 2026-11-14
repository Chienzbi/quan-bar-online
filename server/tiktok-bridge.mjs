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
  const msg = JSON.stringify({ event, data });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
};
console.log(`[bridge] ws://localhost:${port}  (kênh: @${user})`);

// Chuẩn hóa người dùng (protobuf v2: user.userId / user.uniqueId / user.nickname)
const who = (m) => {
  const u = m.user ?? {};
  const uniqueId = String(u.uniqueId ?? '');
  return { userId: String(u.userId || m.userId || uniqueId), uniqueId, nickname: u.nickname || uniqueId || 'Khách' };
};

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
  conn.on(WebcastEvent.CHAT, (m) => send('chat', { ...who(m), comment: m.comment }));
  conn.on(WebcastEvent.LIKE, (m) => send('like', { ...who(m), likeCount: m.likeCount }));
  conn.on(WebcastEvent.FOLLOW, (m) => send('follow', who(m)));
  conn.on(WebcastEvent.SHARE, (m) => send('share', who(m)));
  conn.on(WebcastEvent.GIFT, (m) => send('gift', {
    ...who(m),
    giftId: String(m.giftId ?? m.giftDetails?.id ?? ''),
    giftName: m.giftDetails?.giftName || 'Gift',
    diamondCount: m.giftDetails?.diamondCount ?? 1,
    repeatCount: m.repeatCount,
    repeatEnd: Boolean(m.repeatEnd),
    giftType: m.giftDetails?.combo ? 1 : 0, // 1 = quà dạng streak (combo)
  }));
  conn.on(WebcastEvent.STREAM_END, () => console.warn('[bridge] live đã kết thúc'));
  conn.on(ControlEvent.DISCONNECTED, () => { console.warn('[bridge] mất kết nối TikTok'); schedule(); });
  conn.on(ControlEvent.ERROR, (e) => console.warn('[bridge] lỗi:', e?.message || e));
  conn.connect().then(
    (s) => { retry = 0; console.log(`[bridge] đã vào phòng live ${s?.roomId ?? ''}`); },
    (e) => { console.warn('[bridge] không kết nối được:', e?.message || e); schedule(); },
  );
}
start();
