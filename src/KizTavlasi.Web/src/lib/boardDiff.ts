import type { PlayerBoardDto } from '../types/game';

/**
 * İki authoritative snapshot arasındaki görsel farkı bulur: hangi pul hangi
 * konumdan hangi konuma geçti? Kural hesaplamaz; yalnızca sunucunun zaten
 * uyguladığı değişikliği animasyon için yorumlar.
 */
export type PieceStack = 'back' | 'front';

export interface PieceMove {
  kind: 'advance' | 'collect';
  playerId: string;
  point: number;
  /** Önceki render'daki kaynak pulun DOM anahtarı. */
  fromKey: string;
  /** Yeni render'daki hedef pulun DOM anahtarı. */
  toKey: string;
}

export function pieceKey(playerId: string, point: number, stack: PieceStack, index: number): string {
  return `${playerId}:${point}:${stack}:${index}`;
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
    return {
      kind: 'advance',
      playerId,
      point,
      fromKey: pieceKey(playerId, point, 'back', before.backCount - 1),
      toKey: pieceKey(playerId, point, 'front', after.frontCount - 1),
    };
  }

  const totalBefore = before.backCount + before.frontCount;
  const totalAfter = after.backCount + after.frontCount;
  const isCollect =
    totalAfter === totalBefore - 1 && next.collectedCount === prev.collectedCount + 1;
  if (isCollect) {
    const fromFront = after.frontCount < before.frontCount;
    return {
      kind: 'collect',
      playerId,
      point,
      fromKey: fromFront
        ? pieceKey(playerId, point, 'front', before.frontCount - 1)
        : pieceKey(playerId, point, 'back', before.backCount - 1),
      toKey: railKey(playerId, next.collectedCount - 1),
    };
  }

  return null;
}
