/** Sunucu UTC zamanı: saat dilimi eki yoksa (DB kaynaklı DateTime) UTC kabul edilir. */
export function parseServerTime(value: string): number {
  return Date.parse(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`);
}
