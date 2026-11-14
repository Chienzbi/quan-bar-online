import { create } from 'zustand';
import { DEFAULT_SETTINGS, type Settings, type Status } from './types';

export interface BarState {
  settings: Settings;
  status: Status;
  setSettings: (patch: Partial<Settings>) => void;
  setStatus: (s: Status) => void;
}

export const EMPTY_STATUS: Status = {
  fps: 0, avatars: 0, queue: 0, slots: 60, connection: 'idle',
  source: 'none', audio: 'none', totalGift: 0, events: 0, position: 0, duration: 0,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('quan-bar:settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* localStorage có thể bị chặn */ }
  return DEFAULT_SETTINGS;
}

export const useBar = create<BarState>((set, get) => ({
  settings: loadSettings(),
  status: EMPTY_STATUS,
  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    try { localStorage.setItem('quan-bar:settings', JSON.stringify(settings)); } catch { /* ignore */ }
    set({ settings });
  },
  setStatus: (status) => set({ status }),
}));
