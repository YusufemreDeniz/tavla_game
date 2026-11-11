/**
 * RoomPage hata sunumu entegrasyon testleri (Aşama 3.10A). Davranış referansı `RoomPage.test.tsx` (değişmedi).
 *
 * Mock varsayımları (gerçek SignalR/REST doğrulaması DEĞİLDİR): ../api/rooms ve GameHubClient sahte; `start()` testin
 * `startImpl`'iyle bağlantıyı/snapshot'ı taklit eder, `startMatch` testin `startMatchImpl`'ini çalıştırır. GameView taslak.
 * RoomPage, LobbyView, Toast, store GERÇEK. Teknik metinler gerçek dünyada gözlenen biçimleri taklit eder.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RoomPage from './RoomPage';
import Toast from '../components/Toast';
import { ApiError } from '../api/client';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import type { PlayerDto, RoomSnapshotDto } from '../types/game';

const h = vi.hoisted(() => ({
  startImpl: null as null | (() => Promise<void>),
  startMatchImpl: null as null | (() => Promise<void>),
  startMatchCalls: 0,
  joinRoom: vi.fn(),
  createBotRoom: vi.fn(),
  getPublicRoomInfo: vi.fn(),
  watchRoom: vi.fn(),
}));

vi.mock('../api/rooms', () => ({
  getPublicRoomInfo: h.getPublicRoomInfo,
  joinRoom: h.joinRoom,
  watchRoom: h.watchRoom,
  leaveRoom: vi.fn(),
  createBotRoom: h.createBotRoom,
  getMatchStats: vi.fn(),
}));

vi.mock('../realtime/gameHubClient', () => ({
  GameHubClient: class {
    start = vi.fn(() => (h.startImpl ? h.startImpl() : Promise.resolve()));
    stop = vi.fn(() => Promise.resolve());
    refreshState = vi.fn(() => Promise.resolve());
    startMatch = vi.fn(() => {
      h.startMatchCalls += 1;
      return h.startMatchImpl ? h.startMatchImpl() : Promise.resolve();
    });
  },
}));

vi.mock('./GameView', () => ({ default: () => <div data-testid="game-view" /> }));

const KEY = (code: string) => `kiztavlasi:token:${code}`;
const fakeToken = (playerId: string) => `h.${btoa(JSON.stringify({ playerId }))}.s`;
const host = (): PlayerDto => ({ id: 'p1', displayName: 'Ayşe', seat: 1, isConnected: true, isHost: true });
const guest = (): PlayerDto => ({ id: 'p2', displayName: 'Fatma', seat: 2, isConnected: true, isHost: false });

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
          <Route
            path="/oda/:roomCode"
            element={
              <>
                <RoomPage />
                <Toast />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const RAW_WS = 'WebSocket closed with status code: 0 (no reason given).';
const RAW_UNEXPECTED = "An unexpected error occurred invoking 'StartMatch' on the server.";
const GENERIC = 'İşlem gerçekleştirilemedi. Lütfen tekrar deneyin.';

async function startAndFail(error: unknown, status?: 'reconnecting' | 'disconnected') {
  const user = userEvent.setup();
  renderRoom();
  const start = await screen.findByRole('button', { name: 'Oyunu Başlat' });
  h.startMatchImpl = async () => {
    if (status) act(() => useGameStore.getState().setConnectionStatus(status));
    throw error;
  };
  await user.click(start);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.startImpl = null;
  h.startMatchImpl = null;
  h.startMatchCalls = 0;
  sessionStorage.clear();
  sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
  useGameStore.getState().reset();
  useGameStore.getState().setMyPlayerId(null);
  useUiStore.setState({ toast: null, rulesModalOpen: false, soundEnabled: true, fastMode: false });
});
afterEach(() => vi.useRealTimers());

describe('RoomPage komut hataları — ham teknik mesaj sızmaz', () => {
  it.each([RAW_WS, RAW_UNEXPECTED, 'Failed to complete negotiation with the server', 'TypeError: Failed to fetch'])(
    'StartMatch ham teknik hatası ("%s") güvenli mesaja dönüşür ve DOM\'da görünmez',
    async (raw) => {
      connectWith([host(), guest()]);
      await startAndFail(new Error(raw));
      await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: GENERIC, kind: 'error' }));
      expect(screen.getByRole('alert')).toHaveTextContent(GENERIC);
      expect(document.body.textContent).not.toContain(raw);
      expect(document.body.textContent).not.toMatch(/WebSocket|unexpected error|negotiation|Failed to fetch/);
    },
  );

  it('bağlantı durumu güvenilir biçimde reconnecting ise bağlantı mesajı gösterilir', async () => {
    connectWith([host(), guest()]);
    await startAndFail(new Error(RAW_WS), 'reconnecting');
    await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: 'Bağlantı kesildi. Lütfen tekrar deneyin.', kind: 'error' }));
    expect(document.body.textContent).not.toContain(RAW_WS);
  });

  it('bağlantı bağlıyken ilgisiz hata bağlantı kesintisi diye sınıflandırılmaz', async () => {
    connectWith([host(), guest()]);
    await startAndFail(new TypeError("Cannot read properties of undefined (reading 'x')"));
    await waitFor(() => expect(useUiStore.getState().toast?.message).toBe(GENERIC));
    expect(useUiStore.getState().toast?.message).not.toMatch(/Bağlantı/);
  });

  it('boş hata metni ve Error olmayan reddetme değerleri sessiz kalmaz; güvenli mesaj gösterilir', async () => {
    connectWith([host(), guest()]);
    await startAndFail(new Error(''));
    await waitFor(() => expect(useUiStore.getState().toast?.message).toBe(GENERIC));
    act(() => useUiStore.getState().clearToast());
    const start = screen.getByRole('button', { name: 'Oyunu Başlat' });
    for (const value of [null, undefined, 'düz metin', 42]) {
      h.startMatchImpl = () => Promise.reject(value);
      fireEvent.click(start);
      await waitFor(() => expect(useUiStore.getState().toast?.message).toBe(GENERIC));
      act(() => useUiStore.getState().clearToast());
    }
  });

  it('HubException: serbest metin gösterilmez, tanımlı domain kodu istemci metniyle gösterilir; sıra ve eski durum eşlemeleri korunur', async () => {
    connectWith([host(), guest()]);
    const user = userEvent.setup();
    renderRoom();
    const start = await screen.findByRole('button', { name: 'Oyunu Başlat' });

    // 3.10B: 3.10A'daki eski beklenti serbest HubException metnini ('Bu işlem şu an yapılamaz.') gösteriyordu; artık güvenilmez.
    h.startMatchImpl = () => Promise.reject(new Error('An unexpected error occurred: HubException: Bu işlem şu an yapılamaz.'));
    await user.click(start);
    await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: GENERIC, kind: 'error' }));
    expect(document.body.textContent).not.toContain('Bu işlem şu an yapılamaz.');

    h.startMatchImpl = () => Promise.reject(new Error('Server=(localdb)\\MSSQLLocalDB: HubException: SELECT * FROM Players'));
    await user.click(start);
    await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: GENERIC, kind: 'error' }));
    expect(document.body.textContent).not.toMatch(/localdb|SELECT/i);

    // Karşılık: tanımlı domain kodu (tam eşleşme) + istemci metni.
    h.startMatchImpl = () => Promise.reject(new Error('An unexpected error occurred: HubException: ROOM_EXPIRED'));
    await user.click(start);
    await waitFor(() =>
      expect(useUiStore.getState().toast).toEqual({ message: 'Bu odanın süresi dolmuş. Yeni bir oda oluşturabilirsin.', kind: 'error' }),
    );

    h.startMatchImpl = () => Promise.reject(new Error('NOT_YOUR_TURN'));
    await user.click(start);
    await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: 'Sıra sende değil.', kind: 'error' }));

    h.startMatchImpl = () => Promise.reject(new Error('STALE_STATE'));
    await user.click(start);
    const info = await screen.findByText('Oyun durumu senkronize edildi, hamleni tekrar yapabilirsin.');
    expect(info.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hata toast\'ı role="alert" olmaya devam eder ve 4 sn sonra kapanır', async () => {
    connectWith([host(), guest()]);
    renderRoom();
    const start = await screen.findByRole('button', { name: 'Oyunu Başlat' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    h.startMatchImpl = () => Promise.reject(new Error(RAW_WS));
    fireEvent.click(start);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(GENERIC));
    // Kesin 3999/4000 ms sınırı Toast.test.tsx'te sabit; burada gerçek zaman kayması için ±500 ms toleranslı kontrol.
    act(() => void vi.advanceTimersByTime(3400));
    expect(useUiStore.getState().toast).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1200));
    expect(useUiStore.getState().toast).toBeNull();
  });
});

describe('RoomPage — oturum ve yetkilendirme davranışı değişmez', () => {
  it('teknik WebSocket hatası oturumu geçersiz saymaz: lobi kalır, token silinmez, kurtarma ekranı açılmaz', async () => {
    connectWith([host(), guest()]);
    await startAndFail(new Error(RAW_WS));
    await waitFor(() => expect(useUiStore.getState().toast?.message).toBe(GENERIC));
    expect(sessionStorage.getItem(KEY('ABC123'))).toBe(fakeToken('p1'));
    expect(screen.getByRole('heading', { level: 1, name: 'Lobi' })).toBeInTheDocument();
    expect(screen.queryByText('Sunucuya bağlanılamadı.')).not.toBeInTheDocument();
  });

  it('bağlantı kurulamazsa mevcut hata ekranı gösterilir; ham hata metni görünmez ve token otomatik silinmez', async () => {
    h.startImpl = () => Promise.reject(new Error("Failed to complete negotiation with the server: Error: Unauthorized: Status code '401'"));
    renderRoom();
    expect(await screen.findByText('Sunucuya bağlanılamadı.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tekrar Dene' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bu Odadaki Oturumu Sıfırla' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/negotiation|Unauthorized|401/);
    expect(sessionStorage.getItem(KEY('ABC123'))).toBe(fakeToken('p1'));
  });

  it('StartMatch bağlantı koruması korunur: reconnecting iken handler komutu göndermez', async () => {
    connectWith([host(), guest()]);
    renderRoom();
    const start = await screen.findByRole('button', { name: 'Oyunu Başlat' });
    act(() => useGameStore.getState().setConnectionStatus('reconnecting'));
    expect(start).toBeDisabled();
    fireEvent.click(start);
    expect(h.startMatchCalls).toBe(0);
    expect(useUiStore.getState().toast).toBeNull();
  });
});

describe('RoomPage — REST mutation hataları', () => {
  it("katılma: çerçeve üretimi olabilecek kodsuz 400 başlığı ham gösterilmez; bağlam fallback'i kullanılır", async () => {
    sessionStorage.clear();
    h.getPublicRoomInfo.mockResolvedValue(snapshot([host()]));
    h.joinRoom.mockRejectedValue(new ApiError(400, 'One or more validation errors occurred.', null));
    const user = userEvent.setup();
    renderRoom();
    await user.type(await screen.findByLabelText('Oyuncu adın'), 'Fatma');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));
    await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: 'Odaya katılınamadı.', kind: 'error' }));
    expect(document.body.textContent).not.toContain('validation errors');
    expect(sessionStorage.getItem(KEY('ABC123'))).toBeNull();
  });

  it('izleme: tanınan kod + istemci eşlemesi → istemci metni; eşleme yok / kodsuz → bağlam fallback\'i, sunucu başlığı asla (3.10C)', async () => {
    sessionStorage.clear();
    h.getPublicRoomInfo.mockResolvedValue(snapshot([host(), guest()]));
    const user = userEvent.setup();
    renderRoom();
    const watch = await screen.findByRole('button', { name: 'Maçı İzle' });

    h.watchRoom.mockRejectedValueOnce(new ApiError(410, 'Sunucunun serbest başlığı', 'ROOM_EXPIRED'));
    await user.click(watch);
    await waitFor(() =>
      expect(useUiStore.getState().toast).toEqual({ message: 'Bu odanın süresi dolmuş. Yeni bir oda oluşturabilirsin.', kind: 'error' }),
    );
    expect(document.body.textContent).not.toContain('Sunucunun serbest başlığı');

    for (const [status, code] of [[400, 'INVALID_COMMAND'], [403, null], [409, null], [500, null], [400, 'SOME_NEW_CODE']] as const) {
      act(() => useUiStore.getState().clearToast());
      h.watchRoom.mockRejectedValueOnce(new ApiError(status, 'Ham sunucu başlığı XYZ', code as never));
      await user.click(screen.getByRole('button', { name: 'Maçı İzle' }));
      await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: 'Maç izlenemedi.', kind: 'error' }));
      expect(document.body.textContent).not.toContain('Ham sunucu başlığı XYZ');
    }
  });

  it('bot masası: kodsuz 404 başlığı ham gösterilmez; kodsuz 429 sabit güvenli mesajı alır; kodsuz 403/409/500 başlıkları gösterilmez', async () => {
    connectWith([host()]);
    const user = userEvent.setup();
    renderRoom();
    const easy = await screen.findByRole('button', { name: 'Kolay' });
    h.createBotRoom.mockRejectedValueOnce(new ApiError(404, 'Not Found', null));
    await user.click(easy);
    await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: 'Bot masası açılamadı.', kind: 'error' }));
    act(() => useUiStore.getState().clearToast());
    h.createBotRoom.mockRejectedValueOnce(new ApiError(429, 'Too Many Requests', null));
    await user.click(easy);
    await waitFor(() =>
      expect(useUiStore.getState().toast).toEqual({ message: 'Çok fazla istek gönderildi. Lütfen biraz bekleyin.', kind: 'error' }),
    );
    for (const status of [403, 409, 500]) {
      act(() => useUiStore.getState().clearToast());
      h.createBotRoom.mockRejectedValueOnce(new ApiError(status, 'Ham sunucu başlığı XYZ', null));
      await user.click(easy);
      await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: 'Bot masası açılamadı.', kind: 'error' }));
      expect(document.body.textContent).not.toContain('Ham sunucu başlığı XYZ');
    }
  });
});
