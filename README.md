# Quán Bar Ảo – TikTok LIVE

Một sân nhảy duy nhất, 60 slot cố định, avatar chibi nhảy liên tục, phản ứng theo sự kiện LIVE.
Stack: React + TypeScript + Vite + PixiJS 8 + Zustand. Phân tích ảnh: [docs/PHASE1_ANALYSIS.md](docs/PHASE1_ANALYSIS.md).

## Chạy local (Windows)

```powershell
npm install
npm run dev:all      # vite (5173) + relay WebSocket (8787)
```

- Stage (cảnh livestream, 1080×1920): `http://localhost:5173/`
- Control Panel (tách riêng): `http://localhost:5173/admin.html`
- Chỉ trình duyệt thường: `npm run dev` là đủ (Stage ↔ Panel dùng BroadcastChannel).
- Dùng OBS / TikTok LIVE Studio: thêm Browser Source `http://localhost:5173/`, 1080×1920; chạy `npm run dev:all` để Panel điều khiển được stage trong OBS. [Inference] OBS dùng process riêng nên không chia sẻ BroadcastChannel với trình duyệt; relay là cách chắc chắn hơn.

Âm thanh: trình duyệt chặn phát tự động tới khi click vào stage một lần. Track mặc định là nhạc synth tự sinh (không bản quyền). Muốn dùng file, đặt file bạn có quyền sử dụng vào `public/music/` rồi nhập `/music/ten.mp3` trong Panel.

## Kiến trúc

```
Nguồn sự kiện ──► LiveEventAdapter ──► AvatarManager ──(RenderSink)──► BarRenderer (PixiJS)
 (DemoDirector,    chuẩn hóa, dedupe,    slot, hàng đợi, ưu tiên,        scene, ChibiView, Fx,
  WsSource,        gộp combo quà          cooldown, lọc comment           TopBoard, AudioEngine
  Panel/Bus)
Control Panel ◄──► Bus (BroadcastChannel + WS relay) ◄──► stage/controller.ts
```

- `src/engine`: logic thuần, không import PixiJS. Đổi nguồn: `adapter.setSource(...)`.
- `src/render`: toàn bộ đồ họa. `chibi/rig.ts` (xương nhiều lớp), `chibi/poses.ts` (12 clip), `chibi/templates.ts` (15 mẫu).
- `src/admin`: Control Panel, không bao giờ nằm trong cảnh stage.
- `server/relay.mjs`: relay WebSocket đơn giản.

## Giao thức nguồn LIVE (WebSocket JSON)

Bridge gửi mỗi sự kiện một message, dạng chuẩn hóa:

```json
{ "type": "GIFT", "userId": "123", "name": "An", "giftId": "rose", "giftName": "Hoa hồng", "diamonds": 1, "repeatCount": 3, "repeatEnd": false }
```

Các `type`: `JOIN | LIKE | COMMENT | FOLLOW | SHARE | GIFT`. Adapter cũng nhận dạng thô `{ "event": "member|like|chat|follow|share|gift", "data": {...} }`; tên trường theo thư viện cộng đồng và **[Unverified]** – cần đối chiếu với bridge bạn chọn.
Combo quà: chỉ phần tăng thêm của `repeatCount` được tính (xem `LiveEventAdapter.giftDelta`).

## Trạng thái từng giai đoạn

| Giai đoạn | Trạng thái |
|-----------|-----------|
| 1 Phân tích ảnh | Xong (ước lượng từ ảnh nhỏ) |
| 2 Scene | Xong, tương đồng về bố cục/màu; không khớp pixel |
| 3 Avatar + animation | Xong: 15 mẫu, 12 clip, rig nhiều lớp vẽ bằng code |
| 4 DEMO | Chạy; đã xem ảnh chụp headless với ~40 avatar, bong bóng, bảng TOP |
| 5 Tích hợp LIVE | **Chưa hoàn tất**: có `WsSource` + chuẩn hóa, **chưa có bridge TikTok** (Node hoặc Spring Boot) và chưa kiểm thử với dữ liệu thật |
| 6 Tối ưu | Có giới hạn hạt/bong bóng/hiệu ứng lớn và giải phóng đối tượng; **chưa đo** FPS 60 và chưa chạy soak test dài |

## Chưa kiểm chứng

- Giao tiếp Panel → Stage qua Bus (chưa test bằng hai cửa sổ thật).
- Âm thanh synth và phân tích nhịp (chưa nghe thử).
- FPS trên máy thật với 60 avatar; ảnh chụp dùng renderer phần mềm.
- Danh sách lọc từ tục trong `engine/filter.ts` chỉ là mẫu tối thiểu.

## Asset cần thêm để đẹp hơn

Nhân vật hiện là vector vẽ bằng code. Muốn chất lượng như sticker chuyên nghiệp: thiết kế bộ chibi tách lớp (đầu, tóc trước/sau, thân, 2 đốt tay, chân, phụ kiện) và xuất Spine/DragonBones, hoặc sprite sheet 12 clip × 15 mẫu; thay `ChibiView` bằng bản đọc asset đó, giữ nguyên giao diện `play(clip)`/`update()`.
