import { create } from 'zustand';

interface UiStoreState {
  soundEnabled: boolean;
  rulesModalOpen: boolean;
  toast: { message: string; kind: 'info' | 'error' } | null;

  toggleSound: () => void;
  setRulesModalOpen: (open: boolean) => void;
  showToast: (message: string, kind?: 'info' | 'error') => void;
  clearToast: () => void;
}

const SOUND_KEY = 'kiztavlasi:sound';

export const useUiStore = create<UiStoreState>((set) => ({
  soundEnabled: localStorage.getItem(SOUND_KEY) !== 'off',
  rulesModalOpen: false,
  toast: null,

  toggleSound: () =>
    set((state) => {
      const next = !state.soundEnabled;
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
      return { soundEnabled: next };
    }),

  setRulesModalOpen: (open) => set({ rulesModalOpen: open }),
  showToast: (message, kind = 'info') => set({ toast: { message, kind } }),
  clearToast: () => set({ toast: null }),
}));
