export type Species = 'human' | 'cat' | 'bear' | 'bunny' | 'dog' | 'panda';
export type HairStyle = 'short' | 'bob' | 'spiky' | 'twin' | 'bun' | 'long' | 'mohawk' | 'afro' | 'pony' | 'none';
export type OutfitStyle = 'hoodie' | 'tee' | 'jacket' | 'dress' | 'uniform' | 'overalls';
export type Accessory = 'none' | 'cap' | 'glasses' | 'shades' | 'phones' | 'crown' | 'bow' | 'band' | 'star';
export type Face = 'normal' | 'happy' | 'wink' | 'star' | 'cool';

export interface ChibiTemplate {
  id: string;
  species: Species;
  skin: number; // màu da / màu lông
  hair: HairStyle;
  hairColor: number;
  outfit: OutfitStyle;
  top: number;
  top2: number; // màu phụ (viền, dây, cà vạt)
  pants: number;
  shoes: number;
  acc: Accessory;
  accColor: number;
  face: Face;
  blush: boolean;
}

const SK = { light: 0xffdcc2, tan: 0xf2bf97, deep: 0xc98d62 };

/** 15 mẫu chibi: người + động vật hoạt hình. Dữ liệu thuần, rig vẽ bằng Graphics nhiều lớp. */
export const TEMPLATES: ChibiTemplate[] = [
  { id: 'mina', species: 'human', skin: SK.light, hair: 'twin', hairColor: 0xff6fb5, outfit: 'hoodie', top: 0x8a4bff, top2: 0xffffff, pants: 0x2b2250, shoes: 0xffffff, acc: 'star', accColor: 0xffd23f, face: 'happy', blush: true },
  { id: 'kai', species: 'human', skin: SK.tan, hair: 'spiky', hairColor: 0x2d9bff, outfit: 'jacket', top: 0xffc933, top2: 0x2b2250, pants: 0x2b2250, shoes: 0xff4f6d, acc: 'shades', accColor: 0x1a1a2e, face: 'cool', blush: false },
  { id: 'luna', species: 'human', skin: SK.light, hair: 'long', hairColor: 0xb06cff, outfit: 'dress', top: 0xff7ac8, top2: 0xffffff, pants: SK.light, shoes: 0xff4fa3, acc: 'bow', accColor: 0xffffff, face: 'normal', blush: true },
  { id: 'rex', species: 'human', skin: SK.deep, hair: 'mohawk', hairColor: 0x39ff88, outfit: 'tee', top: 0x20202c, top2: 0x39ff88, pants: 0x5b6cff, shoes: 0xffffff, acc: 'phones', accColor: 0xff4fa3, face: 'cool', blush: false },
  { id: 'sora', species: 'human', skin: SK.light, hair: 'bob', hairColor: 0x1d1a2b, outfit: 'uniform', top: 0xf2f2ff, top2: 0x2b3a8f, pants: 0x2b3a8f, shoes: 0x1a1a2e, acc: 'none', accColor: 0, face: 'wink', blush: true },
  { id: 'pika', species: 'cat', skin: 0xffa63d, hair: 'none', hairColor: 0, outfit: 'tee', top: 0x39d98a, top2: 0xffffff, pants: 0xffa63d, shoes: 0xffffff, acc: 'none', accColor: 0, face: 'happy', blush: true },
  { id: 'mochi', species: 'bunny', skin: 0xffffff, hair: 'none', hairColor: 0, outfit: 'overalls', top: 0xff9ad0, top2: 0xffffff, pants: 0xff9ad0, shoes: 0xff9ad0, acc: 'bow', accColor: 0xff4fa3, face: 'normal', blush: true },
  { id: 'bo', species: 'bear', skin: 0x9b6a45, hair: 'none', hairColor: 0, outfit: 'hoodie', top: 0x17b8b0, top2: 0xffffff, pants: 0x2b2250, shoes: 0xffffff, acc: 'cap', accColor: 0xff4f6d, face: 'happy', blush: false },
  { id: 'shiba', species: 'dog', skin: 0xe8b273, hair: 'none', hairColor: 0, outfit: 'tee', top: 0xff4f4f, top2: 0xffffff, pants: 0xe8b273, shoes: 0xffffff, acc: 'band', accColor: 0xffffff, face: 'normal', blush: true },
  { id: 'panda', species: 'panda', skin: 0xffffff, hair: 'none', hairColor: 0, outfit: 'jacket', top: 0x20202c, top2: 0xffffff, pants: 0x20202c, shoes: 0xffffff, acc: 'none', accColor: 0, face: 'happy', blush: true },
  { id: 'cherry', species: 'human', skin: SK.tan, hair: 'bun', hairColor: 0xe0262f, outfit: 'tee', top: 0x2de2ff, top2: 0xffffff, pants: 0xffffff, shoes: 0xe0262f, acc: 'glasses', accColor: 0x222233, face: 'happy', blush: true },
  { id: 'zed', species: 'human', skin: SK.deep, hair: 'afro', hairColor: 0xffd23f, outfit: 'hoodie', top: 0xff5a36, top2: 0x20202c, pants: 0x3b3b5c, shoes: 0xffd23f, acc: 'shades', accColor: 0xff4fa3, face: 'cool', blush: false },
  { id: 'nyan', species: 'cat', skin: 0xaeb4c8, hair: 'none', hairColor: 0, outfit: 'dress', top: 0xffd23f, top2: 0xffffff, pants: 0xaeb4c8, shoes: 0xffffff, acc: 'crown', accColor: 0xffd23f, face: 'wink', blush: true },
  { id: 'ace', species: 'human', skin: SK.light, hair: 'short', hairColor: 0xdfe6ff, outfit: 'jacket', top: 0x7b3bff, top2: 0xff4fa3, pants: 0x20202c, shoes: 0xffffff, acc: 'star', accColor: 0x2de2ff, face: 'star', blush: false },
  { id: 'mint', species: 'human', skin: SK.tan, hair: 'pony', hairColor: 0x45e6b5, outfit: 'hoodie', top: 0xff9f43, top2: 0xffffff, pants: 0x2b2250, shoes: 0xffffff, acc: 'band', accColor: 0xff4fa3, face: 'happy', blush: true },
];

export function shade(c: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
}
