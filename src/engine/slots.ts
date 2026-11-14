export interface Slot {
  id: number;
  x: number;
  y: number;
  depth: number; // 0 (xa) .. 1 (gần)
  scale: number;
}

export const STAGE_W = 1080;
export const STAGE_H = 1920;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROWS = [5, 5, 6, 6, 7, 7, 8, 8, 8]; // = 60 slot, hàng xa ít hơn
export const Y_FAR = 1130;
export const Y_NEAR = 1760;

/** Sinh 60 slot cố định, lệch tự nhiên (không lưới cứng), có độ sâu. */
export function generateSlots(seed = 20240611): Slot[] {
  const r = rng(seed);
  const slots: Slot[] = [];
  let id = 0;
  ROWS.forEach((count, row) => {
    const t = row / (ROWS.length - 1);
    const rowW = 780 + 260 * t; // hàng gần rộng hơn
    const x0 = STAGE_W / 2 - rowW / 2;
    const step = rowW / count;
    const shift = row % 2 ? step * 0.25 : -step * 0.25;
    for (let i = 0; i < count; i++) {
      const jx = (r() - 0.5) * step * 0.45;
      const jy = (r() - 0.5) * 34;
      const x = Math.min(STAGE_W - 60, Math.max(60, x0 + step * (i + 0.5) + shift + jx));
      const y = Y_FAR + (Y_NEAR - Y_FAR) * t + jy;
      const depth = Math.min(1, Math.max(0, (y - Y_FAR) / (Y_NEAR - Y_FAR)));
      slots.push({ id: id++, x, y, depth, scale: 0.72 + 0.95 * depth });
    }
  });
  return slots;
}

/** Thứ tự lấp slot: xáo trộn để người xem đầu tiên không dồn về một hàng. */
export function fillOrder(slots: Slot[], seed = 7): number[] {
  const r = rng(seed);
  const ids = slots.map((s) => s.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
