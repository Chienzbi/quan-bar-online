import type { Clip } from '../../shared/types';

/**
 * Pose theo xương: mỗi bộ phận có kênh riêng (thân, đầu, 2 cánh tay x 2 đốt, 2 chân).
 * Góc tay: 0 = buông xuôi, ~1.57 = dang ngang, ~3.14 = giơ thẳng lên (dương = ra ngoài/lên cho cả 2 tay).
 */
export interface Pose {
  x: number; y: number; rot: number; sx: number; sy: number;
  head: number; headY: number;
  aL: number; fL: number; aR: number; fR: number;
  lL: number; lR: number;
  mouth: number; // 0 đóng, 1 mở
  a: number; // alpha
  s: number; // scale đồng đều (spawn/despawn)
}

export const REST: Pose = {
  x: 0, y: 0, rot: 0, sx: 1, sy: 1, head: 0, headY: 0,
  aL: 0.18, fL: 0.12, aR: 0.18, fR: 0.12, lL: 0, lR: 0, mouth: 0, a: 1, s: 1,
};

type Fn = (p: number, u: number) => Partial<Pose>;
const PI = Math.PI;
const TAU = PI * 2;
const S = Math.sin;
const ab = Math.abs;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutBack = (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/** Clip lặp: p = số nhịp (beat) liên tục của avatar. */
const LOOPS: Record<string, Fn> = {
  idle: (p) => ({
    y: -ab(S(p * PI)) * 2.5, sy: 1 + 0.025 * S(p * TAU), head: 0.04 * S(p * PI - 0.4),
    aL: 0.2 + 0.06 * S(p * TAU + 1), aR: 0.2 + 0.06 * S(p * TAU + 2.2),
  }),
  // lắc người trái/phải
  dance_01: (p) => {
    const w = S(p * PI);
    return {
      x: w * 7, rot: w * 0.1, y: -ab(S(p * TAU)) * 3.5,
      head: -w * 0.12 + 0.1 * S(p * PI - 0.7), headY: 1.5 * S(p * TAU + 0.6),
      aL: 0.55 + 0.5 * S(p * PI + 0.5), aR: 0.55 + 0.5 * S(p * PI + 0.5 + PI),
      fL: 0.4 + 0.4 * S(p * PI + 1.2), fR: 0.4 + 0.4 * S(p * PI + 1.2 + PI),
      lL: 0.14 * w, lR: 0.14 * w, mouth: 0.2,
    };
  },
  // hai tay đưa cao
  dance_02: (p) => ({
    y: -ab(S(p * PI)) * 7, rot: 0.05 * S(p * PI), head: 0.12 * S(p * PI - 0.5), headY: -1,
    aL: 2.65 + 0.3 * S(p * TAU + 0.3), aR: 2.65 + 0.3 * S(p * TAU + 0.9),
    fL: 0.35 * S(p * TAU + 1.4), fR: 0.35 * S(p * TAU + 2),
    lL: 0.1 * S(p * PI), lR: -0.1 * S(p * PI), sy: 1 + 0.03 * S(p * TAU), mouth: 0.6,
  }),
  // nhảy bật tại chỗ
  dance_03: (p) => {
    const j = ab(S(p * PI));
    const land = Math.pow(1 - j, 4);
    return {
      y: -j * 28, sy: 1 - 0.12 * land + 0.05 * j, sx: 1 + 0.1 * land - 0.03 * j,
      lL: 0.55 * j, lR: -0.45 * j, aL: 1.0 + 1.6 * j, aR: 1.0 + 1.6 * j,
      fL: 0.3 + 0.5 * j, fR: 0.3 + 0.5 * j, head: -0.06 * j + 0.05 * S(p * PI), rot: 0.04 * S(p * PI), mouth: j > 0.5 ? 1 : 0.2,
    };
  },
  // nhảy theo nhịp nhanh
  dance_04: (p) => {
    const q = p * 2;
    return {
      y: -ab(S(q * PI)) * 11, x: 3 * S(q * PI * 0.5), rot: 0.08 * S(q * PI * 0.5),
      aL: 1.7 + 0.95 * S(q * PI), aR: 1.7 + 0.95 * S(q * PI + PI),
      fL: 1 + 0.8 * S(q * PI + 0.6), fR: 1 + 0.8 * S(q * PI + PI + 0.6),
      head: 0.14 * S(q * PI - 0.4), headY: 2 * S(q * TAU), lL: 0.36 * S(q * PI), lR: -0.36 * S(q * PI), mouth: 0.5,
    };
  },
};

/** Clip một lần: u = tiến độ 0..1. dur tính bằng giây. */
const SHOTS: Record<string, { dur: number; fn: Fn }> = {
  cheer: {
    dur: 1.4,
    fn: (_p, u) => ({
      aL: 2.85 + 0.2 * S(u * 40), aR: 2.85 + 0.2 * S(u * 40 + 1), fL: 0.5, fR: 0.5,
      y: -ab(S(u * PI * 3)) * 26, sy: 1 + 0.05 * S(u * PI * 6), head: -0.15, mouth: 1,
      lL: 0.3 * S(u * PI * 6), lR: -0.3 * S(u * PI * 6),
    }),
  },
  wave: {
    dur: 2,
    fn: (_p, u) => ({
      aR: 2.45, fR: 0.55 + 0.55 * S(u * TAU * 4), aL: 0.2, rot: 0.04 * S(u * TAU * 2),
      y: -ab(S(u * PI * 4)) * 3, head: 0.12, mouth: 0.8,
    }),
  },
  like_react: {
    dur: 1,
    fn: (_p, u) => ({
      y: -ab(S(u * PI * 2)) * 22, aL: 0.9, aR: 0.9, fL: 2.1, fR: 2.1,
      head: 0.16 * S(u * TAU * 2), sx: 1 + 0.06 * S(u * TAU * 3), sy: 1 - 0.06 * S(u * TAU * 3), mouth: 1,
    }),
  },
  follow_react: {
    dur: 1.6,
    fn: (_p, u) => {
      const turn = Math.cos(u * TAU * 1.5);
      return {
        sx: Math.abs(turn) < 0.18 ? 0.18 * Math.sign(turn || 1) : turn,
        y: -ab(S(u * PI * 2)) * 30, aL: 2.7, aR: 2.7, fL: 0.4, fR: 0.4, head: -0.1, mouth: 1,
      };
    },
  },
  gift_react: {
    dur: 1.8,
    fn: (_p, u) => ({
      y: -ab(S(u * PI * 2)) * 36, sy: 1 + 0.06 * S(u * PI * 8),
      aL: 1.95 + 0.3 * S(u * 22), aR: 1.95 + 0.3 * S(u * 22 + 1), fL: 0.5, fR: 0.5,
      head: -0.2, lL: 0.4 * S(u * PI * 4), lR: -0.4 * S(u * PI * 4), mouth: 1,
    }),
  },
  spawn: {
    dur: 0.75,
    fn: (_p, u) => {
      const k = easeOutBack(clamp01(u));
      return { a: clamp01(u * 3), s: Math.max(0.01, k), y: -(1 - clamp01(u)) * 70, aL: 2.4, aR: 2.4, fL: 0.3, fR: 0.3, mouth: 1 };
    },
  },
  despawn: {
    dur: 0.9,
    fn: (_p, u) => ({ a: 1 - clamp01(u), y: -u * 45, s: 1 - 0.15 * u, aR: 2.4, fR: 0.6 * S(u * 30), mouth: 0 }),
  },
};

export const ONE_SHOT_CLIPS = new Set<Clip>(Object.keys(SHOTS) as Clip[]);
export const DANCE_CLIPS: Clip[] = ['dance_01', 'dance_02', 'dance_03', 'dance_04'];

export function clipDuration(c: Clip): number { return SHOTS[c]?.dur ?? 0; }

export function evalClip(c: Clip, p: number, u: number): Pose {
  const part = (LOOPS[c] ?? SHOTS[c]?.fn ?? LOOPS.idle)(p, u);
  return { ...REST, ...part };
}

const KEYS = Object.keys(REST) as (keyof Pose)[];

export function lerpPose(a: Pose, b: Pose, t: number, out: Pose = { ...REST }): Pose {
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/** Cường độ animation: nội suy giữa REST và pose (a, s giữ nguyên). */
export function applyIntensity(p: Pose, k: number): Pose {
  const o = { ...p };
  for (const key of KEYS) {
    if (key === 'a' || key === 's' || key === 'sx' || key === 'sy') continue;
    o[key] = REST[key] + (p[key] - REST[key]) * k;
  }
  o.sx = 1 + (p.sx - 1) * k;
  o.sy = 1 + (p.sy - 1) * k;
  return o;
}
