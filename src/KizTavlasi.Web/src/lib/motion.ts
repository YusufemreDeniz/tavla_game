import { useReducedMotion } from 'framer-motion';
import { useUiStore } from '../store/uiStore';

export interface MotionPrefs {
  /** Kullanıcı işletim sisteminde hareket azaltmayı seçti: yörünge/sarsıntı animasyonları kapalı. */
  reduced: boolean;
  /** Uygulama içi "Hızlı" animasyon modu. */
  fast: boolean;
}

/** Hız çarpanı: hızlı modda animasyonlar yaklaşık %55 kısalır. */
export const FAST_MODE_FACTOR = 0.55;

/** Zarın masaya sekerek düşme süresi (ms, normal hız). */
export const DIE_DROP_MS = 560;

/** Animasyon süresini (ms) tercihlere göre ölçekler; hareket azaltıldıysa 0 döner. */
export function scaleDuration(normalMs: number, prefs: MotionPrefs): number {
  if (prefs.reduced) return 0;
  return Math.round(prefs.fast ? normalMs * FAST_MODE_FACTOR : normalMs);
}

/** Pul yörüngesi süreleri (ms, normal hız); ses, pul masaya değdiğinde çalar. */
export const FLIGHT_MS = { advance: 420, collect: 620 } as const;

export function flightDuration(kind: keyof typeof FLIGHT_MS, prefs: MotionPrefs): number {
  return scaleDuration(FLIGHT_MS[kind], prefs);
}

export function useMotionPrefs(): MotionPrefs {
  const reduced = useReducedMotion() ?? false;
  const fast = useUiStore((s) => s.fastMode);
  return { reduced, fast };
}
