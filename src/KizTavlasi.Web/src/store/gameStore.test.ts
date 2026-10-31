import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from './gameStore';
import type { RoomSnapshotDto } from '../types/game';

function snapshotWithVersion(version: number): RoomSnapshotDto {
  return {
    roomCode: 'ABCDEF',
    status: 'Playing',
    bestOf: 1,
    hostPlayerId: 'p1',
    players: [
      { id: 'p1', displayName: 'Ayşe', seat: 1, isConnected: true, isHost: true },
      { id: 'p2', displayName: 'Fatma', seat: 2, isConnected: true, isHost: false },
    ],
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

  it('setPlayerConnection stateVersion artmasa bile oyuncunun bağlantı durumunu günceller', () => {
    const store = useGameStore.getState();
    store.applySnapshot(snapshotWithVersion(7));

    store.setPlayerConnection('p2', false, 7);

    const p2 = useGameStore.getState().snapshot?.players.find((p) => p.id === 'p2');
    expect(p2?.isConnected).toBe(false);
    expect(useGameStore.getState().stateVersion).toBe(7);
  });

  it('setPlayerConnection eski stateVersion içeren bağlantı olayını reddeder', () => {
    const store = useGameStore.getState();
    store.applySnapshot(snapshotWithVersion(10));

    store.setPlayerConnection('p2', false, 8);

    const p2 = useGameStore.getState().snapshot?.players.find((p) => p.id === 'p2');
    expect(p2?.isConnected).toBe(true);
  });

  it('applyAuthoritativeSnapshot rejoin sırasında aynı stateVersion ile gelse bile kabul edilir', () => {
    const store = useGameStore.getState();
    store.applySnapshot(snapshotWithVersion(5));

    const rejoined = snapshotWithVersion(5);
    rejoined.players[1].isConnected = false;
    store.applyAuthoritativeSnapshot(rejoined);

    const p2 = useGameStore.getState().snapshot?.players.find((p) => p.id === 'p2');
    expect(p2?.isConnected).toBe(false);
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
