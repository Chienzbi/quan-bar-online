# Giai đoạn 1 – Phân tích ảnh tham chiếu

Ảnh tham chiếu là ảnh chụp màn hình nhỏ (~360×365 px), nên các số đo dưới đây là ước lượng bằng mắt.

| # | Hạng mục | Quan sát từ ảnh | Cách tái tạo |
|---|----------|-----------------|--------------|
| 1 | Bố cục | Sân khấu ở nửa trên, sàn nhảy chiếm nửa dưới, nền vũ trụ tối có sao | `render/scene.ts` |
| 2 | Sân khấu DJ | Bục trung tâm, bảng LED lớn phía sau hiển thị "TOP n" | Bục + bàn DJ + `TopBoard` |
| 3 | Loa / laser / đèn | Giàn truss vòm với tia laser xuống sàn, loa hai bên, đèn nhấp nháy | Truss vòm, 7–12 laser cộng hưởng (additive), loa co giãn theo bass |
| 4 | Sàn nhảy | Gạch caro phối cảnh, ô sáng xanh lá/tím/hồng, viền neon | 11×10 ô phối cảnh, đổi màu theo nhịp |
| 5 | Màu chủ đạo | Tím đậm, hồng neon, xanh cyan, vàng; cột LED xanh lá bên phải | Bảng `NEON` trong scene |
| 6 | Góc nhìn | Từ trên xuống nhẹ, 2.5D, vật gần lớn hơn | `scale = 0.58 + 0.72 × depth` |
| 7 | Tỉ lệ nhân vật | Chibi đầu to; hàng trước lớn hơn hàng sau khoảng 2× | Rig 109 px cao ở scale 1, scale 0.58 → 1.30 |
| 8 | Mật độ | Rất dày, chồng lấp theo chiều sâu | 60 slot / 9 hàng, sort theo Y |
| 9 | Tên | Pill tối bán trong suốt phía trên đầu, kèm huy hiệu | `ChibiView` name tag + huy hiệu follow/top |
| 10 | Trang trí | Vòng neon lớn hai bên, cánh vàng/hồng giữa sân khấu, cột LED | Vòng 3 lớp, cánh 5 lông, cột equalizer 10×14 |

## Khác biệt có chủ ý so với ảnh

- Ảnh gốc là phối cảnh ngang; dự án chuyển sang khung dọc 9:16 theo yêu cầu TikTok LIVE.
- Nhân vật trong ảnh là sticker/chibi do nền tảng khác tạo; dự án vẽ bộ chibi riêng bằng vector (không sao chép asset).
- Giữ nguyên ý đồ nhưng không có dữ liệu để khớp pixel-by-pixel.
