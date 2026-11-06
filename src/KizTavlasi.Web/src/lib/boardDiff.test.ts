import { describe, expect, it } from 'vitest';
import { detectPieceMove, pieceKey, railKey } from './boardDiff';
import type { PlayerBoardDto } from '../types/game';

function board(
  points: [number, number][],
  collectedCount = 0,
  playerId = 'p1',
): PlayerBoardDto {
  return {
    playerId,
    seat: 1,
    collectedCount,
    isCollecting: points.every(([back]) => back <= 1),
    points: points.map(([backCount, frontCount], i) => ({ pointNumber: i + 1, backCount, frontCount })),
  };
}

const INITIAL: [number, number][] = [
  [2, 0],
  [2, 0],
  [2, 0],
  [3, 0],
  [3, 0],
  [3, 0],
];

describe('detectPieceMove', () => {
  it('indirme: pul kimliği (slot) değişmez; aynı düğüm boşluğun ötesine itilir', () => {
    const after = INITIAL.map((p, i) => (i === 5 ? ([2, 1] as [number, number]) : p));
    const move = detectPieceMove(board(INITIAL), board(after));

    expect(move).toEqual({
      kind: 'advance',
      playerId: 'p1',
      point: 6,
      fromKey: pieceKey('p1', 6, 2),
      toKey: pieceKey('p1', 6, 2),
    });
  });

  it('indirme: önceden inmiş pul varsa itilen pul arka grubun son pulu olarak kalır', () => {
    const before = board([[2, 0], [2, 0], [2, 0], [3, 0], [3, 0], [2, 1]]);
    const after = board([[2, 0], [2, 0], [2, 0], [3, 0], [3, 0], [1, 2]]);

    expect(detectPieceMove(before, after)).toMatchObject({
      kind: 'advance',
      fromKey: pieceKey('p1', 6, 1),
      toKey: pieceKey('p1', 6, 1),
    });
  });

  it('toplama: hanedeki en yüksek slot raydaki yeni en üst pula gider', () => {
    const before = board([[1, 1], [1, 1], [1, 1], [1, 2], [1, 2], [1, 2]], 0);
    const after = board([[1, 1], [1, 1], [1, 0], [1, 2], [1, 2], [1, 2]], 1);

    expect(detectPieceMove(before, after)).toMatchObject({
      kind: 'collect',
      point: 3,
      fromKey: pieceKey('p1', 3, 1),
      toKey: railKey('p1', 0),
    });
  });

  it('toplama: hanede inmiş pul yoksa arka pul toplanır', () => {
    const before = board([[1, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], 14);
    const after = board([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], 15);

    expect(detectPieceMove(before, after)).toMatchObject({
      kind: 'collect',
      fromKey: pieceKey('p1', 1, 0),
      toKey: railKey('p1', 14),
    });
  });

  it('birden fazla hane değiştiyse (yeniden bağlanma, toplu snapshot) animasyon yok', () => {
    const after = INITIAL.map((p, i) => (i >= 4 ? ([2, 1] as [number, number]) : p));
    expect(detectPieceMove(board(INITIAL), board(after))).toBeNull();
  });

  it('yeni el (tahta sıfırlandı) animasyon üretmez', () => {
    const finished = board([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], 15);
    expect(detectPieceMove(finished, board(INITIAL))).toBeNull();
  });

  it('farklı oyuncunun tahtası karşılaştırılmaz', () => {
    expect(detectPieceMove(board(INITIAL, 0, 'p1'), board(INITIAL, 0, 'p2'))).toBeNull();
  });

  it('değişiklik yoksa null döner', () => {
    expect(detectPieceMove(board(INITIAL), board(INITIAL))).toBeNull();
  });
});
