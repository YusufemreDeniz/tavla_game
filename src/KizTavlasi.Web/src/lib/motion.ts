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

/** Animasyon süresini (ms) tercihlere göre ölçekler; hareket azaltıldıysa 0 döner. */
export function scaleDuration(normalMs: number, prefs: MotionPrefs): number {
  if (prefs.reduced) return 0;
  return Math.round(prefs.fast ? normalMs * FAST_MODE_FACTOR : normalMs);
}

/**
 * Pul uçuşu (ms, normal hız): kalkış → yay → masaya değme → küçük sekme → oturma.
 * Pul masaya {@link FLIGHT_TOUCHDOWN} oranında değer; pul sesi o anda çalar.
 */
export const FLIGHT_MS = { advance: 560, collect: 760 } as const;
export const FLIGHT_TOUCHDOWN = 0.78;

export function flightDuration(kind: keyof typeof FLIGHT_MS, prefs: MotionPrefs): number {
  return scaleDuration(FLIGHT_MS[kind], prefs);
}

/** Uçuş başladıktan kaç ms sonra pul masaya değer (hareket azaltıldıysa 0). */
export function flightTouchdownMs(kind: keyof typeof FLIGHT_MS, prefs: MotionPrefs): number {
  return Math.round(flightDuration(kind, prefs) * FLIGHT_TOUCHDOWN);
}

export function useMotionPrefs(): MotionPrefs {
  const reduced = useReducedMotion() ?? false;
  const fast = useUiStore((s) => s.fastMode);
  return { reduced, fast };
}
