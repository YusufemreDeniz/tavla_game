/**
 * RoomPage KOMUT KATMANI koruma testleri (Aşama 3.9C): `onStartMatch` handler'ı UI'dan bağımsız olarak çağrılsa bile
 * bağlantı 'connected' değilse StartMatch GÖNDERİLMEZ ve eski (stale) bir handler referansı güncel durumu okur.
 *
 * Mock varsayımları (gerçek SignalR doğrulaması DEĞİLDİR): ../api/rooms ve GameHubClient sahte (`startMatch` spy);
 * `./LobbyView` bir taslak — yalnızca RoomPage'in ona verdiği GERÇEK `onStartMatch` prop'unu yakalar ve test doğrudan çağırır
 * (UI'daki disabled korumasını bilerek atlar). Hata yönetimi (toast) gerçek `uiStore` ile doğrulanır.
 */
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoomPage from './RoomPage';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import type { RoomSnapshotDto } from '../types/game';

const h = vi.hoisted(() => ({
  hubs: [] as Array<{ startMatch: ReturnType<typeof vi.fn> }>,
  startMatchImpl: null as null | (() => Promise<void>),
  onStartMatch: null as null | (() => unknown),
}));

vi.mock('../api/rooms', () => ({
  getPublicRoomInfo: vi.fn(),
  joinRoom: vi.fn(),
  watchRoom: vi.fn(),
  leaveRoom: vi.fn(),
  createBotRoom: vi.fn(),
  getMatchStats: vi.fn(),
}));

vi.mock('../realtime/gameHubClient', () => ({
  GameHubClient: class {
    start = vi.fn(() => {
      useGameStore.getState().setConnectionStatus('connected');
      useGameStore.getState().applyAuthoritativeSnapshot(snap);
      return Promise.resolve();
    });
    stop = vi.fn(() => Promise.resolve());
    refreshState = vi.fn(() => Promise.resolve());
    startMatch = vi.fn(() => (h.startMatchImpl ? h.startMatchImpl() : Promise.resolve()));
    constructor() {
      h.hubs.push(this);
    }
  },
}));

vi.mock('./GameView', () => ({ default: () => <div /> }));

vi.mock('./LobbyView', () => ({
  default: (props: { onStartMatch: () => unknown }) => {
    h.onStartMatch = props.onStartMatch;
    return <h1>LobiTaslak</h1>;
  },
}));

const fakeToken = (playerId: string) => `h.${btoa(JSON.stringify({ playerId }))}.s`;
const snap: RoomSnapshotDto = {
  roomCode: 'ABC123',
  status: 'Waiting',
  bestOf: 3,
  hostPlayerId: 'p1',
  players: [
    { id: 'p1', displayName: 'Ayşe', seat: 1, isConnected: true, isHost: true },
    { id: 'p2', displayName: 'Fatma', seat: 2, isConnected: true, isHost: false },
  ],
  match: null,
  rematchRequestedByPlayerId: null,
  stateVersion: 1,
  serverTimeUtc: '2026-01-01T00:00:00Z',
  turnTimeLimitSeconds: 30,
};

function renderRoom() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/oda/ABC123']}>
        <Routes>
          <Route path="/oda/:roomCode" element={<RoomPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const startMatchCalls = () => h.hubs[h.hubs.length - 1].startMatch.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  h.hubs.length = 0;
  h.startMatchImpl = null;
  h.onStartMatch = null;
  sessionStorage.clear();
  sessionStorage.setItem('kiztavlasi:token:ABC123', fakeToken('p1'));
  useGameStore.getState().reset();
  useUiStore.setState({ toast: null, rulesModalOpen: false });
});

describe('StartMatch komut katmanı koruması', () => {
  it.each(['idle', 'connecting', 'reconnecting', 'disconnected'] as const)('%s iken handler doğrudan çağrılsa bile StartMatch gönderilmez; toast üretilmez', async (status) => {
    renderRoom();
    await screen.findByText('LobiTaslak');
    act(() => useGameStore.getState().setConnectionStatus(status));

    await act(async () => {
      await h.onStartMatch?.();
    });
    expect(startMatchCalls()).toBe(0);
    expect(useUiStore.getState().toast).toBeNull();
  });

  it('connected iken handler StartMatch gönderir', async () => {
    renderRoom();
    await screen.findByText('LobiTaslak');
    await act(async () => {
      await h.onStartMatch?.();
    });
    expect(startMatchCalls()).toBe(1);
  });

  it('stale closure yok: bağlıyken yakalanan ESKİ handler referansı, bağlantı kopunca güncel durumu okur', async () => {
    renderRoom();
    await screen.findByText('LobiTaslak');
    const staleHandler = h.onStartMatch!; // connected iken yakalandı
    act(() => useGameStore.getState().setConnectionStatus('disconnected'));

    await act(async () => {
      await staleHandler();
    });
    expect(startMatchCalls()).toBe(0);

    act(() => useGameStore.getState().setConnectionStatus('connected'));
    await act(async () => {
      await staleHandler();
    });
    expect(startMatchCalls()).toBe(1);
  });

  it('mevcut hata yönetimi bozulmadı: bağlıyken sunucu NOT_YOUR_TURN reddederse mevcut toast gösterilir', async () => {
    h.startMatchImpl = () => Promise.reject(new Error('NOT_YOUR_TURN'));
    renderRoom();
    await screen.findByText('LobiTaslak');
    await act(async () => {
      await h.onStartMatch?.();
    });
    expect(startMatchCalls()).toBe(1);
    expect(useUiStore.getState().toast?.message).toBe('Sıra sende değil.');
  });
});
