export type Command =
  | { cmd: 'cheers' }
  | { cmd: 'love'; target: string }
  | { cmd: 'dance'; n: number }
  | { cmd: 'province'; text: string }
  | { cmd: 'team'; team: 'red' | 'blue' };

/** Bỏ dấu + chữ thường để so khớp tên/lệnh (người xem hay gõ không dấu). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
}

/**
 * Lệnh bình luận:
 *   !cheers | !cung        cụng ly với người đứng gần nhất
 *   !tim @tên | !love tên  bắn tim sang một người khác
 *   !nhay [1-4] | !dance   đổi kiểu nhảy
 *   !tinh Đà Nẵng | !que   khai báo quê quán (hiện trên bản đồ)
 *   !do | !xanh            chọn phe
 * Trả về null nếu không phải lệnh (bình luận bình thường vẫn hiện bong bóng).
 */
export function parseCommand(text: string): Command | null {
  const m = /^\s*!\s*(\S+)\s*(.*)$/.exec(fold(text));
  if (!m) return null;
  const [, word, rest] = m;
  if (word === 'cheers' || word === 'cung' || word === 'cheer') return { cmd: 'cheers' };
  if (word === 'tim' || word === 'love') {
    const target = rest.replace(/^@/, '').trim();
    return target ? { cmd: 'love', target } : null;
  }
  if (word === 'nhay' || word === 'dance') {
    const n = parseInt(rest, 10);
    return { cmd: 'dance', n: n >= 1 && n <= 4 ? n : 1 + Math.floor(Math.random() * 4) };
  }
  if (word === 'tinh' || word === 'que' || word === 'tp') return rest ? { cmd: 'province', text: rest } : null;
  if (word === 'do' || word === 'red') return { cmd: 'team', team: 'red' };
  if (word === 'xanh' || word === 'blue') return { cmd: 'team', team: 'blue' };
  return null;
}
