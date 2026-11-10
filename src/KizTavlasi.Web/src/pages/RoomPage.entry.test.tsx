/**
 * RoomPage giriş/durum ekranları (Aşama 3.7B) — erişilebilirlik ve klavye davranışı testleri.
 * İş mantığı karakterizasyonu `RoomPage.test.tsx` içindedir; burada yalnızca yeni arayüzün kullanıcı davranışları sınanır.
 * Mock varsayımları `RoomPage.test.tsx` başlığıyla aynıdır: sahte API, sahte GameHubClient, GameView taslağı;
 * gerçek WebSocket/SignalR YOKTUR.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RoomPage from './RoomPage';
import { ApiError } from '../api/client';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import type { PlayerDto, RoomSnapshotDto } from '../types/game';

const h = vi.hoisted(() => ({
  startImpl: null as null | ((token: string) => Promise<void>),
  getPublicRoomInfo: vi.fn(),
  joinRoom: vi.fn(),
  watchRoom: vi.fn(),
  leaveRoom: vi.fn(),
  createBotRoom: vi.fn(),
  getMatchStats: vi.fn(),
}));

vi.mock('../api/rooms', () => ({
  getPublicRoomInfo: h.getPublicRoomInfo,
  joinRoom: h.joinRoom,
  watchRoom: h.watchRoom,
  leaveRoom: h.leaveRoom,
  createBotRoom: h.createBotRoom,
  getMatchStats: h.getMatchStats,
}));

vi.mock('../realtime/gameHubClient', () => ({
  GameHubClient: class {
    token: string;
    constructor(token: string) {
      this.token = token;
    }
    start = vi.fn(() => (h.startImpl ? h.startImpl(this.token) : Promise.resolve()));
    stop = vi.fn(() => Promise.resolve());
    refreshState = vi.fn(() => Promise.resolve());
    startMatch = vi.fn(() => Promise.resolve());
    rollDice = vi.fn(() => Promise.resolve());
    playMove = vi.fn(() => Promise.resolve());
    sendReaction = vi.fn(() => Promise.resolve());
    requestRematch = vi.fn(() => Promise.resolve());
    acceptRematch = vi.fn(() => Promise.resolve());
    declineRematch = vi.fn(() => Promise.resolve());
  },
}));

vi.mock('./GameView', () => ({ default: () => <div data-testid="game-view" /> }));

const KEY = (code: string) => `kiztavlasi:token:${code}`;
const fakeToken = (playerId: string) => `h.${btoa(JSON.stringify({ playerId }))}.s`;

const player = (id: string, displayName: string): PlayerDto => ({
  id,
  displayName,
  seat: id === 'p1' ? 1 : 2,
  isConnected: true,
  isHost: id === 'p1',
});

const snapshot = (players: PlayerDto[]): RoomSnapshotDto => ({
  roomCode: 'ABC123',
  status: 'Waiting',
  bestOf: 3,
  hostPlayerId: players.find((p) => p.isHost)?.id ?? null,
  players,
  match: null,
  rematchRequestedByPlayerId: null,
  stateVersion: 1,
  serverTimeUtc: '2026-01-01T00:00:00Z',
  turnTimeLimitSeconds: null,
});

function renderRoom() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/oda/ABC123']}>
        <Routes>
          <Route path="/oda/:roomCode" element={<RoomPage />} />
          <Route path="/" element={<p>ANA SAYFA</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const reloadMock = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  h.startImpl = null;
  sessionStorage.clear();
  useGameStore.getState().reset();
  useGameStore.getState().setMyPlayerId(null);
  useUiStore.setState({ toast: null, rulesModalOpen: false });
  Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload: reloadMock } });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

/** Her giriş/durum ekranı tek bir main bölgesi ve tek bir <h1> sunar (yükleniyor ekranı başlıksızdır). */
describe('RoomPage giriş ekranları — sayfa yapısı', () => {
  it('katılma, oda bulunamadı, masa dolu ve bağlantı hatası ekranlarında tek main ve tek h1 vardır', async () => {
    h.getPublicRoomInfo.mockResolvedValueOnce(snapshot([player('p1', 'Ayşe')]));
    const join = renderRoom();
    await screen.findByLabelText('Oyuncu adın');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    join.unmount();

    h.getPublicRoomInfo.mockRejectedValueOnce(new ApiError(404, 'x', 'ROOM_NOT_FOUND'));
    const missing = renderRoom();
    await screen.findByText('Böyle bir oda bulunamadı. Kodu kontrol et.');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Böyle bir oda bulunamadı. Kodu kontrol et.' })).toBeInTheDocument();
    missing.unmount();

    h.getPublicRoomInfo.mockResolvedValueOnce(snapshot([player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    const full = renderRoom();
    await screen.findByRole('heading', { level: 1, name: 'Masa dolu' });
    expect(screen.getAllByRole('main')).toHaveLength(1);
    full.unmount();

    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
    h.startImpl = () => Promise.reject(new Error('negotiation failed'));
    renderRoom();
    await screen.findByRole('heading', { level: 1, name: 'Sunucuya bağlanılamadı.' });
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('yükleniyor ekranları başlıksızdır ve yalnızca bir role=status içerir', async () => {
    h.getPublicRoomInfo.mockReturnValue(new Promise(() => {}));
    renderRoom();
    expect(screen.getByRole('status')).toHaveTextContent('Oda bilgisi yükleniyor…');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});

describe('RoomPage giriş ekranları — katılma formu', () => {
  beforeEach(() => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot([player('p1', 'Ayşe')]));
  });

  it('ad hatası alanı geçersiz işaretler, mesajla ilişkilendirir; düzeltilince işaret kalkar', async () => {
    h.joinRoom.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderRoom();
    const input = await screen.findByLabelText('Oyuncu adın');
    expect(input).not.toHaveAttribute('aria-invalid');

    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Oyuncu adı en az 2 karakter olmalıdır.');
    expect(screen.getByRole('alert')).toHaveTextContent('Oyuncu adı en az 2 karakter olmalıdır.');

    await user.type(input, 'Fatma');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('klavye: Tab sırası ad alanı → "Odaya Katıl"; ad alanında Enter formu gönderir', async () => {
    h.joinRoom.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderRoom();
    await screen.findByLabelText('Oyuncu adın');

    await user.tab();
    expect(screen.getByLabelText('Oyuncu adın')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Odaya Katıl' })).toHaveFocus();

    await user.click(screen.getByLabelText('Oyuncu adın'));
    await user.keyboard('Fatma{Enter}');
    expect(h.joinRoom).toHaveBeenCalledWith('ABC123', 'Fatma');
  });

  it('katılma isteği sürerken düğme meşgul (aria-busy) ve pasiftir', async () => {
    h.joinRoom.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderRoom();
    await user.type(await screen.findByLabelText('Oyuncu adın'), 'Fatma');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));

    const busy = await screen.findByRole('button', { name: 'Katılıyor…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
  });

  it('başarılı katılımdan sonra sayfa yeniden açılırsa oturum korunur: katılma formu yeniden gösterilmez', async () => {
    const token = fakeToken('p2');
    h.joinRoom.mockResolvedValue({ roomCode: 'ABC123', playerToken: token, player: player('p2', 'Fatma'), roomState: {} });
    h.startImpl = async () => {
      useGameStore.getState().setConnectionStatus('connected');
      useGameStore.getState().applyAuthoritativeSnapshot(snapshot([player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    };
    const user = userEvent.setup();
    const first = renderRoom();
    await user.type(await screen.findByLabelText('Oyuncu adın'), 'Fatma');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));
    await screen.findByRole('heading', { name: 'Lobi' });
    expect(sessionStorage.getItem(KEY('ABC123'))).toBe(token);
    first.unmount();

    h.getPublicRoomInfo.mockClear();
    useGameStore.getState().reset();
    renderRoom(); // "sayfa yenileme": aynı sessionStorage, yeni render
    expect(await screen.findByRole('heading', { name: 'Lobi' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Oyuncu adın')).not.toBeInTheDocument();
    expect(h.getPublicRoomInfo).not.toHaveBeenCalled();
  });
});

describe('RoomPage giriş ekranları — eylemlere klavye erişimi', () => {
  it('masa dolu: Tab sırası "Maçı İzle" → "Ana Sayfaya Dön"; Enter izlemeyi başlatır (bekleme etiketi, aria-busy)', async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot([player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    h.watchRoom.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderRoom();
    await screen.findByRole('heading', { name: 'Masa dolu' });

    await user.tab();
    expect(screen.getByRole('button', { name: 'Maçı İzle' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Ana Sayfaya Dön' })).toHaveFocus();
    await user.tab({ shift: true });
    await user.keyboard('{Enter}');

    expect(h.watchRoom).toHaveBeenCalledWith('ABC123');
    const busy = await screen.findByRole('button', { name: 'Bağlanıyor…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
  });

  it('oda bulunamadı: tek eylem klavyeyle odaklanır ve Enter ile ana sayfaya götürür', async () => {
    h.getPublicRoomInfo.mockRejectedValue(new ApiError(404, 'x', 'ROOM_NOT_FOUND'));
    const user = userEvent.setup();
    renderRoom();
    await screen.findByText('Böyle bir oda bulunamadı. Kodu kontrol et.');

    await user.tab();
    expect(screen.getByRole('button', { name: 'Ana Sayfaya Dön' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
  });

  it('bağlantı hatası: Tab sırası "Tekrar Dene" → "Ana Sayfa"; Enter eylemleri çalıştırır', async () => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
    h.startImpl = () => Promise.reject(new Error('negotiation failed'));
    const user = userEvent.setup();
    renderRoom();
    await screen.findByRole('heading', { name: 'Sunucuya bağlanılamadı.' });

    await user.tab();
    expect(screen.getByRole('button', { name: 'Tekrar Dene' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(reloadMock).toHaveBeenCalledTimes(1);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Ana Sayfa' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY('ABC123'))).toBeNull();
  });

  it('bağlantı kurulurken yükleniyor durumu duyurulur ve bağlantı tamamlanınca lobi açılır', async () => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
    let finish!: () => void;
    h.startImpl = () =>
      new Promise<void>((resolve) => {
        finish = () => {
          useGameStore.getState().setConnectionStatus('connected');
          useGameStore.getState().applyAuthoritativeSnapshot(snapshot([player('p1', 'Ayşe')]));
          resolve();
        };
      });
    renderRoom();

    expect(await screen.findByRole('status')).toHaveTextContent('Odaya bağlanılıyor…');
    await act(async () => finish());
    expect(await screen.findByRole('heading', { name: 'Lobi' })).toBeInTheDocument();
  });
});
