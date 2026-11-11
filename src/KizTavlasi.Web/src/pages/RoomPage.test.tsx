/**
 * RoomPage KARAKTERİZASYON testleri (Aşama 3.7A).
 *
 * Amaç: görsel dönüşümden önce RoomPage'in MEVCUT davranışını belgelemek. Burada yeni davranış tasarlanmaz;
 * bilinen sorunlar (ör. bağlantı kopukken "Oyunu Başlat"ın etkin kalması) bilerek doğru kabul edilmez.
 *
 * Mock varsayımları (gerçek protokol doğrulaması DEĞİLDİR):
 *  - ../api/rooms: tüm REST çağrıları sahtedir; gerçek `ApiError` kullanılır (message + errorCode sözleşmesi).
 *  - ../realtime/gameHubClient: `GameHubClient` sahte bir sınıftır. Gerçek istemci `start()` içinde bağlantı durumunu
 *    'connected' yapıp snapshot'ı store'a yazar; burada bunu test kendi `startImpl`'iyle taklit eder.
 *    Gerçek WebSocket/SignalR hiçbir testte kurulmaz.
 *  - ./GameView: oyun ekranı küçük bir taslakla (stub) değiştirilir; yalnızca RoomPage'in ona yönlendirmesi ve
 *    `spectator`/`onLeave` prop'ları test edilir. LobbyView, ShareLinkCard, ConnectionBadge, RulesModal GERÇEKTİR.
 *  - Router: MemoryRouter; `navigate('/')` gerçek yönlendirmedir ("ANA SAYFA" işaretçisiyle gözlenir).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RoomPage from './RoomPage';
import { ApiError } from '../api/client';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import type { PlayerDto, RoomSnapshotDto, RoomStatus } from '../types/game';

const h = vi.hoisted(() => {
  type Fn = ReturnType<typeof vi.fn>;
  return {
    hubs: [] as Array<{ token: string; start: Fn; stop: Fn; refreshState: Fn; startMatch: Fn }>,
    startImpl: null as null | ((token: string) => Promise<void>),
    startMatchImpl: null as null | (() => Promise<void>),
    getPublicRoomInfo: vi.fn(),
    joinRoom: vi.fn(),
    watchRoom: vi.fn(),
    leaveRoom: vi.fn(),
    createBotRoom: vi.fn(),
    getMatchStats: vi.fn(),
  };
});

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
    start = vi.fn(() => (h.startImpl ? h.startImpl(this.token) : Promise.resolve()));
    stop = vi.fn(() => Promise.resolve());
    refreshState = vi.fn(() => Promise.resolve());
    startMatch = vi.fn(() => (h.startMatchImpl ? h.startMatchImpl() : Promise.resolve()));
    rollDice = vi.fn(() => Promise.resolve());
    playMove = vi.fn(() => Promise.resolve());
    sendReaction = vi.fn(() => Promise.resolve());
    requestRematch = vi.fn(() => Promise.resolve());
    acceptRematch = vi.fn(() => Promise.resolve());
    declineRematch = vi.fn(() => Promise.resolve());
    constructor(token: string) {
      this.token = token;
      h.hubs.push(this);
    }
  },
}));

vi.mock('./GameView', () => ({
  default: (props: { spectator?: boolean; onLeave: () => void }) => (
    <div data-testid="game-view" data-spectator={String(Boolean(props.spectator))}>
      <button type="button" onClick={props.onLeave}>
        GV çık
      </button>
    </div>
  ),
}));

// ---------- yardımcılar ----------

const KEY = (code: string) => `kiztavlasi:token:${code}`;
const SPECTATOR_KEY = (code: string) => `kiztavlasi:spectator:${code}`;

/** `playerIdFromToken` yalnızca payload'daki playerId'yi okur (imza doğrulanmaz). */
const fakeToken = (playerId: string) => `h.${btoa(JSON.stringify({ playerId }))}.s`;

const player = (id: string, displayName: string, extra: Partial<PlayerDto> = {}): PlayerDto => ({
  id,
  displayName,
  seat: id === 'p1' ? 1 : 2,
  isConnected: true,
  isHost: id === 'p1',
  ...extra,
});

function snapshot(code: string, players: PlayerDto[], status: RoomStatus = 'Waiting', extra: Partial<RoomSnapshotDto> = {}): RoomSnapshotDto {
  return {
    roomCode: code,
    status,
    bestOf: 3,
    hostPlayerId: players.find((p) => p.isHost)?.id ?? null,
    players,
    match: null,
    rematchRequestedByPlayerId: null,
    stateVersion: 1,
    serverTimeUtc: '2026-01-01T00:00:00Z',
    turnTimeLimitSeconds: 30,
    ...extra,
  };
}

/** Gerçek hub'ın `start()` davranışını taklit eder: durum 'connected' olur ve snapshot store'a yazılır. */
function connectWith(snapshotFor: (token: string) => RoomSnapshotDto) {
  h.startImpl = async (token) => {
    useGameStore.getState().setConnectionStatus('connected');
    useGameStore.getState().applyAuthoritativeSnapshot(snapshotFor(token));
  };
}

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const lastHub = () => h.hubs[h.hubs.length - 1];

function renderRoom(path = '/oda/ABC123') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/oda/:roomCode" element={<RoomPage />} />
          <Route path="/" element={<p>ANA SAYFA</p>} />
        </Routes>
        <Link to="/oda/BBBBBB">B odasına git</Link>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const reloadMock = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  h.hubs.length = 0;
  h.startImpl = null;
  h.startMatchImpl = null;
  sessionStorage.clear();
  localStorage.clear();
  useGameStore.getState().reset();
  useGameStore.getState().setMyPlayerId(null);
  useUiStore.setState({ toast: null, rulesModalOpen: false, soundEnabled: true, fastMode: false });
  Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload: reloadMock } });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

// ======================================================================
// A. Oda giriş ekranı (token yok → JoinRoomView)
// ======================================================================
describe('RoomPage — oda giriş ekranı', () => {
  it("oyuncu token'ı yoksa oda bilgisini oda kodu BÜYÜK harfle isteyip katılma ekranını gösterir", async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe')]));
    renderRoom('/oda/abc123');

    expect(await screen.findByLabelText('Oyuncu adın')).toBeInTheDocument();
    expect(h.getPublicRoomInfo).toHaveBeenCalledTimes(1);
    expect(h.getPublicRoomInfo).toHaveBeenCalledWith('ABC123');
    expect(h.hubs).toHaveLength(0); // token yok → hub kurulmaz
    expect(screen.getByRole('heading', { level: 1, name: 'Kız Tavlası Online' })).toBeInTheDocument();
  });

  it('oda bilgisi yüklenirken erişilebilir durum (role=status) gösterilir', async () => {
    const d = deferred<RoomSnapshotDto>();
    h.getPublicRoomInfo.mockReturnValue(d.promise);
    renderRoom();

    expect(screen.getByRole('status')).toHaveTextContent('Oda bilgisi yükleniyor…');
    expect(screen.queryByLabelText('Oyuncu adın')).not.toBeInTheDocument();

    await act(async () => d.resolve(snapshot('ABC123', [player('p1', 'Ayşe')])));
    expect(await screen.findByLabelText('Oyuncu adın')).toBeInTheDocument();
  });

  it('host varsa davet metni host adını ve oda kodunu gösterir', async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe')]));
    renderRoom();

    await screen.findByLabelText('Oyuncu adın');
    expect(screen.getByText('Ayşe')).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText(/odasına davet etti\./)).toBeInTheDocument();
  });

  it('oyuncu listesinde host yoksa "odasına katılıyorsun" metni gösterilir', async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', []));
    renderRoom();

    await screen.findByLabelText('Oyuncu adın');
    expect(screen.getByText(/odasına katılıyorsun\./)).toBeInTheDocument();
  });

  it('boş, tek karakterli veya yalnızca boşluk içeren ad reddedilir (zod mesajı) ve joinRoom çağrılmaz', async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe')]));
    const user = userEvent.setup();
    renderRoom();
    const input = await screen.findByLabelText('Oyuncu adın');

    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Oyuncu adı en az 2 karakter olmalıdır.');

    await user.type(input, 'A');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Oyuncu adı en az 2 karakter olmalıdır.');

    await user.clear(input);
    await user.type(input, '    ');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Oyuncu adı en az 2 karakter olmalıdır.');

    expect(h.joinRoom).not.toHaveBeenCalled();
  });

  it('ad alanı en fazla 30 karakterdir (31+ mesajına arayüzden ulaşılamaz)', async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe')]));
    renderRoom();
    expect(await screen.findByLabelText('Oyuncu adın')).toHaveAttribute('maxlength', '30');
  });

  it('geçerli ad kırpılarak gönderilir; yükleniyor etiketi görünür ve düğme pasifleşir', async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe')]));
    const d = deferred<unknown>();
    h.joinRoom.mockReturnValue(d.promise);
    const user = userEvent.setup();
    renderRoom();

    await user.type(await screen.findByLabelText('Oyuncu adın'), '  Fatma  ');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));

    expect(h.joinRoom).toHaveBeenCalledWith('ABC123', 'Fatma');
    const pending = await screen.findByRole('button', { name: 'Katılıyor…' });
    expect(pending).toBeDisabled();
    // Bekleyen istek askıda kalmasın
    await act(async () => d.reject(new Error('test sonu')));
  });

  it("başarılı katılım: token result.roomCode anahtarıyla saklanır, hub o token'la kurulur ve oyuncu kimliği store'a yazılır", async () => {
    const guestToken = fakeToken('p2');
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe')]));
    h.joinRoom.mockResolvedValue({
      roomCode: 'ABC123',
      playerToken: guestToken,
      player: player('p2', 'Fatma'),
      roomState: snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')]),
    });
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    const user = userEvent.setup();
    renderRoom();

    await user.type(await screen.findByLabelText('Oyuncu adın'), 'Fatma');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));

    expect(await screen.findByRole('heading', { name: 'Lobi' })).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY('ABC123'))).toBe(guestToken);
    expect(h.hubs).toHaveLength(1);
    expect(h.hubs[0].token).toBe(guestToken);
    expect(h.hubs[0].start).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().myPlayerId).toBe('p2');
  });

  it('katılma sonrası bağlantı kurulurken "Odaya bağlanılıyor…" gösterilir (snapshot gelene kadar)', async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe')]));
    h.joinRoom.mockResolvedValue({ roomCode: 'ABC123', playerToken: fakeToken('p2'), player: player('p2', 'Fatma'), roomState: {} });
    h.startImpl = () => new Promise<void>(() => {}); // bağlantı hiç tamamlanmaz
    const user = userEvent.setup();
    renderRoom();

    await user.type(await screen.findByLabelText('Oyuncu adın'), 'Fatma');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Odaya bağlanılıyor…');
  });

  it('katılma hatası: kodsuz ApiError başlığı güvenilmez → bağlam mesajı toast olarak gösterilir ve ekran değişmez', async () => {
    // 3.10B: kodsuz yanıtlardaki sunucu `title` metni artık gösterilmez (eski beklenti: 'Sunucu şu an yanıt vermiyor.').
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe')]));
    h.joinRoom.mockRejectedValue(new ApiError(500, 'Sunucu şu an yanıt vermiyor.', null));
    const user = userEvent.setup();
    renderRoom();

    await user.type(await screen.findByLabelText('Oyuncu adın'), 'Fatma');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));

    await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: 'Odaya katılınamadı.', kind: 'error' }));
    expect(screen.getByLabelText('Oyuncu adın')).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY('ABC123'))).toBeNull();
  });

  it('katılma hatası: bilinen hata kodu varsa kodun Türkçe karşılığı, ApiError olmayan hatada genel mesaj gösterilir', async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe')]));
    const user = userEvent.setup();
    renderRoom();
    await user.type(await screen.findByLabelText('Oyuncu adın'), 'Fatma');

    h.joinRoom.mockRejectedValueOnce(new ApiError(410, 'sunucu metni', 'ROOM_EXPIRED'));
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));
    await waitFor(() =>
      expect(useUiStore.getState().toast?.message).toBe('Bu odanın süresi dolmuş. Yeni bir oda oluşturabilirsin.'),
    );

    h.joinRoom.mockRejectedValueOnce(new Error('ağ koptu'));
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));
    await waitFor(() => expect(useUiStore.getState().toast?.message).toBe('Odaya katılınamadı.'));
  });
});

// ======================================================================
// B. Oda hata durumları
// ======================================================================
describe('RoomPage — oda hata durumları', () => {
  it('oda bulunamadı: Türkçe mesaj gösterilir ve "Ana Sayfaya Dön" ana sayfaya götürür', async () => {
    h.getPublicRoomInfo.mockRejectedValue(new ApiError(404, 'sunucu metni', 'ROOM_NOT_FOUND'));
    const user = userEvent.setup();
    renderRoom('/oda/ZZZZZZ');

    expect(await screen.findByText('Böyle bir oda bulunamadı. Kodu kontrol et.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Oyuncu adın')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ana Sayfaya Dön' }));
    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
  });

  it('oda bilgisi hatası: kodsuz ApiError başlığı gösterilmez (3.10B), ApiError olmayan hata için de genel mesaj gösterilir', async () => {
    // 3.10B: eski beklenti kodsuz 500 başlığını ('Sunucu hatası oluştu.') aynen gösteriyordu.
    h.getPublicRoomInfo.mockRejectedValueOnce(new ApiError(500, 'Sunucu hatası oluştu.', null));
    const first = renderRoom();
    expect(await screen.findByText('Oda bilgisi alınamadı.')).toBeInTheDocument();
    expect(screen.queryByText('Sunucu hatası oluştu.')).not.toBeInTheDocument();
    first.unmount();

    h.getPublicRoomInfo.mockRejectedValueOnce(new Error('ağ'));
    renderRoom();
    expect(await screen.findByText('Oda bilgisi alınamadı.')).toBeInTheDocument();
  });

  it('süresi dolmuş oda ve eşlenmeyen hata kodu: kod eşlemesi varsa Türkçe metin, yoksa sunucu mesajı', async () => {
    h.getPublicRoomInfo.mockRejectedValueOnce(new ApiError(410, 'x', 'ROOM_EXPIRED'));
    const first = renderRoom();
    expect(await screen.findByText('Bu odanın süresi dolmuş. Yeni bir oda oluşturabilirsin.')).toBeInTheDocument();
    first.unmount();

    // 3.10C: istemci eşlemesi olmayan tanınan kodda sunucu başlığı ('Geçersiz istek metni.') artık gösterilmez; bağlam fallback'i.
    h.getPublicRoomInfo.mockRejectedValueOnce(new ApiError(400, 'Geçersiz istek metni.', 'INVALID_COMMAND'));
    renderRoom();
    expect(await screen.findByText('Oda bilgisi alınamadı.')).toBeInTheDocument();
    expect(screen.queryByText('Geçersiz istek metni.')).not.toBeInTheDocument();
  });

  it('iki oyuncu varsa "Masa dolu": adlar, izleme ve ana sayfa seçenekleri gösterilir; ad formu gösterilmez', async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    renderRoom();

    expect(await screen.findByRole('heading', { name: 'Masa dolu' })).toBeInTheDocument();
    expect(screen.getByText('Ayşe ve Fatma')).toBeInTheDocument();
    expect(screen.getByText(/oynuyor\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maçı İzle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ana Sayfaya Dön' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Oyuncu adın')).not.toBeInTheDocument();
  });

  it('ROOM_FULL yanıtı: koltuk dolu görünümüne geçilir, toast gösterilmez ve token saklanmaz', async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe')]));
    h.joinRoom.mockRejectedValue(new ApiError(409, 'dolu', 'ROOM_FULL'));
    const user = userEvent.setup();
    renderRoom();

    await user.type(await screen.findByLabelText('Oyuncu adın'), 'Fatma');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));

    expect(await screen.findByRole('heading', { name: 'Masa dolu' })).toBeInTheDocument();
    expect(screen.getByText('Ayşe')).toBeInTheDocument();
    expect(useUiStore.getState().toast).toBeNull();
    expect(sessionStorage.getItem(KEY('ABC123'))).toBeNull();
  });

  it('ROOM_FULL ve oyuncu adı bilinmiyorsa genel "iki koltuk da dolu" metni gösterilir', async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', []));
    h.joinRoom.mockRejectedValue(new ApiError(409, 'dolu', 'ROOM_FULL'));
    const user = userEvent.setup();
    renderRoom();

    await user.type(await screen.findByLabelText('Oyuncu adın'), 'Fatma');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));

    expect(await screen.findByText('Bu odadaki iki koltuk da dolu. Maçı canlı olarak izleyebilirsin.')).toBeInTheDocument();
  });

  it("izleyici olarak katılma: watchRoom çağrılır, bekleme etiketi görünür, token izleyici anahtarıyla saklanır ve izleyici bağlantısı kurulur", async () => {
    const spectatorToken = 'spectator.jwt.token';
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    const d = deferred<unknown>();
    h.watchRoom.mockReturnValue(d.promise);
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    const user = userEvent.setup();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: 'Maçı İzle' }));
    expect(h.watchRoom).toHaveBeenCalledWith('ABC123');
    expect(screen.getByRole('button', { name: 'Bağlanıyor…' })).toBeDisabled();

    await act(async () => d.resolve({ roomCode: 'ABC123', spectatorToken, roomState: {} }));

    expect(await screen.findByRole('heading', { name: 'Lobi' })).toBeInTheDocument();
    expect(sessionStorage.getItem(SPECTATOR_KEY('ABC123'))).toBe(spectatorToken);
    expect(sessionStorage.getItem(KEY('ABC123'))).toBeNull();
    expect(h.hubs[0].token).toBe(spectatorToken);
    expect(useGameStore.getState().myPlayerId).toBeNull();
    expect(screen.getByRole('button', { name: 'İzlemeyi bırak' })).toBeInTheDocument();
  });

  it('izleme hatası: kodsuz ApiError başlığı güvenilmez (3.10B), ApiError olmayan hatada da "Maç izlenemedi." toast olarak gösterilir', async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    const user = userEvent.setup();
    renderRoom();
    const watch = await screen.findByRole('button', { name: 'Maçı İzle' });

    h.watchRoom.mockRejectedValueOnce(new ApiError(503, 'İzleme şu an kapalı.', null));
    await user.click(watch);
    // 3.10B: eski beklenti kodsuz 503 başlığını ('İzleme şu an kapalı.') aynen gösteriyordu.
    await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: 'Maç izlenemedi.', kind: 'error' }));

    h.watchRoom.mockRejectedValueOnce(new Error('ağ'));
    await user.click(screen.getByRole('button', { name: 'Maçı İzle' }));
    await waitFor(() => expect(useUiStore.getState().toast?.message).toBe('Maç izlenemedi.'));
  });

  it('"Masa dolu" ekranında "Ana Sayfaya Dön" ana sayfaya götürür', async () => {
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    const user = userEvent.setup();
    renderRoom();
    await user.click(await screen.findByRole('button', { name: 'Ana Sayfaya Dön' }));
    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
  });
});

// ======================================================================
// C. Oturum davranışları
// ======================================================================
describe('RoomPage — oturum', () => {
  it("kayıtlı oyuncu token'ı yeniden kullanılır: oda bilgisi istenmez, hub doğrudan o token'la kurulur", async () => {
    const token = fakeToken('p1');
    sessionStorage.setItem(KEY('ABC123'), token);
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe')]));
    renderRoom('/oda/abc123');

    expect(await screen.findByRole('heading', { name: 'Lobi' })).toBeInTheDocument();
    expect(h.getPublicRoomInfo).not.toHaveBeenCalled();
    expect(h.hubs).toHaveLength(1);
    expect(h.hubs[0].token).toBe(token);
    expect(useGameStore.getState().myPlayerId).toBe('p1');
  });

  it("oyuncu token'ı yoksa kayıtlı izleyici token'ı kullanılır ve izleyici olarak bağlanılır", async () => {
    sessionStorage.setItem(SPECTATOR_KEY('ABC123'), 'spectator.jwt.token');
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    renderRoom();

    expect(await screen.findByRole('heading', { name: 'Lobi' })).toBeInTheDocument();
    expect(h.hubs[0].token).toBe('spectator.jwt.token');
    expect(useGameStore.getState().myPlayerId).toBeNull();
    expect(h.getPublicRoomInfo).not.toHaveBeenCalled();
  });

  it("ikisi de kayıtlıysa oyuncu token'ı önceliklidir; izleyici token'ı ayrı anahtarda kalır", async () => {
    const playerToken = fakeToken('p1');
    sessionStorage.setItem(KEY('ABC123'), playerToken);
    sessionStorage.setItem(SPECTATOR_KEY('ABC123'), 'spectator.jwt.token');
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe')]));
    renderRoom();

    await screen.findByRole('heading', { name: 'Lobi' });
    expect(h.hubs[0].token).toBe(playerToken);
    expect(sessionStorage.getItem(SPECTATOR_KEY('ABC123'))).toBe('spectator.jwt.token');
    expect(screen.getByRole('button', { name: 'Odadan çık' })).toBeInTheDocument();
  });

  it("oda kodu değişince önceki oda kapanır (hub durur, store sıfırlanır) ve yeni oda kendi token'ıyla bağlanır", async () => {
    const tokenA = fakeToken('a1');
    const tokenB = fakeToken('b1');
    sessionStorage.setItem(KEY('AAAAAA'), tokenA);
    sessionStorage.setItem(KEY('BBBBBB'), tokenB);
    connectWith((token) =>
      token === tokenA
        ? snapshot('AAAAAA', [player('a1', 'Ayşe', { isHost: true })])
        : snapshot('BBBBBB', [player('b1', 'Bora', { isHost: true })]),
    );
    const user = userEvent.setup();
    renderRoom('/oda/AAAAAA');

    expect(await screen.findByText('Ayşe')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'B odasına git' }));

    expect(await screen.findByText('Bora')).toBeInTheDocument();
    expect(screen.queryByText('Ayşe')).not.toBeInTheDocument();
    expect(h.hubs).toHaveLength(2);
    expect(h.hubs[0].stop).toHaveBeenCalledTimes(1);
    expect(h.hubs[1].token).toBe(tokenB);
    expect(useGameStore.getState().snapshot?.roomCode).toBe('BBBBBB');
    expect(useGameStore.getState().myPlayerId).toBe('b1');
  });

  it("INVALID_SESSION: oyuncu token'ı silinir ve katılma ekranına dönülür", async () => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    h.startMatchImpl = () => Promise.reject(new Error('Hata: INVALID_SESSION'));
    const user = userEvent.setup();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: 'Oyunu Başlat' }));

    // Oda dolu olduğundan katılma ekranı yerine "Masa dolu" görünümü açılır (oda bilgisi yeniden istenir).
    expect(await screen.findByRole('heading', { name: 'Masa dolu' })).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY('ABC123'))).toBeNull();
    expect(h.getPublicRoomInfo).toHaveBeenCalledWith('ABC123');
    expect(h.hubs[0].stop).toHaveBeenCalled();
  });

  it("PLAYER_NOT_IN_ROOM da oturumu temizleyip katılma ekranına döndürür (oda tek oyunculuysa ad formu görünür)", async () => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    h.getPublicRoomInfo.mockResolvedValue(snapshot('ABC123', [player('p2', 'Fatma', { isHost: true })]));
    h.startMatchImpl = () => Promise.reject(new Error('PLAYER_NOT_IN_ROOM'));
    const user = userEvent.setup();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: 'Oyunu Başlat' }));

    expect(await screen.findByLabelText('Oyuncu adın')).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY('ABC123'))).toBeNull();
  });

  it('komut hataları: sıra hatası, eski durum (STALE_STATE) ve genel hub hatası farklı toast\'lar üretir', async () => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    const user = userEvent.setup();
    renderRoom();
    const start = await screen.findByRole('button', { name: 'Oyunu Başlat' });

    h.startMatchImpl = () => Promise.reject(new Error('NOT_YOUR_TURN'));
    await user.click(start);
    await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: 'Sıra sende değil.', kind: 'error' }));

    h.startMatchImpl = () => Promise.reject(new Error('STALE_STATE'));
    await user.click(start);
    await waitFor(() =>
      expect(useUiStore.getState().toast).toEqual({
        message: 'Oyun durumu senkronize edildi, hamleni tekrar yapabilirsin.',
        kind: 'info',
      }),
    );
    expect(lastHub().refreshState).toHaveBeenCalledTimes(1);

    // 3.10B: HubException gövdesindeki serbest sunucu metni artık gösterilmez (eski beklenti: 'Bu işlem şu an yapılamaz.');
    // yalnızca tanımlı domain kodu + istemci metni gösterilir (karşılık testler: RoomPage.errors.test.tsx).
    h.startMatchImpl = () => Promise.reject(new Error('An unexpected error occurred: HubException: Bu işlem şu an yapılamaz.'));
    await user.click(start);
    await waitFor(() =>
      expect(useUiStore.getState().toast).toEqual({ message: 'İşlem gerçekleştirilemedi. Lütfen tekrar deneyin.', kind: 'error' }),
    );
  });
});

// ======================================================================
// D. Bağlantı durumları
// ======================================================================
describe('RoomPage — bağlantı', () => {
  beforeEach(() => {
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p1'));
  });

  it('snapshot gelene kadar "Odaya bağlanılıyor…" gösterilir; hub bir kez kurulur ve başlatılır', async () => {
    h.startImpl = () => new Promise<void>(() => {});
    renderRoom();

    expect(await screen.findByRole('status')).toHaveTextContent('Odaya bağlanılıyor…');
    expect(h.hubs).toHaveLength(1);
    expect(h.hubs[0].start).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: 'Lobi' })).not.toBeInTheDocument();
  });

  it('bağlantı başarısız olursa hata ekranı gösterilir (mesaj ve iki eylem)', async () => {
    h.startImpl = () => Promise.reject(new Error('negotiation failed'));
    renderRoom();

    expect(await screen.findByText('Sunucuya bağlanılamadı.')).toBeInTheDocument();
    expect(screen.getByText('Oturumun geçersiz olabilir veya oda kapanmış olabilir.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tekrar Dene' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ana Sayfa' })).toBeInTheDocument();
  });

  it('"Tekrar Dene" sayfayı yeniler ve token\'ı silmez', async () => {
    h.startImpl = () => Promise.reject(new Error('negotiation failed'));
    const user = userEvent.setup();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: 'Tekrar Dene' }));
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(KEY('ABC123'))).not.toBeNull();
  });

  it('"Ana Sayfa" oyuncu token\'ını siler ve ana sayfaya yönlendirir', async () => {
    h.startImpl = () => Promise.reject(new Error('negotiation failed'));
    const user = userEvent.setup();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: 'Ana Sayfa' }));
    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY('ABC123'))).toBeNull();
  });

  it('yeniden bağlanma uyarısı yalnızca "reconnecting" durumunda görünür (rozet metni ve role=alert)', async () => {
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe')]));
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Tek oyunculu lobide role=status yalnızca bağlantı rozetidir (oyuncu satırındaki nokta status değildir).
    expect(screen.getByRole('status')).toHaveTextContent('Bağlı');

    act(() => useGameStore.getState().setConnectionStatus('reconnecting'));
    expect(screen.getByRole('alert')).toHaveTextContent('Bağlantı kesildi. Oyun durumu korunuyor, yeniden bağlanılıyor…');
    expect(screen.getByRole('status')).toHaveTextContent('Yeniden bağlanıyor…');

    act(() => useGameStore.getState().setConnectionStatus('connected'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('başlık: oda kodu ve bağlantı rozeti lobide görünür; oyun sürerken bağlıyken gizlenir, bağlantı sorununda geri gelir', async () => {
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')], 'Playing'));
    renderRoom();
    expect(await screen.findByTestId('game-view')).toBeInTheDocument();

    expect(screen.queryByText('Bağlı')).not.toBeInTheDocument();
    expect(screen.queryByText('ABC123')).not.toBeInTheDocument();

    act(() => useGameStore.getState().setConnectionStatus('reconnecting'));
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText('Yeniden bağlanıyor…')).toBeInTheDocument();
  });

  it('sekme yeniden görünür olunca durum yenilenir (RejoinRoom); unmount sonrası dinleyici kaldırılmıştır', async () => {
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe')]));
    const { unmount } = renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });
    const hub = lastHub();
    const visibility = vi.spyOn(document, 'visibilityState', 'get');

    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(hub.refreshState).not.toHaveBeenCalled();

    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(hub.refreshState).toHaveBeenCalledTimes(1);

    unmount();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(hub.refreshState).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it('unmount: hub durdurulur ve oda durumu sıfırlanır', async () => {
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe')]));
    const { unmount } = renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });
    expect(useGameStore.getState().snapshot).not.toBeNull();

    unmount();
    expect(lastHub().stop).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().snapshot).toBeNull();
    expect(useGameStore.getState().connectionStatus).toBe('idle');
  });
});

// ======================================================================
// E. Bağlı oda: lobi/oyun yönlendirmesi, başlık eylemleri, çıkış, bot
// ======================================================================
describe('RoomPage — bağlı oda', () => {
  const hostToken = fakeToken('p1');
  beforeEach(() => {
    sessionStorage.setItem(KEY('ABC123'), hostToken);
  });

  it.each<[RoomStatus, 'lobi' | 'oyun']>([
    ['Waiting', 'lobi'],
    ['InLobby', 'lobi'],
    ['Playing', 'oyun'],
    ['Completed', 'oyun'],
  ])('oda durumu %s → %s ekranı', async (status, expected) => {
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')], status));
    renderRoom();

    if (expected === 'lobi') {
      expect(await screen.findByRole('heading', { name: 'Lobi' })).toBeInTheDocument();
      expect(screen.queryByTestId('game-view')).not.toBeInTheDocument();
    } else {
      expect(await screen.findByTestId('game-view')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Lobi' })).not.toBeInTheDocument();
    }
  });

  it('snapshot güncellenip maç başlayınca lobi oyun ekranına geçer', async () => {
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')], 'InLobby'));
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });

    act(() =>
      useGameStore
        .getState()
        .applySnapshot(snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')], 'Playing', { stateVersion: 2 })),
    );
    expect(await screen.findByTestId('game-view')).toBeInTheDocument();
  });

  it('host iki oyuncu varken "Oyunu Başlat"ı görür ve tıklayınca hub.startMatch çağrılır; misafir yalnızca bekleme metnini görür', async () => {
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')], 'InLobby'));
    const user = userEvent.setup();
    const host = renderRoom();

    await user.click(await screen.findByRole('button', { name: 'Oyunu Başlat' }));
    expect(lastHub().startMatch).toHaveBeenCalledTimes(1);
    host.unmount();

    sessionStorage.clear();
    sessionStorage.setItem(KEY('ABC123'), fakeToken('p2'));
    useGameStore.getState().reset();
    renderRoom();
    expect(await screen.findByText('Oda sahibinin oyunu başlatması bekleniyor…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oyunu Başlat' })).not.toBeInTheDocument();
  });

  it('paylaşım kartı yalnızca botsuz oyuncu lobisinde görünür (izleyici, bot odası ve oyun sırasında yok)', async () => {
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe')], 'Waiting'));
    const a = renderRoom();
    expect(await screen.findByRole('button', { name: 'Linki Kopyala' })).toBeInTheDocument();
    a.unmount();

    useGameStore.getState().reset();
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('bot', 'Usta Bot', { isBot: true, isHost: false })], 'Waiting'));
    const b = renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });
    expect(screen.queryByRole('button', { name: 'Linki Kopyala' })).not.toBeInTheDocument();
    b.unmount();

    useGameStore.getState().reset();
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')], 'Playing'));
    const c = renderRoom();
    await screen.findByTestId('game-view');
    expect(screen.queryByRole('button', { name: 'Linki Kopyala' })).not.toBeInTheDocument();
    c.unmount();

    sessionStorage.clear();
    sessionStorage.setItem(SPECTATOR_KEY('ABC123'), 'spectator.jwt.token');
    useGameStore.getState().reset();
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe')], 'Waiting'));
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });
    expect(screen.queryByRole('button', { name: 'Linki Kopyala' })).not.toBeInTheDocument();
  });

  it('izleyici sayısı rozeti yalnızca sayı > 0 iken görünür', async () => {
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe')]));
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });
    expect(screen.queryByLabelText(/izleyici$/)).not.toBeInTheDocument();

    act(() => useGameStore.getState().setSpectatorCount(2));
    expect(screen.getByLabelText('2 izleyici')).toBeInTheDocument();
  });

  it('başlık eylemleri: ses ve hızlı mod anahtarları adlarını/aria-pressed değerini günceller, kurallar penceresi açılır', async () => {
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe')]));
    const user = userEvent.setup();
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });

    await user.click(screen.getByRole('button', { name: 'Sesi kapat' }));
    expect(useUiStore.getState().soundEnabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Sesi aç' })).toBeInTheDocument();

    const fast = screen.getByRole('button', { name: 'Hızlı animasyon modunu aç' });
    expect(fast).toHaveAttribute('aria-pressed', 'false');
    await user.click(fast);
    expect(useUiStore.getState().fastMode).toBe(true);
    expect(screen.getByRole('button', { name: 'Normal animasyon hızına geç' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Kuralları göster' }));
    expect(useUiStore.getState().rulesModalOpen).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'Kız Tavlası Kuralları' })).toBeInTheDocument();
  });

  it('"Odadan çık": leaveRoom çağrılır, token silinir ve ana sayfaya gidilir; leaveRoom hata verse de çıkılır', async () => {
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe')]));
    h.leaveRoom.mockRejectedValue(new Error('oda zaten kapanmış'));
    const user = userEvent.setup();
    renderRoom();
    await screen.findByRole('heading', { name: 'Lobi' });

    await user.click(screen.getByRole('button', { name: 'Odadan çık' }));

    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
    expect(h.leaveRoom).toHaveBeenCalledWith('ABC123', hostToken);
    expect(sessionStorage.getItem(KEY('ABC123'))).toBeNull();
  });

  it('oyun ekranındaki çıkış (onLeave) de aynı çıkış akışını kullanır', async () => {
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')], 'Playing'));
    h.leaveRoom.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: 'GV çık' }));
    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
    expect(h.leaveRoom).toHaveBeenCalledWith('ABC123', hostToken);
  });

  it("izleyici çıkışı: API çağrılmaz, yalnızca izleyici token'ı silinir ve ana sayfaya gidilir; oyun ekranına spectator iletilir", async () => {
    sessionStorage.clear();
    sessionStorage.setItem(SPECTATOR_KEY('ABC123'), 'spectator.jwt.token');
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe'), player('p2', 'Fatma')], 'Playing'));
    const user = userEvent.setup();
    renderRoom();

    const game = await screen.findByTestId('game-view');
    expect(game).toHaveAttribute('data-spectator', 'true');
    await user.click(within(game).getByRole('button', { name: 'GV çık' }));

    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
    expect(h.leaveRoom).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SPECTATOR_KEY('ABC123'))).toBeNull();
  });

  it('bekleme lobisinde bota geçiş: önce bot odası açılır, sonra eski oda terk edilir, yeni token saklanıp yeni odaya gidilir', async () => {
    // Eski token'dan FARKLI olmalı (sahte hub snapshot'ı token'a göre seçer).
    const botToken = `h.${btoa(JSON.stringify({ playerId: 'p1', room: 'BOT789' }))}.s`;
    connectWith((token) =>
      token === hostToken
        ? snapshot('ABC123', [player('p1', 'Ayşe')], 'Waiting', { bestOf: 5, turnTimeLimitSeconds: null })
        : snapshot('BOT789', [player('p1', 'Ayşe'), player('bot', 'Usta Bot', { isBot: true, isHost: false })], 'Waiting'),
    );
    const order: string[] = [];
    h.createBotRoom.mockImplementation(async () => {
      order.push('create');
      return { roomCode: 'BOT789', playerToken: botToken, sharePath: '/oda/BOT789', player: player('p1', 'Ayşe'), roomState: {} };
    });
    h.leaveRoom.mockImplementation(async () => {
      order.push('leave');
    });
    const user = userEvent.setup();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: 'Usta' }));

    expect(await screen.findByRole('button', { name: 'Bota Karşı Başlat' })).toBeInTheDocument();
    expect(h.createBotRoom).toHaveBeenCalledWith('Ayşe', 5, 'Master', null);
    expect(order).toEqual(['create', 'leave']);
    expect(h.leaveRoom).toHaveBeenCalledWith('ABC123', hostToken);
    expect(sessionStorage.getItem(KEY('ABC123'))).toBeNull();
    expect(sessionStorage.getItem(KEY('BOT789'))).toBe(botToken);
  });

  it('bot odası açılamazsa toast gösterilir, eski oda terk edilmez ve token korunur', async () => {
    connectWith(() => snapshot('ABC123', [player('p1', 'Ayşe')], 'Waiting'));
    const user = userEvent.setup();
    renderRoom();
    const kolay = await screen.findByRole('button', { name: 'Kolay' });

    h.createBotRoom.mockRejectedValueOnce(new ApiError(429, 'Çok fazla istek.', null));
    await user.click(kolay);
    // 3.10B: kodsuz 429 için sunucu başlığı ('Çok fazla istek.') yerine sabit, güvenli istemci mesajı gösterilir.
    await waitFor(() =>
      expect(useUiStore.getState().toast).toEqual({ message: 'Çok fazla istek gönderildi. Lütfen biraz bekleyin.', kind: 'error' }),
    );

    h.createBotRoom.mockRejectedValueOnce(new Error('ağ'));
    await user.click(kolay);
    await waitFor(() => expect(useUiStore.getState().toast?.message).toBe('Bot masası açılamadı.'));

    expect(h.leaveRoom).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(KEY('ABC123'))).toBe(hostToken);
  });
});
