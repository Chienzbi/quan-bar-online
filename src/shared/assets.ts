/**
 * Đường dẫn tới file trong public/ (bg, stickers, music) — đúng cả khi chạy local lẫn khi deploy dưới
 * đường dẫn con như https://<user>.github.io/<repo>/ (vite base là './').
 * Nhận cả '/bg/x.png' lẫn 'bg/x.png'.
 */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL || './';
  return base.replace(/\/?$/, '/') + path.replace(/^\/+/, '');
}
