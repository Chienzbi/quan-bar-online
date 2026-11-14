export type LiveEvent =
  | { type: 'JOIN'; userId: string; name: string; follower?: boolean }
  | { type: 'LIKE'; userId: string; name: string; count?: number }
  | { type: 'COMMENT'; userId: string; name: string; text: string }
  | { type: 'FOLLOW'; userId: string; name: string }
  | { type: 'SHARE'; userId: string; name: string }
  | {
      type: 'GIFT';
      userId: string;
      name: string;
      giftId: string;
      giftName: string;
      diamonds: number; // giá trị 1 quà
      repeatCount?: number; // combo tích lũy (nếu nguồn cung cấp)
      repeatEnd?: boolean;
    };

export type Clip =
  | 'idle' | 'dance_01' | 'dance_02' | 'dance_03' | 'dance_04'
  | 'cheer' | 'wave' | 'like_react' | 'follow_react' | 'gift_react'
  | 'spawn' | 'despawn';

export type ConnStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface Settings {
  demo: boolean;
  maxAvatars: number;
  animIntensity: number; // 0.3 - 1.5
  lightIntensity: number; // 0 - 1.5
  lasers: boolean;
  camera: boolean;
  musicPlaying: boolean;
  volume: number; // 0 - 1
  track: string; // 'synth:neon' | 'synth:pulse' | 'file:/music/xxx.mp3'
  /** Danh sách phát (yt:ID hoặc file:/music/…). Hết bài thì sang bài kế, hết danh sách thì quay lại đầu. */
  playlist: string[];
  giftLv2: number; // ngưỡng kim cương cấp 2
  giftLv3: number; // ngưỡng kim cương cấp 3
  idleReplaceSec: number; // avatar không tương tác quá X giây mới bị thay khi hết slot
  liveUrl: string;
}

export interface Status {
  fps: number;
  avatars: number;
  queue: number;
  slots: number;
  connection: ConnStatus;
  source: string;
  audio: 'none' | 'suspended' | 'running';
  totalGift: number;
  events: number;
  /** vị trí / độ dài bài nhạc (giây); duration = 0 nếu không tua được (synth) */
  position: number;
  duration: number;
}

export type BusMsg =
  | { t: 'event'; event: LiveEvent }
  | { t: 'settings'; patch: Partial<Settings> }
  | { t: 'cmd'; name: 'reset' | 'spawnTest' | 'connect' | 'disconnect' | 'seek' | 'next'; arg?: number | string }
  | { t: 'status'; status: Status; settings: Settings }
  | { t: 'hello' };

export const DEFAULT_SETTINGS: Settings = {
  demo: true,
  maxAvatars: 60,
  animIntensity: 1,
  lightIntensity: 1,
  lasers: true,
  camera: true,
  musicPlaying: true,
  volume: 0.6,
  track: 'synth:neon',
  playlist: [],
  giftLv2: 100,
  giftLv3: 1000,
  idleReplaceSec: 60,
  liveUrl: 'ws://localhost:8788',
};
