import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from './gameStore';
import type { RoomSnapshotDto } from '../types/game';

function snapshotWithVersion(version: number): RoomSnapshotDto {
  return {
    roomCode: 'ABCDEF',
    status: 'Playing',
    bestOf: 1,
    hostPlayerId: 'p1',
    players: [],
    match: null,
    rematchRequestedByPlayerId: null,
    stateVersion: version,
    serverTimeUtc: new Date().toISOString(),
  };
}

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('yeni snapshot uygulanır ve stateVersion güncellenir', () => {
    useGameStore.getState().applySnapshot(snapshotWithVersion(5));

    expect(useGameStore.getState().stateVersion).toBe(5);
    expect(useGameStore.getState().snapshot?.stateVersion).toBe(5);
  });

  it('eski stateVersion içeren snapshot reddedilir', () => {
    const store = useGameStore.getState();
    store.applySnapshot(snapshotWithVersion(10));

    useGameStore.getState().applySnapshot(snapshotWithVersion(8));

    expect(useGameStore.getState().stateVersion).toBe(10);
  });

  it('aynı stateVersion tekrar uygulanmaz', () => {
    const first = snapshotWithVersion(3);
    useGameStore.getState().applySnapshot(first);

    const duplicate = { ...snapshotWithVersion(3), roomCode: 'DEĞİŞTİ' };
    useGameStore.getState().applySnapshot(duplicate);

    expect(useGameStore.getState().snapshot?.roomCode).toBe('ABCDEF');
  });

  it('geçmiş en fazla 8 kayıt tutar', () => {
    const store = useGameStore.getState();
    for (let i = 0; i < 12; i++) {
      store.addHistory(`kayıt ${i}`);
    }

    expect(useGameStore.getState().history).toHaveLength(8);
    expect(useGameStore.getState().history[0]).toBe('kayıt 11');
  });

  it('reset tüm oyun durumunu temizler', () => {
    const store = useGameStore.getState();
    store.applySnapshot(snapshotWithVersion(4));
    store.addHistory('bir kayıt');

    store.reset();

    expect(useGameStore.getState().snapshot).toBeNull();
    expect(useGameStore.getState().stateVersion).toBe(0);
    expect(useGameStore.getState().history).toHaveLength(0);
  });
});
