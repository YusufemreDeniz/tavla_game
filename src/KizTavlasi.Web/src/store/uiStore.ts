import { create } from 'zustand';

interface UiStoreState {
  soundEnabled: boolean;
  fastMode: boolean;
  rulesModalOpen: boolean;
  toast: { message: string; kind: 'info' | 'error' } | null;

  toggleSound: () => void;
  toggleFastMode: () => void;
  setRulesModalOpen: (open: boolean) => void;
  showToast: (message: string, kind?: 'info' | 'error') => void;
  clearToast: () => void;
}

const SOUND_KEY = 'kiztavlasi:sound';
const FAST_MODE_KEY = 'kiztavlasi:fastMode';

export const useUiStore = create<UiStoreState>((set) => ({
  soundEnabled: localStorage.getItem(SOUND_KEY) !== 'off',
  fastMode: localStorage.getItem(FAST_MODE_KEY) === 'on',
  rulesModalOpen: false,
  toast: null,

  toggleSound: () =>
    set((state) => {
      const next = !state.soundEnabled;
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
      return { soundEnabled: next };
    }),

  toggleFastMode: () =>
    set((state) => {
      const next = !state.fastMode;
      localStorage.setItem(FAST_MODE_KEY, next ? 'on' : 'off');
      return { fastMode: next };
    }),

  setRulesModalOpen: (open) => set({ rulesModalOpen: open }),
  showToast: (message, kind = 'info') => set({ toast: { message, kind } }),
  clearToast: () => set({ toast: null }),
}));
