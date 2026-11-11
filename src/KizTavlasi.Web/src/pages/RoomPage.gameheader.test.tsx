/**
 * GameView (oyun durumu) başlığı — mobil taşma düzeltmesi sözleşmesi (Aşama 3.9D-1).
 *
 * jsdom yerleşim (layout) hesaplamaz: burada yalnızca (a) başlığın satır kırabilme SINIF sözleşmesi ve
 * (b) davranış/erişilebilirlik korunumu sınanır. Gerçek taşma ölçümü Chromium'da (Playwright) yapılır.
 *
 * Mock varsayımları (gerçek protokol DEĞİL): ../api/rooms ve GameHubClient sahtedir; ./GameView küçük bir taslaktır.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoomPage from './RoomPage';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import type { PlayerDto, RoomSnapshotDto, RoomStatus } from '../types/game';

const h = vi.hoisted(() => ({
  startImpl: null as null | (() => Promise<void>),
  leaveRoom: vi.fn(),
}));

vi.mock('../api/rooms', () => ({
  getPublicRoomInfo: vi.fn(),
  joinRoom: vi.fn(),
  watchRoom: vi.fn(),
  leaveRoom: h.leaveRoom,
  createBotRoom: vi.fn(),
  getMatchStats: vi.fn(),
}));

vi.mock('../realtime/gameHubClient', () => ({
  GameHubClient: class {
    start = vi.fn(() => (h.startImpl ? h.startImpl() : Promise.resolve()));
    stop = vi.fn(() => Promise.resolve());
    refreshState = vi.fn(() => Promise.resolve());
    startMatch = vi.fn(() => Promise.resolve());
  },
}));

vi.mock('./GameView', () => ({
  default: () => <div data-testid="game-view">game</div>,
}));

const KEY = (code: string) => `kiztavlasi:token:${code}`;
const SPECTATOR_KEY = (code: string) => `kiztavlasi:spectator:${code}`;
const fakeToken = (playerId: string) => `h.${btoa(JSON.stringify({ playerId }))}.s`;

const player = (id: string, name: string): PlayerDto => ({
  id,
  displayName: name,
  seat: id === 'p1' ? 1 : 2,
  isConnected: true,
  isHost: id === 'p1',
});

function snapshot(status: RoomStatus): RoomSnapshotDto {
  return {
    roomCode: 'ABC123',
    status,
    bestOf: 3,
    hostPlayerId: 'p1',
    players: [player('p1', 'Ayşe'), player('p2', 'Fatma')],
    match: null,
    rematchRequestedByPlayerId: null,
    stateVersion: 1,
    serverTimeUtc: '2026-01-01T00:00:00Z',
    turnTimeLimitSeconds: 30,
  };
}

function connectWith(status: RoomStatus) {
  h.startImpl = async () => {
    useGameStore.getState().setConnectionStatus('connected');
    useGameStore.getState().applyAuthoritativeSnapshot(snapshot(status));
  };
}

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

const header = () => document.querySelector('header') as HTMLElement;
const ACTIONS = ['Hızlı animasyon modunu aç', 'Sesi kapat', 'Kuralları göster', 'Odadan çık'];
const actionGroup = () => within(header()).getByRole('button', { name: 'Sesi kapat' }).parentElement as HTMLElement;
const infoGroup = () => header().firstElementChild as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  h.startImpl = null;
  h.leaveRoom.mockResolvedValue(undefined);
  sessionStorage.clear();
  useGameStore.getState().reset();
  useGameStore.getState().setMyPlayerId(null);
  useUiStore.setState({ toast: null, rulesModalOpen: false, soundEnabled: true, fastMode: false });
});

describe('oyun başlığı — satır kırma sözleşmesi (mobil taşma düzeltmesi)', () => {
  it('başlık satır kırabilir (flex-wrap) ve eylem grubu satır kırılınca sağda kalır (ml-auto)', async () => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
    connectWith('Playing');
    renderRoom();
    await screen.findByTestId('game-view');

    expect(header().className).toMatch(/(^|\s)flex-wrap(\s|$)/);
    expect(actionGroup().className).toMatch(/(^|\s)ml-auto(\s|$)/);
  });

  it('taşmayı gizlemek için overflow sınıfı kullanılmaz (gerçek yerleşim düzeltilir)', async () => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
    connectWith('Playing');
    renderRoom();
    await screen.findByTestId('game-view');

    expect(header().className).not.toMatch(/overflow/);
    expect(document.body.innerHTML).not.toMatch(/overflow-x-hidden/);
  });

  it('oyun başlığı eski görsel varyantta kalır; lobi A3 başlığıyla aynı sınıfları paylaşmaz', async () => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
    connectWith('Waiting');
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });
    const lobbyClass = header().className;

    act(() => useGameStore.getState().applyAuthoritativeSnapshot({ ...snapshot('Playing'), stateVersion: 2 }));
    await screen.findByTestId('game-view');

    const gameClass = header().className;
    expect(gameClass).not.toBe(lobbyClass);
    expect(gameClass).toMatch(/(^|\s)justify-between(\s|$)/);
    expect(gameClass).toMatch(/(^|\s)items-center(\s|$)/);
    // Oda kodu eski gold/night paletinde kalır (A3 token'ına geçmedi).
    act(() => useGameStore.getState().setConnectionStatus('reconnecting'));
    expect(within(header()).getByText('ABC123').className).toContain('text-gold-400');
  });

  it('lobi A3 başlığı bu düzeltmeden etkilenmez (legacy sınıfları taşımaz)', async () => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
    connectWith('Waiting');
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });

    expect(within(header()).getByText('ABC123').className).not.toContain('text-gold-400');
  });
});

describe('oyun başlığı — içerik ve erişilebilirlik korunumu', () => {
  beforeEach(() => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
  });

  it('bağlıyken dört eylem görünür; oda kodu ve rozet gizlidir', async () => {
    connectWith('Playing');
    renderRoom();
    await screen.findByTestId('game-view');

    const bar = within(header());
    for (const name of ACTIONS) expect(bar.getByRole('button', { name })).toHaveAttribute('type', 'button');
    expect(bar.queryByText('ABC123')).not.toBeInTheDocument();
    expect(bar.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    ['reconnecting', 'Yeniden bağlanıyor…'],
    ['disconnected', 'Bağlantı kesildi'],
    ['connecting', 'Bağlanıyor…'],
  ] as const)('%s: oda kodu + rozet görünür, rozet role=status/aria-live=polite, dört eylem yerinde', async (status, label) => {
    connectWith('Playing');
    renderRoom();
    await screen.findByTestId('game-view');
    act(() => useGameStore.getState().setConnectionStatus(status));

    const bar = within(header());
    expect(bar.getByText('ABC123')).toBeInTheDocument();
    const badge = bar.getByRole('status');
    expect(badge).toHaveTextContent(label);
    expect(badge).toHaveAttribute('aria-live', 'polite');
    for (const name of ACTIONS) expect(bar.getByRole('button', { name })).toBeInTheDocument();
  });

  it('DOM sırası: bilgi grubu (oda kodu, rozet) eylem grubundan ÖNCE gelir; Tab sırası dört eylemdir', async () => {
    connectWith('Playing');
    const user = userEvent.setup();
    renderRoom();
    await screen.findByTestId('game-view');
    act(() => useGameStore.getState().setConnectionStatus('reconnecting'));

    expect(infoGroup().compareDocumentPosition(actionGroup()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const name of ACTIONS) {
      await user.tab();
      expect(screen.getByRole('button', { name })).toHaveFocus();
    }
  });

  it("eylemler: hızlı mod/ses durumu ve kurallar penceresi callback'leri çalışır", async () => {
    connectWith('Playing');
    const user = userEvent.setup();
    renderRoom();
    await screen.findByTestId('game-view');

    await user.click(screen.getByRole('button', { name: 'Hızlı animasyon modunu aç' }));
    expect(useUiStore.getState().fastMode).toBe(true);
    expect(screen.getByRole('button', { name: 'Normal animasyon hızına geç' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Sesi kapat' }));
    expect(useUiStore.getState().soundEnabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Kuralları göster' }));
    expect(await screen.findByRole('dialog', { name: 'Kız Tavlası Kuralları' })).toBeInTheDocument();
  });

  it('host: "Odadan çık" leaveRoom çağırır ve ana sayfaya gider', async () => {
    connectWith('Playing');
    const user = userEvent.setup();
    renderRoom();
    await screen.findByTestId('game-view');

    await user.click(within(header()).getByRole('button', { name: 'Odadan çık' }));
    expect(h.leaveRoom).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
  });

  it("izleyici: \"İzlemeyi bırak\" görünür, \"Odadan çık\" yoktur; yalnızca izleyici token'ı silinir", async () => {
    sessionStorage.clear();
    sessionStorage.setItem(SPECTATOR_KEY('ABC123'), fakeToken('spec'));
    connectWith('Playing');
    const user = userEvent.setup();
    renderRoom();
    await screen.findByTestId('game-view');

    const bar = within(header());
    expect(bar.queryByRole('button', { name: 'Odadan çık' })).not.toBeInTheDocument();
    await user.click(bar.getByRole('button', { name: 'İzlemeyi bırak' }));
    expect(h.leaveRoom).not.toHaveBeenCalled();
    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
    expect(sessionStorage.getItem(SPECTATOR_KEY('ABC123'))).toBeNull();
  });
});
