/**
 * LobbyView KARAKTERİZASYON testleri (Aşama 3.8A): görsel dönüşümden önce MEVCUT davranışı belgeler.
 *
 * Mock yok: LobbyView, ConnectionDot ve gerçek `useGameStore` kullanılır (LobbyView `myPlayerId`'yi store'dan okur).
 * Snapshot'lar `RoomSnapshotDto`/`PlayerDto` tiplerine ve gerçek sunucu sözleşmesine uygundur: host koltuk 1 (isHost),
 * en fazla iki oyuncu, bot misafir koltuğunda (`isBot`), durum yalnızca 'Waiting' | 'InLobby'.
 * Bilinen sorunlar (ör. bağlantı kopukken "Oyunu Başlat"ın etkin kalması, host değişiminin bildirilmemesi) kabul
 * kriteri yapılmaz; bu dosya onları iddia etmez.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LobbyView from './LobbyView';
import { useGameStore } from '../store/gameStore';
import type { PlayerDto, RoomSnapshotDto, RoomStatus } from '../types/game';

const host = (extra: Partial<PlayerDto> = {}): PlayerDto => ({ id: 'p1', displayName: 'Ayşe', seat: 1, isConnected: true, isHost: true, ...extra });
const guest = (extra: Partial<PlayerDto> = {}): PlayerDto => ({ id: 'p2', displayName: 'Fatma', seat: 2, isConnected: true, isHost: false, ...extra });
const bot = (extra: Partial<PlayerDto> = {}): PlayerDto => ({ id: 'bot', displayName: 'Usta Bot', seat: 2, isConnected: true, isHost: false, isBot: true, ...extra });

function room(players: PlayerDto[], extra: Partial<RoomSnapshotDto> = {}, status: RoomStatus = 'Waiting'): RoomSnapshotDto {
  return {
    roomCode: 'ABC123',
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

function renderLobby(
  snapshot: RoomSnapshotDto,
  { me = null, spectator, onPlayBot, onStartMatch = vi.fn() }: { me?: string | null; spectator?: boolean; onPlayBot?: (d: 'Easy' | 'Master') => void; onStartMatch?: () => void } = {},
) {
  useGameStore.getState().setMyPlayerId(me);
  const utils = render(<LobbyView snapshot={snapshot} spectator={spectator} onPlayBot={onPlayBot} onStartMatch={onStartMatch} />);
  return { ...utils, onStartMatch };
}

const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

beforeEach(() => {
  useGameStore.getState().reset();
  useGameStore.getState().setMyPlayerId(null);
});

describe('LobbyView — oyuncu durumları', () => {
  it('tek oyunculu lobi: sayı, oyuncu satırı ve boş koltuk (rakip bekleniyor) mesajı gösterilir', () => {
    renderLobby(room([host()]), { me: 'p1' });

    expect(screen.getByRole('heading', { level: 1, name: 'Lobi' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Lobi' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2 Oyuncu')).toBeInTheDocument();
    expect(screen.getByText('Ayşe')).toBeInTheDocument();
    expect(screen.getByText('Rakip bekleniyor… Aşağıdaki davet bağlantısını paylaş.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2); // oyuncu + boş koltuk
  });

  it('iki oyunculu lobi: sayı 2 / 2 olur ve boş koltuk mesajı kaybolur', () => {
    renderLobby(room([host(), guest()]), { me: 'p1' });

    expect(screen.getByText('2 / 2 Oyuncu')).toBeInTheDocument();
    expect(screen.queryByText(/Rakip bekleniyor/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('"(sen)" yalnızca kendi satırında görünür; oyuncu kimliği bilinmiyorsa hiçbir satırda görünmez', () => {
    const { unmount } = renderLobby(room([host(), guest()]), { me: 'p2' });
    expect(within(rowOf('Fatma')).getByText('(sen)')).toBeInTheDocument();
    expect(within(rowOf('Ayşe')).queryByText('(sen)')).not.toBeInTheDocument();
    unmount();

    renderLobby(room([host(), guest()]), { me: null });
    expect(screen.queryByText('(sen)')).not.toBeInTheDocument();
  });

  it('host satırı "Oda sahibi" etiketli simge taşır; misafirde böyle bir etiket yoktur', () => {
    renderLobby(room([host(), guest()]), { me: 'p1' });

    expect(within(rowOf('Ayşe')).getByLabelText('Oda sahibi')).toBeInTheDocument();
    expect(within(rowOf('Fatma')).queryByLabelText('Oda sahibi')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Oda sahibi')).toHaveLength(1);
  });

  it('bot oyuncusu "Yapay zekâ" simgesiyle ve "Hazır" metniyle gösterilir; bağlantı durumu göstergesi yoktur', () => {
    renderLobby(room([host(), bot()]), { me: 'p1' });

    const row = rowOf('Usta Bot');
    expect(within(row).getByLabelText('Yapay zekâ')).toBeInTheDocument();
    expect(within(row).getByText('Hazır')).toBeInTheDocument();
    expect(within(row).queryByText('Bağlı')).not.toBeInTheDocument();
    expect(within(row).queryByText('Çevrimdışı')).not.toBeInTheDocument();
  });

  it('bot satırı bağlantı bayrağından bağımsız olarak "Hazır" gösterir', () => {
    renderLobby(room([host(), bot({ isConnected: false })]), { me: 'p1' });
    expect(within(rowOf('Usta Bot')).getByText('Hazır')).toBeInTheDocument();
    expect(screen.queryByText('Çevrimdışı')).not.toBeInTheDocument();
  });

  it('bağlı ve çevrimdışı oyuncular satır başına ayrı metinle gösterilir', () => {
    renderLobby(room([host({ isConnected: true }), guest({ isConnected: false })]), { me: 'p1' });

    expect(within(rowOf('Ayşe')).getByText('Bağlı')).toBeInTheDocument();
    expect(within(rowOf('Fatma')).getByText('Çevrimdışı')).toBeInTheDocument();
  });

  it('oyuncu geldiğinde (yeni snapshot) sayı, boş koltuk ve host eylemleri güncellenir', () => {
    const onPlayBot = vi.fn();
    useGameStore.getState().setMyPlayerId('p1');
    const { rerender } = render(<LobbyView snapshot={room([host()])} onStartMatch={vi.fn()} onPlayBot={onPlayBot} />);
    expect(screen.getByText('1 / 2 Oyuncu')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Beklerken yapay zekâya karşı oyna' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oyunu Başlat' })).not.toBeInTheDocument();

    rerender(<LobbyView snapshot={room([host(), guest()])} onStartMatch={vi.fn()} onPlayBot={onPlayBot} />);
    expect(screen.getByText('2 / 2 Oyuncu')).toBeInTheDocument();
    expect(screen.queryByText(/Rakip bekleniyor/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Beklerken yapay zekâya karşı oyna' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Oyunu Başlat' })).toBeInTheDocument();
  });
});

describe('LobbyView — host, misafir, izleyici ve bot yetkileri', () => {
  it('host iki oyuncu varken "Oyunu Başlat"ı görür; tıklama ve klavye (Enter) onStartMatch çağırır', async () => {
    const user = userEvent.setup();
    const { onStartMatch } = renderLobby(room([host(), guest()]), { me: 'p1' });

    const start = screen.getByRole('button', { name: 'Oyunu Başlat' });
    await user.click(start);
    expect(onStartMatch).toHaveBeenCalledTimes(1);

    start.focus();
    await user.keyboard('{Enter}');
    expect(onStartMatch).toHaveBeenCalledTimes(2);
  });

  it('misafir başlatma düğmesini görmez; "Oda sahibinin oyunu başlatması bekleniyor…" durumunu görür', () => {
    renderLobby(room([host(), guest()]), { me: 'p2' });

    expect(screen.queryByRole('button', { name: /Başlat/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Oda sahibinin oyunu başlatması bekleniyor…');
  });

  it('ikinci oyuncu gelmeden başlatma düğmesi yoktur (host için bile)', () => {
    renderLobby(room([host()]), { me: 'p1', onPlayBot: vi.fn() });
    expect(screen.queryByRole('button', { name: /Başlat/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('bot odasında host "Bota Karşı Başlat"ı görür (Oyunu Başlat değil) ve bot seçme bölümü görünmez', async () => {
    const user = userEvent.setup();
    const onPlayBot = vi.fn();
    const { onStartMatch } = renderLobby(room([host(), bot()]), { me: 'p1', onPlayBot });

    expect(screen.queryByRole('button', { name: 'Oyunu Başlat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Beklerken yapay zekâya karşı oyna' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bota Karşı Başlat' }));
    expect(onStartMatch).toHaveBeenCalledTimes(1);
    expect(onPlayBot).not.toHaveBeenCalled();
  });

  it('tek oyunculu lobide host bot seçeneklerini görür: Kolay → "Easy", Usta → "Master"', async () => {
    const user = userEvent.setup();
    const onPlayBot = vi.fn();
    renderLobby(room([host()]), { me: 'p1', onPlayBot });

    const section = screen.getByRole('region', { name: 'Beklerken yapay zekâya karşı oyna' });
    expect(section).toHaveTextContent('Beklemek istemiyor musun? Yapay zekâya karşı oyna');
    await user.click(within(section).getByRole('button', { name: 'Kolay' }));
    expect(onPlayBot).toHaveBeenLastCalledWith('Easy');
    await user.click(within(section).getByRole('button', { name: 'Usta' }));
    expect(onPlayBot).toHaveBeenLastCalledWith('Master');
    expect(onPlayBot).toHaveBeenCalledTimes(2);
  });

  it('bot seçenekleri onPlayBot verilmezse (ör. izleyici bağlantısı) host için bile görünmez', () => {
    renderLobby(room([host()]), { me: 'p1' });
    expect(screen.queryByRole('region', { name: 'Beklerken yapay zekâya karşı oyna' })).not.toBeInTheDocument();
  });

  it('izleyici hiçbir yönetim eylemi görmez: başlatma yok, bot seçenekleri yok; yalnızca bekleme durumu', () => {
    const onPlayBot = vi.fn();
    renderLobby(room([host(), guest()]), { me: null, spectator: true, onPlayBot });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Oda sahibinin oyunu başlatması bekleniyor…');
    expect(screen.queryByText('(sen)')).not.toBeInTheDocument();
  });

  it('izleyici bayrağı oyuncu kimliğinden önceliklidir: store host kimliğini taşısa bile izleyici host eylemi görmez', () => {
    renderLobby(room([host(), guest()]), { me: 'p1', spectator: true });
    expect(screen.queryByRole('button', { name: 'Oyunu Başlat' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('tek oyunculu lobide izleyici de "Rakip bekleniyor…" metnini görür ve bot seçeneği görmez', () => {
    renderLobby(room([host()]), { me: null, spectator: true, onPlayBot: vi.fn() });
    expect(screen.getByText('Rakip bekleniyor… Aşağıdaki davet bağlantısını paylaş.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Beklerken yapay zekâya karşı oyna' })).not.toBeInTheDocument();
  });

  it('oyuncu kimliği bilinmeyen (izleyici olmayan) görüntüleyici host sayılmaz: iki oyuncuda bekleme durumunu görür', () => {
    renderLobby(room([host(), guest()]), { me: null });
    expect(screen.queryByRole('button', { name: /Başlat/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Oda sahibinin oyunu başlatması bekleniyor…');
  });

  it('başlatma düğmesi klavyeyle (Tab) odaklanabilir', async () => {
    const user = userEvent.setup();
    renderLobby(room([host(), guest()]), { me: 'p1' });
    await user.tab();
    expect(screen.getByRole('button', { name: 'Oyunu Başlat' })).toHaveFocus();
  });
});

describe('LobbyView — oyun bilgileri', () => {
  it.each([
    [1, 'Tek el — ilk eli kazanan maçı alır'],
    [3, '3 el üzerinden — 2 puan kazanan maçı alır'],
    [5, '5 el üzerinden — 3 puan kazanan maçı alır'],
    [7, '7 el üzerinden'],
  ])('format %i → "%s"', (bestOf, label) => {
    renderLobby(room([host()], { bestOf }), { me: 'p1' });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each([
    [30, 'Hamle süresi: 30 sn — süre dolunca sunucu otomatik oynar'],
    [15, 'Hamle süresi: 15 sn — süre dolunca sunucu otomatik oynar'],
    [null, 'Hamle süresi: süresiz'],
    [0, 'Hamle süresi: süresiz'],
  ])('hamle süresi %s → "%s"', (turnTimeLimitSeconds, label) => {
    renderLobby(room([host()], { turnTimeLimitSeconds }), { me: 'p1' });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('hamle süresi alanı hiç gönderilmediyse (undefined) "süresiz" gösterilir', () => {
    const snapshot = room([host()]);
    delete snapshot.turnTimeLimitSeconds;
    renderLobby(snapshot, { me: 'p1' });
    expect(screen.getByText('Hamle süresi: süresiz')).toBeInTheDocument();
  });

  it('InLobby durumunda da aynı lobi gösterilir', () => {
    renderLobby(room([host(), guest()], {}, 'InLobby'), { me: 'p1' });
    expect(screen.getByRole('heading', { name: 'Lobi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Oyunu Başlat' })).toBeInTheDocument();
  });
});
