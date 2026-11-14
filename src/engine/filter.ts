// Danh sách tối thiểu, chỉ để minh họa cơ chế lọc. Cần mở rộng trước khi dùng thật.
const BAD = ['địt', 'dit me', 'đụ', 'lồn', 'cặc', 'fuck', 'shit', 'bitch', 'đm', 'vcl', 'vkl'];
const URL_RE = /(https?:\/\/|www\.)\S+/gi;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeComment(text: string, maxLen = 40): string | null {
  // eslint-disable-next-line no-control-regex
  let t = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(URL_RE, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  for (const w of BAD) {
    if (lower.includes(w)) t = t.replace(new RegExp(escapeRe(w), 'gi'), '***');
  }
  if (t.length > maxLen) t = t.slice(0, maxLen - 1) + '…';
  return t;
}
