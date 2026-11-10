/** Yalnızca STATİK sınıf dizgelerini birleştirir. `bg-${renk}` gibi dinamik Tailwind sınıfı üretmeyin. */
/**
 * Odak halkası (A3: 3 px altın, 3 px offset). `!important` yok: index.css'teki global `:focus-visible`
 * kuralı `@layer base` içindedir, bu yardımcılar (utilities katmanı) onu doğal olarak geçersiz kılar.
 */
export const focusRing =
  'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-solid focus-visible:outline-line-focus';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
