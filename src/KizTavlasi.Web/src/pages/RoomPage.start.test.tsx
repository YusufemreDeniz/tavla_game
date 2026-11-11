/**
 * RoomPage maç başlatma + bağlantı entegrasyon testleri (Aşama 3.9C). Davranış referansı `RoomPage.test.tsx`.
 *
 * Mock varsayımları (gerçek SignalR doğrulaması DEĞİLDİR): ../api/rooms ve GameHubClient sahte (`start()` durumu 'connected'
 * yapıp snapshot'ı store'a yazar; `startMatch` bir spy). GameView taslak. RoomPage, LobbyView, Button, store GERÇEK.
 * "StartMatch gönderildi mi?" = sahte hub'daki `startMatch` spy'ının çağrılıp çağrılmadığı.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoomPage from './RoomPage';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import type { PlayerDto, RoomSnapshotDto } from '../types/game';

const h = vi.hoisted(() => ({
  hubs: [] as Array<{ startMatch: ReturnType<typeof vi.fn> }>,
  startImpl: null as null | (() => Promise<void>),
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
    start = vi.fn(() => (h.startImpl ? h.startImpl() : Promise.resolve()));
    stop = vi.fn(() => Promise.resolve());
    refreshState = vi.fn(() => Promise.resolve());
    startMatch = vi.fn(() => Promise.resolve());
    constructor() {
      h.hubs.push(this);
    }
  },
}));

vi.mock('./GameView', () => ({ default: () => <div data-testid="game-view" /> }));

const KEY = (code: string) => `kiztavlasi:token:${code}`;
const SPECTATOR_KEY = (code: string) => `kiztavlasi:spectator:${code}`;
const fakeToken = (playerId: string) => `h.${btoa(JSON.stringify({ playerId }))}.s`;

const host = (): PlayerDto => ({ id: 'p1', displayName: 'Ayşe', seat: 1, isConnected: true, isHost: true });
const guest = (): PlayerDto => ({ id: 'p2', displayName: 'Fatma', seat: 2, isConnected: true, isHost: false });
const bot = (): PlayerDto => ({ id: 'bot', displayName: 'Usta Bot', seat: 2, isConnected: true, isHost: false, isBot: true });

function snapshot(players: PlayerDto[]): RoomSnapshotDto {
  return {
    roomCode: 'ABC123',
    status: 'Waiting',
    bestOf: 3,
    hostPlayerId: 'p1',
    players,
    match: null,
    rematchRequestedByPlayerId: null,
    stateVersion: 1,
    serverTimeUtc: '2026-01-01T00:00:00Z',
    turnTimeLimitSeconds: 30,
  };
}

function connectWith(players: PlayerDto[]) {
  h.startImpl = async () => {
    useGameStore.getState().setConnectionStatus('connected');
    useGameStore.getState().applyAuthoritativeSnapshot(snapshot(players));
  };
}

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

const lastHub = () => h.hubs[h.hubs.length - 1];

beforeEach(() => {
  vi.clearAllMocks();
  h.hubs.length = 0;
  h.startImpl = null;
  sessionStorage.clear();
  useGameStore.getState().reset();
  useGameStore.getState().setMyPlayerId(null);
  useUiStore.setState({ toast: null, rulesModalOpen: false });
});

describe('RoomPage — Oyunu Başlat bağlantı koruması', () => {
  beforeEach(() => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
  });

  it('connected: tıklama StartMatch gönderir', async () => {
    connectWith([host(), guest()]);
    const user = userEvent.setup();
    renderRoom();
    await user.click(await screen.findByRole('button', { name: 'Oyunu Başlat' }));
    expect(lastHub().startMatch).toHaveBeenCalledTimes(1);
  });

  it.each(['reconnecting', 'disconnected'] as const)('%s: düğme disabled, tıklama StartMatch GÖNDERMEZ; bağlantı gelince yeniden etkin ve çalışır', async (status) => {
    connectWith([host(), guest()]);
    const user = userEvent.setup();
    renderRoom();
    await screen.findByRole('button', { name: 'Oyunu Başlat' });

    act(() => useGameStore.getState().setConnectionStatus(status));
    const button = screen.getByRole('button', { name: 'Oyunu Başlat' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(lastHub().startMatch).not.toHaveBeenCalled();

    act(() => useGameStore.getState().setConnectionStatus('connected'));
    expect(screen.getByRole('button', { name: 'Oyunu Başlat' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Oyunu Başlat' }));
    expect(lastHub().startMatch).toHaveBeenCalledTimes(1);
  });

  it('yeniden bağlanma: banner (role=alert) korunur, snapshot ve oyuncu bilgileri bozulmaz', async () => {
    connectWith([host(), guest()]);
    renderRoom();
    await screen.findByRole('button', { name: 'Oyunu Başlat' });

    act(() => useGameStore.getState().setConnectionStatus('reconnecting'));
    expect(screen.getByRole('alert')).toHaveTextContent('Bağlantı kesildi. Oyun durumu korunuyor, yeniden bağlanılıyor…');
    expect(screen.getByText('2 / 2 Oyuncu')).toBeInTheDocument();
    expect(screen.getByText('Ayşe')).toBeInTheDocument();
    expect(screen.getByText('Fatma')).toBeInTheDocument();
    expect(useGameStore.getState().snapshot?.players).toHaveLength(2);

    act(() => useGameStore.getState().setConnectionStatus('connected'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('2 / 2 Oyuncu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Oyunu Başlat' })).toBeEnabled();
  });

  it('bot odası: "Bota Karşı Başlat" kopukken disabled ve StartMatch göndermez; bağlanınca çalışır', async () => {
    connectWith([host(), bot()]);
    const user = userEvent.setup();
    renderRoom();
    await screen.findByRole('button', { name: 'Bota Karşı Başlat' });

    act(() => useGameStore.getState().setConnectionStatus('disconnected'));
    await user.click(screen.getByRole('button', { name: 'Bota Karşı Başlat' }));
    expect(lastHub().startMatch).not.toHaveBeenCalled();

    act(() => useGameStore.getState().setConnectionStatus('connected'));
    await user.click(screen.getByRole('button', { name: 'Bota Karşı Başlat' }));
    expect(lastHub().startMatch).toHaveBeenCalledTimes(1);
  });
});

describe('RoomPage — misafir ve izleyici', () => {
  it('misafir: başlatma düğmesi yok, bağlantı durumundan bağımsız; StartMatch hiç gönderilmez', async () => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p2'));
    connectWith([host(), guest()]);
    renderRoom();
    expect(await screen.findByText('Oda sahibinin oyunu başlatması bekleniyor…')).toBeInTheDocument();
    for (const status of ['reconnecting', 'connected', 'disconnected'] as const) {
      act(() => useGameStore.getState().setConnectionStatus(status));
      expect(screen.queryByRole('button', { name: /Başlat/ })).not.toBeInTheDocument();
    }
    expect(lastHub().startMatch).not.toHaveBeenCalled();
  });

  it('izleyici: başlatma düğmesi yok; StartMatch hiç gönderilmez', async () => {
    sessionStorage.setItem(SPECTATOR_KEY('ABC123'), fakeToken('spec'));
    connectWith([host(), guest()]);
    renderRoom();
    expect(await screen.findByText('Oda sahibinin oyunu başlatması bekleniyor…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Başlat/ })).not.toBeInTheDocument();
    expect(lastHub().startMatch).not.toHaveBeenCalled();
  });
});
