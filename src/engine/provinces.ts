import { fold } from './commands';

export interface Province { name: string; lat: number; lon: number; alias?: string[] }

/** 63 tỉnh/thành theo cách gọi quen thuộc; toạ độ xấp xỉ (trung tâm tỉnh) chỉ để chấm điểm trên bản đồ. */
export const PROVINCES: Province[] = [
  { name: 'Hà Nội', lat: 21.03, lon: 105.85, alias: ['hn', 'thu do'] },
  { name: 'Hải Phòng', lat: 20.86, lon: 106.68, alias: ['hp'] },
  { name: 'Quảng Ninh', lat: 21.0, lon: 107.3, alias: ['ha long'] },
  { name: 'Hải Dương', lat: 20.94, lon: 106.33 },
  { name: 'Hưng Yên', lat: 20.65, lon: 106.05 },
  { name: 'Thái Bình', lat: 20.45, lon: 106.34 },
  { name: 'Nam Định', lat: 20.42, lon: 106.17 },
  { name: 'Hà Nam', lat: 20.54, lon: 105.92 },
  { name: 'Ninh Bình', lat: 20.25, lon: 105.97 },
  { name: 'Bắc Ninh', lat: 21.19, lon: 106.07 },
  { name: 'Vĩnh Phúc', lat: 21.31, lon: 105.6 },
  { name: 'Phú Thọ', lat: 21.32, lon: 105.4 },
  { name: 'Thái Nguyên', lat: 21.59, lon: 105.84 },
  { name: 'Bắc Giang', lat: 21.27, lon: 106.19 },
  { name: 'Lạng Sơn', lat: 21.85, lon: 106.76 },
  { name: 'Cao Bằng', lat: 22.67, lon: 106.26 },
  { name: 'Bắc Kạn', lat: 22.15, lon: 105.83 },
  { name: 'Tuyên Quang', lat: 21.82, lon: 105.21 },
  { name: 'Hà Giang', lat: 22.82, lon: 104.98 },
  { name: 'Lào Cai', lat: 22.48, lon: 103.97, alias: ['sa pa', 'sapa'] },
  { name: 'Yên Bái', lat: 21.72, lon: 104.9 },
  { name: 'Sơn La', lat: 21.33, lon: 103.91 },
  { name: 'Điện Biên', lat: 21.39, lon: 103.02 },
  { name: 'Lai Châu', lat: 22.4, lon: 103.46 },
  { name: 'Hòa Bình', lat: 20.81, lon: 105.34 },
  { name: 'Thanh Hóa', lat: 19.8, lon: 105.78 },
  { name: 'Nghệ An', lat: 18.68, lon: 105.68, alias: ['vinh'] },
  { name: 'Hà Tĩnh', lat: 18.34, lon: 105.9 },
  { name: 'Quảng Bình', lat: 17.47, lon: 106.62 },
  { name: 'Quảng Trị', lat: 16.75, lon: 107.19 },
  { name: 'Thừa Thiên Huế', lat: 16.46, lon: 107.59, alias: ['hue'] },
  { name: 'Đà Nẵng', lat: 16.05, lon: 108.2, alias: ['dn'] },
  { name: 'Quảng Nam', lat: 15.57, lon: 108.47, alias: ['hoi an'] },
  { name: 'Quảng Ngãi', lat: 15.12, lon: 108.8 },
  { name: 'Bình Định', lat: 13.78, lon: 109.22, alias: ['quy nhon'] },
  { name: 'Phú Yên', lat: 13.09, lon: 109.31 },
  { name: 'Khánh Hòa', lat: 12.24, lon: 109.19, alias: ['nha trang'] },
  { name: 'Ninh Thuận', lat: 11.57, lon: 108.99 },
  { name: 'Bình Thuận', lat: 10.93, lon: 108.1, alias: ['phan thiet', 'mui ne'] },
  { name: 'Kon Tum', lat: 14.35, lon: 108.0 },
  { name: 'Gia Lai', lat: 13.98, lon: 108.0, alias: ['pleiku'] },
  { name: 'Đắk Lắk', lat: 12.67, lon: 108.04, alias: ['buon ma thuot', 'dak lak'] },
  { name: 'Đắk Nông', lat: 12.0, lon: 107.69, alias: ['dak nong'] },
  { name: 'Lâm Đồng', lat: 11.94, lon: 108.44, alias: ['da lat', 'dalat'] },
  { name: 'Bình Phước', lat: 11.75, lon: 106.72 },
  { name: 'Tây Ninh', lat: 11.31, lon: 106.1 },
  { name: 'Bình Dương', lat: 11.0, lon: 106.65 },
  { name: 'Đồng Nai', lat: 10.95, lon: 106.82, alias: ['bien hoa'] },
  { name: 'Bà Rịa - Vũng Tàu', lat: 10.5, lon: 107.17, alias: ['vung tau', 'brvt', 'ba ria'] },
  { name: 'TP Hồ Chí Minh', lat: 10.78, lon: 106.7, alias: ['sai gon', 'saigon', 'hcm', 'tphcm', 'sg', 'ho chi minh'] },
  { name: 'Long An', lat: 10.54, lon: 106.41 },
  { name: 'Tiền Giang', lat: 10.36, lon: 106.36 },
  { name: 'Bến Tre', lat: 10.24, lon: 106.38 },
  { name: 'Trà Vinh', lat: 9.93, lon: 106.34 },
  { name: 'Vĩnh Long', lat: 10.25, lon: 105.97 },
  { name: 'Đồng Tháp', lat: 10.46, lon: 105.63 },
  { name: 'An Giang', lat: 10.38, lon: 105.43 },
  { name: 'Kiên Giang', lat: 10.01, lon: 105.08, alias: ['phu quoc', 'rach gia'] },
  { name: 'Cần Thơ', lat: 10.03, lon: 105.78 },
  { name: 'Hậu Giang', lat: 9.78, lon: 105.47 },
  { name: 'Sóc Trăng', lat: 9.6, lon: 105.97 },
  { name: 'Bạc Liêu', lat: 9.29, lon: 105.72 },
  { name: 'Cà Mau', lat: 9.18, lon: 105.15 },
];

/** Đường viền Việt Nam rất thô: [lon, lat], đi vòng từ Tây Bắc theo biên giới phía Bắc, bờ biển Đông rồi biên giới phía Tây. */
export const OUTLINE: [number, number][] = [
  [102.1, 22.4], [102.6, 22.75], [103.4, 22.7], [104.0, 22.8], [104.4, 23.2], [105.2, 23.3], [105.8, 23.1], [106.7, 22.9],
  [107.4, 22.1], [108.0, 21.5], [107.1, 20.95], [106.8, 20.7], [106.5, 20.4], [106.1, 19.9], [105.9, 19.5], [105.8, 18.8],
  [106.2, 18.3], [106.7, 17.5], [107.6, 16.5], [108.2, 16.1], [108.9, 15.2], [109.3, 13.8], [109.3, 13.0], [109.25, 12.2],
  [109.2, 11.5], [108.6, 10.9], [107.1, 10.35], [106.8, 10.4], [106.5, 9.9], [106.6, 9.7], [105.3, 8.7], [104.8, 8.6],
  [104.85, 9.1], [105.1, 10.0], [104.5, 10.4], [105.0, 10.95], [105.8, 11.6], [106.4, 11.7], [106.9, 12.2], [107.4, 12.3],
  [107.6, 13.0], [107.5, 14.5], [107.2, 15.4], [106.8, 16.2], [106.5, 16.6], [105.9, 17.4], [105.4, 18.0], [105.1, 18.6],
  [104.2, 19.2], [104.0, 19.8], [104.1, 20.4], [104.6, 20.7], [104.4, 21.4], [103.6, 21.7], [102.9, 22.1],
];

const clean = (s: string) => fold(s).replace(/^(tinh|thanh pho|tp\.?)\s+/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const KEYS = PROVINCES.map((p) => new Set([clean(p.name), ...(p.alias ?? []).map(clean)]));

/** Trả về chỉ số tỉnh khớp với chữ người xem gõ (không dấu, không phân biệt hoa thường), hoặc null. */
export function matchProvince(text: string): number | null {
  const t = clean(text);
  if (t.length < 2) return null;
  const exact = KEYS.findIndex((k) => k.has(t));
  if (exact >= 0) return exact;
  if (t.length < 3) return null;
  // gõ thiếu: chỉ nhận khi duy nhất một tỉnh bắt đầu bằng chuỗi đó
  const hits = KEYS.map((k, i) => ([...k].some((n) => n.startsWith(t)) ? i : -1)).filter((i) => i >= 0);
  return hits.length === 1 ? hits[0] : null;
}
