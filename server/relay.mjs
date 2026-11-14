// Relay WebSocket đơn giản: chuyển tiếp mọi message tới các client còn lại.
// Dùng khi stage chạy trong OBS/TikTok LIVE Studio (process riêng, không chia sẻ BroadcastChannel với trình duyệt).
import { WebSocketServer } from 'ws';

const port = Number(process.env.RELAY_PORT || 8787);
const wss = new WebSocketServer({ port });
wss.on('connection', (ws) => {
  ws.on('message', (data, isBinary) => {
    for (const c of wss.clients) if (c !== ws && c.readyState === 1) c.send(data, { binary: isBinary });
  });
});
console.log(`[relay] ws://localhost:${port}`);
