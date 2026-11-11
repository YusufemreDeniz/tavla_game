/**
 * RoomPage A3 başlık entegrasyon testleri (Aşama 3.8D). Davranış sözleşmesi `RoomPage.test.tsx`'tir (değişmedi).
 *
 * Mock varsayımları (gerçek protokol/WebSocket doğrulaması DEĞİLDİR): ../api/rooms ve GameHubClient sahtedir
 * (`start()` bağlantı durumunu 'connected' yapıp snapshot'ı store'a yazar, testin `startImpl`'iyle taklit edilir);
 * ./GameView küçük bir taslaktır. RoomPage, RoomHeader, LobbyView, ShareLinkCard, ConnectionBadge, RulesModal GERÇEKTİR.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoomPage from './RoomPage';
import ConnectionBadge from '../components/ConnectionBadge';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import type { ConnectionStatus, PlayerDto, RoomSnapshotDto, RoomStatus } from '../types/game';

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

const player = (id: string, name: string, extra: Partial<PlayerDto> = {}): PlayerDto => ({
  id,
  displayName: name,
  seat: id === 'p1' ? 1 : 2,
  isConnected: true,
  isHost: id === 'p1',
  ...extra,
});

function snapshot(players: PlayerDto[], status: RoomStatus = 'Waiting'): RoomSnapshotDto {
  return {
    roomCode: 'ABC123',
    status,
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

function connectWith(snap: () => RoomSnapshotDto) {
  h.startImpl = async () => {
    useGameStore.getState().setConnectionStatus('connected');
    useGameStore.getState().applyAuthoritativeSnapshot(snap());
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

beforeEach(() => {
  vi.clearAllMocks();
  h.startImpl = null;
  h.leaveRoom.mockResolvedValue(undefined);
  sessionStorage.clear();
  useGameStore.getState().reset();
  useGameStore.getState().setMyPlayerId(null);
  useUiStore.setState({ toast: null, rulesModalOpen: false, soundEnabled: true, fastMode: false });
});

describe('RoomPage lobi başlığı (A3)', () => {
  beforeEach(() => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
  });

  it('başlık oda kodunu, bağlantı rozetini ve dört eylemi içerir; sayfada tek h1 vardır', async () => {
    connectWith(() => snapshot([player('p1', 'Ayşe')]));
    renderRoom();
    await screen.findByRole('heading', { level: 1, name: 'Lobi' });

    const bar = within(header());
    expect(bar.getByText('ABC123')).toBeInTheDocument();
    expect(bar.getByRole('status')).toHaveTextContent('Bağlı');
    for (const name of ['Hızlı animasyon modunu aç', 'Sesi kapat', 'Kuralları göster', 'Odadan çık']) {
      expect(bar.getByRole('button', { name })).toHaveAttribute('type', 'button');
    }
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('klavye: sayfa başından Tab sırası Hızlı mod → Ses → Kurallar → Odadan çık; Enter kurallar penceresini açar', async () => {
    connectWith(() => snapshot([player('p1', 'Ayşe')]));
    const user = userEvent.setup();
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });

    for (const name of ['Hızlı animasyon modunu aç', 'Sesi kapat', 'Kuralları göster', 'Odadan çık']) {
      await user.tab();
      expect(screen.getByRole('button', { name })).toHaveFocus();
    }
    await user.tab({ shift: true });
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Kız Tavlası Kuralları' })).toBeInTheDocument();
  });

  it('hızlı mod ve ses anahtarları ad/aria-pressed değerini ve store durumunu günceller', async () => {
    connectWith(() => snapshot([player('p1', 'Ayşe')]));
    const user = userEvent.setup();
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });

    await user.click(screen.getByRole('button', { name: 'Sesi kapat' }));
    expect(useUiStore.getState().soundEnabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Sesi aç' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hızlı animasyon modunu aç' }));
    expect(useUiStore.getState().fastMode).toBe(true);
    expect(screen.getByRole('button', { name: 'Normal animasyon hızına geç' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('"Odadan çık": leaveRoom çağrılır, token silinir ve ana sayfaya gidilir', async () => {
    connectWith(() => snapshot([player('p1', 'Ayşe')]));
    const user = userEvent.setup();
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });

    await user.click(screen.getByRole('button', { name: 'Odadan çık' }));
    expect(h.leaveRoom).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY('ABC123'))).toBeNull();
  });

  it('yeniden bağlanma: rozet metni değişir ve role="alert" mesajı görünür; bağlanınca kaybolur', async () => {
    connectWith(() => snapshot([player('p1', 'Ayşe')]));
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => useGameStore.getState().setConnectionStatus('reconnecting'));
    expect(screen.getByRole('alert')).toHaveTextContent('Bağlantı kesildi. Oyun durumu korunuyor, yeniden bağlanılıyor…');
    expect(within(header()).getByRole('status')).toHaveTextContent('Yeniden bağlanıyor…');

    act(() => useGameStore.getState().setConnectionStatus('disconnected'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(within(header()).getByRole('status')).toHaveTextContent('Bağlantı kesildi');

    act(() => useGameStore.getState().setConnectionStatus('connected'));
    expect(within(header()).getByRole('status')).toHaveTextContent(/^Bağlı$/);
  });

  it('izleyici sayısı rozeti erişilebilir ad taşır', async () => {
    connectWith(() => snapshot([player('p1', 'Ayşe')]));
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });
    act(() => useGameStore.getState().setSpectatorCount(3));
    expect(within(header()).getByLabelText('3 izleyici')).toBeInTheDocument();
  });
});

describe('RoomPage izleyici başlığı', () => {
  it('izleyici lobisinde çıkış düğmesi "İzlemeyi bırak" adını taşır ve yalnızca izleyici token\'ını siler (API çağrılmaz)', async () => {
    sessionStorage.setItem(SPECTATOR_KEY('ABC123'), fakeToken('spec'));
    connectWith(() => snapshot([player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    const user = userEvent.setup();
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });

    expect(within(header()).queryByRole('button', { name: 'Odadan çık' })).not.toBeInTheDocument();
    await user.click(within(header()).getByRole('button', { name: 'İzlemeyi bırak' }));
    expect(h.leaveRoom).not.toHaveBeenCalled();
    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
    expect(sessionStorage.getItem(SPECTATOR_KEY('ABC123'))).toBeNull();
  });
});

describe('Lobi → oyun geçişi ve GameView başlığı', () => {
  beforeEach(() => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
  });

  it('maç başlayınca mevcut başlık eylemleri korunur; bağlıyken oda kodu/rozet gizlenir, sorunda geri gelir', async () => {
    const two = [player('p1', 'Ayşe'), player('p2', 'Fatma')];
    connectWith(() => snapshot(two));
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });
    expect(within(header()).getByText('ABC123')).toBeInTheDocument();

    act(() => useGameStore.getState().applyAuthoritativeSnapshot({ ...snapshot(two, 'Playing'), stateVersion: 2 }));
    expect(await screen.findByTestId('game-view')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Lobi' })).not.toBeInTheDocument();

    const bar = within(header());
    for (const name of ['Hızlı animasyon modunu aç', 'Sesi kapat', 'Kuralları göster', 'Odadan çık']) {
      expect(bar.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(bar.queryByText('ABC123')).not.toBeInTheDocument();
    expect(bar.queryByRole('status')).not.toBeInTheDocument();

    act(() => useGameStore.getState().setConnectionStatus('reconnecting'));
    expect(bar.getByText('ABC123')).toBeInTheDocument();
    expect(bar.getByRole('status')).toHaveTextContent('Yeniden bağlanıyor…');
    expect(screen.getByRole('alert')).toHaveTextContent('Bağlantı kesildi. Oyun durumu korunuyor, yeniden bağlanılıyor…');
  });

  it('oyun başlığındaki "Odadan çık" aynı çıkış akışını çalıştırır', async () => {
    connectWith(() => snapshot([player('p1', 'Ayşe'), player('p2', 'Fatma')], 'Playing'));
    const user = userEvent.setup();
    renderRoom();
    await screen.findByTestId('game-view');

    await user.click(within(header()).getByRole('button', { name: 'Odadan çık' }));
    expect(h.leaveRoom).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
  });
});

describe('ConnectionBadge varyantları', () => {
  const LABELS: Record<ConnectionStatus, string> = {
    idle: 'Bağlı değil',
    connecting: 'Bağlanıyor…',
    connected: 'Bağlı',
    reconnecting: 'Yeniden bağlanıyor…',
    disconnected: 'Bağlantı kesildi',
  };

  it.each(Object.entries(LABELS) as Array<[ConnectionStatus, string]>)('a3 varyantı %s için aynı metin ve live-region semantiğini korur', (status, label) => {
    render(<ConnectionBadge status={status} variant="a3" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent(label);
    expect(badge).toHaveAttribute('aria-live', 'polite');
  });

  it('varsayılan varyantın görünümü değişmez; a3 varyantı farklı sınıf alır (oyun başlığı korunur)', () => {
    const { rerender } = render(<ConnectionBadge status="connected" />);
    const defaultClass = screen.getByRole('status').className;
    expect(defaultClass).toBe('inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400');
    rerender(<ConnectionBadge status="connected" variant="a3" />);
    expect(screen.getByRole('status').className).not.toBe(defaultClass);
  });
});
