/**
 * RoomPage OTURUM KURTARMA testleri (Aşama 3.9B). Davranış referansı `RoomPage.test.tsx` / `RoomPage.entry.test.tsx`'tir.
 *
 * Sözleşme: `hub.start()` hatası geçici ağ hatası mı geçersiz oturum mu İSTEMCİDE AYIRT EDİLEMEZ (tipsiz Error);
 * bu yüzden token ASLA otomatik silinmez. Kullanıcı açıkça "Bu Odadaki Oturumu Sıfırla" derse yalnızca O ODANIN,
 * O OTURUM TÜRÜNÜN (oyuncu | izleyici) token'ı silinir ve katılma/izleme akışına dönülür.
 *
 * Mock varsayımları (gerçek SignalR doğrulaması DEĞİLDİR): ../api/rooms sahte; GameHubClient sahte bir sınıf —
 * `start()` testin `startImpl`'iyle başarı/başarısızlık taklit eder ve her kurulan hub'ın token'ı `h.hubs`'a yazılır.
 * GameView taslak; RoomPage, JoinRoomView, LobbyView, StateScreen, Button gerçektir.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoomPage from './RoomPage';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import type { PlayerDto, RoomSnapshotDto } from '../types/game';

const h = vi.hoisted(() => ({
  hubs: [] as Array<{ token: string }>,
  startImpl: null as null | ((token: string) => Promise<void>),
  getPublicRoomInfo: vi.fn(),
  joinRoom: vi.fn(),
  watchRoom: vi.fn(),
  leaveRoom: vi.fn(),
}));

vi.mock('../api/rooms', () => ({
  getPublicRoomInfo: h.getPublicRoomInfo,
  joinRoom: h.joinRoom,
  watchRoom: h.watchRoom,
  leaveRoom: h.leaveRoom,
  createBotRoom: vi.fn(),
  getMatchStats: vi.fn(),
}));

vi.mock('../realtime/gameHubClient', () => ({
  GameHubClient: class {
    token: string;
    constructor(token: string) {
      this.token = token;
      h.hubs.push(this);
    }
    start = vi.fn(() => (h.startImpl ? h.startImpl(this.token) : Promise.resolve()));
    stop = vi.fn(() => Promise.resolve());
    refreshState = vi.fn(() => Promise.resolve());
    startMatch = vi.fn(() => Promise.resolve());
  },
}));

vi.mock('./GameView', () => ({ default: () => <div data-testid="game-view" /> }));

const PLAYER_KEY = (code: string) => `kiztavlasi:token:${code}`;
const SPECTATOR_KEY = (code: string) => `kiztavlasi:spectator:${code}`;
const fakeToken = (playerId: string) => `h.${btoa(JSON.stringify({ playerId }))}.s`;

const player = (id: string, name: string): PlayerDto => ({ id, displayName: name, seat: id === 'p1' ? 1 : 2, isConnected: true, isHost: id === 'p1' });
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

function renderRoom(path = '/oda/ABC123') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
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
const RESET = 'Bu Odadaki Oturumu Sıfırla';
const RESET_SPECTATOR = 'Bu Odadaki İzleme Oturumunu Sıfırla';
const failing = (message = 'negotiation failed') => () => Promise.reject(new Error(message));

beforeEach(() => {
  vi.clearAllMocks();
  h.hubs.length = 0;
  h.startImpl = null;
  sessionStorage.clear();
  localStorage.clear();
  useGameStore.getState().reset();
  useUiStore.setState({ toast: null, rulesModalOpen: false });
  Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload: reloadMock } });
});

describe('oturum kurtarma — token korunumu', () => {
  it('geçerli token ile bağlantı başarılır: lobi açılır, token yerinde kalır ve hub o token ile kurulur', async () => {
    const token = fakeToken('p1');
    sessionStorage.setItem(PLAYER_KEY('ABC123'), token);
    h.startImpl = async () => {
      useGameStore.getState().setConnectionStatus('connected');
      useGameStore.getState().applyAuthoritativeSnapshot(snapshot([player('p1', 'Ayşe')]));
    };
    renderRoom();
    expect(await screen.findByRole('heading', { name: 'Lobi' })).toBeInTheDocument();
    expect(sessionStorage.getItem(PLAYER_KEY('ABC123'))).toBe(token);
    expect(h.hubs.map((x) => x.token)).toEqual([token]);
    expect(screen.queryByRole('button', { name: RESET })).not.toBeInTheDocument();
  });

  it('geçici ağ hatasında token silinmez; hata ekranı Tekrar Dene, Ana Sayfa ve oturum sıfırlama eylemlerini sunar', async () => {
    sessionStorage.setItem(PLAYER_KEY('ABC123'), fakeToken('p1'));
    h.startImpl = failing('Failed to fetch');
    renderRoom();

    expect(await screen.findByRole('heading', { name: 'Sunucuya bağlanılamadı.' })).toBeInTheDocument();
    expect(sessionStorage.getItem(PLAYER_KEY('ABC123'))).not.toBeNull();
    for (const name of ['Tekrar Dene', 'Ana Sayfa', RESET]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('hata mesajı "INVALID_SESSION" içerse bile token OTOMATİK silinmez (hata türü istemcide kesin değil)', async () => {
    sessionStorage.setItem(PLAYER_KEY('ABC123'), fakeToken('p1'));
    h.startImpl = failing('An unexpected error occurred invoking JoinRoom: HubException: INVALID_SESSION');
    renderRoom();
    await screen.findByRole('heading', { name: 'Sunucuya bağlanılamadı.' });
    expect(sessionStorage.getItem(PLAYER_KEY('ABC123'))).not.toBeNull();
    expect(screen.queryByLabelText('Oyuncu adın')).not.toBeInTheDocument();
  });

  it('"Tekrar Dene" sayfayı yeniler ve mevcut oturumu korur', async () => {
    const token = fakeToken('p1');
    sessionStorage.setItem(PLAYER_KEY('ABC123'), token);
    h.startImpl = failing();
    const user = userEvent.setup();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: 'Tekrar Dene' }));
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(PLAYER_KEY('ABC123'))).toBe(token);
  });

  it('kurtarma eylemi neden seçilebileceğini ve sonucunu açıklar (koltuk otomatik geri alınmaz)', async () => {
    sessionStorage.setItem(PLAYER_KEY('ABC123'), fakeToken('p1'));
    h.startImpl = failing();
    renderRoom();
    await screen.findByRole('heading', { name: 'Sunucuya bağlanılamadı.' });
    expect(screen.getByText(/Tekrar Dene sorunu çözmezse/)).toBeInTheDocument();
    expect(screen.getByText(/oda doluysa yalnızca izleyebilirsin/i)).toBeInTheDocument();
  });
});

describe('oturum sıfırlama — kapsam', () => {
  it('yalnızca BU odanın oyuncu token\'ı silinir; başka odanın tokenları, izleyici anahtarı ve ilgisiz anahtarlar korunur (sessionStorage.clear kullanılmaz)', async () => {
    sessionStorage.setItem(PLAYER_KEY('ABC123'), fakeToken('p1'));
    sessionStorage.setItem(PLAYER_KEY('BBBBBB'), 'baska-oda-oyuncu');
    sessionStorage.setItem(SPECTATOR_KEY('CCCCCC'), 'baska-oda-izleyici');
    sessionStorage.setItem('ilgisiz-anahtar', 'x');
    h.startImpl = failing();
    h.getPublicRoomInfo.mockResolvedValue(snapshot([player('p1', 'Ayşe')]));
    const user = userEvent.setup();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: RESET }));
    expect(sessionStorage.getItem(PLAYER_KEY('ABC123'))).toBeNull();
    expect(sessionStorage.getItem(PLAYER_KEY('BBBBBB'))).toBe('baska-oda-oyuncu');
    expect(sessionStorage.getItem(SPECTATOR_KEY('CCCCCC'))).toBe('baska-oda-izleyici');
    expect(sessionStorage.getItem('ilgisiz-anahtar')).toBe('x');
  });

  it('sıfırlamadan sonra katılma ekranına dönülür ve eski token ile yeni hub kurulmaz', async () => {
    sessionStorage.setItem(PLAYER_KEY('ABC123'), fakeToken('p1'));
    h.startImpl = failing();
    h.getPublicRoomInfo.mockResolvedValue(snapshot([player('p1', 'Ayşe')]));
    const user = userEvent.setup();
    renderRoom();
    await user.click(await screen.findByRole('button', { name: RESET }));

    expect(await screen.findByLabelText('Oyuncu adın')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(h.hubs).toHaveLength(1); // yalnızca ilk (başarısız) bağlantı
    expect(h.getPublicRoomInfo).toHaveBeenCalledWith('ABC123');
  });

  it('kurtarma sonrası yeniden katılınca YENİ token saklanır ve hub o token ile kurulur', async () => {
    sessionStorage.setItem(PLAYER_KEY('ABC123'), fakeToken('old'));
    const fresh = fakeToken('p2');
    h.startImpl = async (token) => {
      if (token === fresh) {
        useGameStore.getState().setConnectionStatus('connected');
        useGameStore.getState().applyAuthoritativeSnapshot(snapshot([player('p1', 'Ayşe'), player('p2', 'Fatma')]));
        return;
      }
      throw new Error('negotiation failed');
    };
    h.getPublicRoomInfo.mockResolvedValue(snapshot([player('p1', 'Ayşe')]));
    h.joinRoom.mockResolvedValue({ roomCode: 'ABC123', playerToken: fresh });
    const user = userEvent.setup();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: RESET }));
    await user.type(await screen.findByLabelText('Oyuncu adın'), 'Fatma');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));

    expect(await screen.findByRole('heading', { name: 'Lobi' })).toBeInTheDocument();
    expect(h.joinRoom).toHaveBeenCalledWith('ABC123', 'Fatma');
    expect(sessionStorage.getItem(PLAYER_KEY('ABC123'))).toBe(fresh);
    expect(h.hubs[h.hubs.length - 1].token).toBe(fresh);
  });

  it('tekrarlanan kurtarma güvenlidir: çift tıklama ve sayfanın yeniden açılması hata üretmez, diğer tokenlar korunur', async () => {
    sessionStorage.setItem(PLAYER_KEY('ABC123'), fakeToken('p1'));
    sessionStorage.setItem(PLAYER_KEY('BBBBBB'), 'baska');
    h.startImpl = failing();
    h.getPublicRoomInfo.mockResolvedValue(snapshot([player('p1', 'Ayşe')]));
    const user = userEvent.setup();
    const first = renderRoom();

    await user.dblClick(await screen.findByRole('button', { name: RESET }));
    expect(await screen.findByLabelText('Oyuncu adın')).toBeInTheDocument();
    first.unmount();

    renderRoom(); // yeniden aç: token yok → katılma ekranı; çökme yok
    expect(await screen.findByLabelText('Oyuncu adın')).toBeInTheDocument();
    expect(sessionStorage.getItem(PLAYER_KEY('ABC123'))).toBeNull();
    expect(sessionStorage.getItem(PLAYER_KEY('BBBBBB'))).toBe('baska');
  });

  it('klavye: sıfırlama eylemi Tab ile üçüncü sırada odaklanır ve Enter ile çalışır', async () => {
    sessionStorage.setItem(PLAYER_KEY('ABC123'), fakeToken('p1'));
    h.startImpl = failing();
    h.getPublicRoomInfo.mockResolvedValue(snapshot([player('p1', 'Ayşe')]));
    const user = userEvent.setup();
    renderRoom();
    await screen.findByRole('heading', { name: 'Sunucuya bağlanılamadı.' });

    await user.tab();
    expect(screen.getByRole('button', { name: 'Tekrar Dene' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Ana Sayfa' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: RESET })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByLabelText('Oyuncu adın')).toBeInTheDocument();
  });
});

describe('dolu oda güvenliği', () => {
  it('oda doluysa sıfırlama koltuğu GERİ VERMEZ: "Masa dolu" + "Maçı İzle" gösterilir, joinRoom çağrılmaz', async () => {
    sessionStorage.setItem(PLAYER_KEY('ABC123'), fakeToken('p2'));
    h.startImpl = failing();
    h.getPublicRoomInfo.mockResolvedValue(snapshot([player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    const user = userEvent.setup();
    renderRoom();
    await user.click(await screen.findByRole('button', { name: RESET }));

    expect(await screen.findByRole('heading', { name: 'Masa dolu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maçı İzle' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Oyuncu adın')).not.toBeInTheDocument();
    expect(h.joinRoom).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PLAYER_KEY('ABC123'))).toBeNull();
  });

  it('dolu odada izleme seçilirse token izleyici anahtarına yazılır (oyuncu anahtarı oluşmaz) ve hub izleyici token\'ı ile kurulur', async () => {
    sessionStorage.setItem(PLAYER_KEY('ABC123'), fakeToken('p2'));
    h.startImpl = async (token) => {
      if (token === 'spec-token') {
        useGameStore.getState().setConnectionStatus('connected');
        useGameStore.getState().applyAuthoritativeSnapshot(snapshot([player('p1', 'Ayşe'), player('p2', 'Fatma')]));
        return;
      }
      throw new Error('negotiation failed');
    };
    h.getPublicRoomInfo.mockResolvedValue(snapshot([player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    h.watchRoom.mockResolvedValue({ roomCode: 'ABC123', spectatorToken: 'spec-token' });
    const user = userEvent.setup();
    renderRoom();
    await user.click(await screen.findByRole('button', { name: RESET }));
    await user.click(await screen.findByRole('button', { name: 'Maçı İzle' }));

    expect(await screen.findByRole('heading', { name: 'Lobi' })).toBeInTheDocument();
    expect(sessionStorage.getItem(SPECTATOR_KEY('ABC123'))).toBe('spec-token');
    expect(sessionStorage.getItem(PLAYER_KEY('ABC123'))).toBeNull();
    expect(h.hubs[h.hubs.length - 1].token).toBe('spec-token');
  });
});

describe('izleyici oturumu ve token ayrımı', () => {
  it('izleyici bağlantısı başarısızsa eylem "İzleme Oturumunu Sıfırla" adını taşır; yalnızca izleyici anahtarı silinir', async () => {
    sessionStorage.setItem(SPECTATOR_KEY('ABC123'), 'spec-token');
    sessionStorage.setItem(PLAYER_KEY('BBBBBB'), 'baska-oda-oyuncu');
    sessionStorage.setItem(SPECTATOR_KEY('BBBBBB'), 'baska-oda-izleyici');
    h.startImpl = failing();
    h.getPublicRoomInfo.mockResolvedValue(snapshot([player('p1', 'Ayşe'), player('p2', 'Fatma')]));
    const user = userEvent.setup();
    renderRoom();

    await screen.findByRole('heading', { name: 'Sunucuya bağlanılamadı.' });
    expect(screen.queryByRole('button', { name: RESET })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: RESET_SPECTATOR }));
    expect(sessionStorage.getItem(SPECTATOR_KEY('ABC123'))).toBeNull();
    expect(sessionStorage.getItem(PLAYER_KEY('BBBBBB'))).toBe('baska-oda-oyuncu');
    expect(sessionStorage.getItem(SPECTATOR_KEY('BBBBBB'))).toBe('baska-oda-izleyici');
    expect(await screen.findByRole('heading', { name: 'Masa dolu' })).toBeInTheDocument();
  });

  it('izleyici sıfırlama açıklaması oyuncu koltuğu uyarısını içermez', async () => {
    sessionStorage.setItem(SPECTATOR_KEY('ABC123'), 'spec-token');
    h.startImpl = failing();
    renderRoom();
    await screen.findByRole('heading', { name: 'Sunucuya bağlanılamadı.' });
    expect(screen.queryByText(/koltuğ/)).not.toBeInTheDocument();
  });

  it('oyuncu ve izleyici token\'ı birlikte kayıtlıysa oyuncu token\'ı kullanılır; sıfırlama izleyici anahtarına DOKUNMAZ', async () => {
    const playerTok = fakeToken('p1');
    sessionStorage.setItem(PLAYER_KEY('ABC123'), playerTok);
    sessionStorage.setItem(SPECTATOR_KEY('ABC123'), 'spec-token');
    h.startImpl = failing();
    h.getPublicRoomInfo.mockResolvedValue(snapshot([player('p1', 'Ayşe')]));
    const user = userEvent.setup();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: RESET }));
    expect(h.hubs.map((x) => x.token)).toEqual([playerTok]); // izleyici token'ı ile bağlanılmadı
    expect(sessionStorage.getItem(PLAYER_KEY('ABC123'))).toBeNull();
    expect(sessionStorage.getItem(SPECTATOR_KEY('ABC123'))).toBe('spec-token');
    expect(await screen.findByLabelText('Oyuncu adın')).toBeInTheDocument();
    expect(h.hubs).toHaveLength(1);
  });
});

describe('mevcut eylemlerin anlamı korunur', () => {
  it('"Ana Sayfa" oyuncu token\'ını siler ve ana sayfaya gider (davranış değişmedi)', async () => {
    sessionStorage.setItem(PLAYER_KEY('ABC123'), fakeToken('p1'));
    h.startImpl = failing();
    const user = userEvent.setup();
    renderRoom();
    await user.click(await screen.findByRole('button', { name: 'Ana Sayfa' }));
    expect(await screen.findByText('ANA SAYFA')).toBeInTheDocument();
    expect(sessionStorage.getItem(PLAYER_KEY('ABC123'))).toBeNull();
  });
});
