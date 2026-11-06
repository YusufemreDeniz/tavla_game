import type { PlayerBoardDto } from '../types/game';

/**
 * İki authoritative snapshot arasındaki görsel farkı bulur: hangi pul hangi
 * konumdan hangi konuma geçti? Kural hesaplamaz; yalnızca sunucunun zaten
 * uyguladığı değişikliği animasyon için yorumlar.
 *
 * Pul kimliği (slot): bir hanedeki pullar, hane kenarından ortaya doğru 0..N-1
 * numaralanır. İnmemiş pullar önce, inmişler (öne itilmişler) sonra gelir. Bu yüzden
 * bir pul indirildiğinde numarası DEĞİŞMEZ; yalnızca grup değiştirir (aradaki boşluğun
 * ötesine geçer). Toplamada ise her zaman en yüksek slot'taki pul hanedendir. Böylece
 * pul, DOM'da aynı düğüm olarak kalır ve hiçbir zaman silinip yeniden oluşturulmaz.
 */
export interface PieceMove {
  kind: 'advance' | 'collect';
  playerId: string;
  point: number;
  /** Önceki render'daki kaynak pulun DOM anahtarı. */
  fromKey: string;
  /** Yeni render'daki hedef pulun DOM anahtarı (indirmede kaynakla aynıdır). */
  toKey: string;
}

export function pieceKey(playerId: string, point: number, slot: number): string {
  return `${playerId}:${point}:${slot}`;
}

export function railKey(playerId: string, index: number): string {
  return `${playerId}:rail:${index}`;
}

/** Tek adımlık (bir pul) değişiklik varsa döndürür; yeni el, yeniden bağlanma vb. için null. */
export function detectPieceMove(prev: PlayerBoardDto, next: PlayerBoardDto): PieceMove | null {
  if (prev.playerId !== next.playerId) return null;

  const changed = next.points.filter((p) => {
    const before = prev.points.find((q) => q.pointNumber === p.pointNumber);
    return !before || before.backCount !== p.backCount || before.frontCount !== p.frontCount;
  });
  if (changed.length !== 1) return null;

  const after = changed[0];
  const before = prev.points.find((q) => q.pointNumber === after.pointNumber);
  if (!before) return null;

  const { playerId } = next;
  const point = after.pointNumber;

  const isAdvance =
    after.backCount === before.backCount - 1 &&
    after.frontCount === before.frontCount + 1 &&
    next.collectedCount === prev.collectedCount;
  if (isAdvance) {
    // İnen pul, arka grubun son pulu: slot'u aynı kalır, boşluğun ötesine itilir.
    const slot = pieceKey(playerId, point, before.backCount - 1);
    return { kind: 'advance', playerId, point, fromKey: slot, toKey: slot };
  }

  const totalBefore = before.backCount + before.frontCount;
  const totalAfter = after.backCount + after.frontCount;
  const isCollect =
    totalAfter === totalBefore - 1 && next.collectedCount === prev.collectedCount + 1;
  if (isCollect) {
    return {
      kind: 'collect',
      playerId,
      point,
      fromKey: pieceKey(playerId, point, totalBefore - 1),
      toKey: railKey(playerId, next.collectedCount - 1),
    };
  }

  return null;
}
