/**
 * LobbyView A3 yapı testleri (Aşama 3.8B). Davranış referansı `LobbyView.test.tsx`'tir (değişmedi);
 * bu dosya yeni yapıyı sınar: başlık hiyerarşisi, rol/durum METİNLERİ, klavye, uzun ad.
 * Mock yok; gerçek bileşenler + gerçek `useGameStore`. Testler CSS sınıfına değil rol/metne dayanır.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LobbyView from './LobbyView';
import { PlayerRow, EmptySeatRow } from '../components/lobby/PlayerRow';
import { Badge, Notice } from '../components/ui';
import { useGameStore } from '../store/gameStore';
import type { PlayerDto, RoomSnapshotDto } from '../types/game';

const host = (extra: Partial<PlayerDto> = {}): PlayerDto => ({ id: 'p1', displayName: 'Ayşe', seat: 1, isConnected: true, isHost: true, ...extra });
const guest = (extra: Partial<PlayerDto> = {}): PlayerDto => ({ id: 'p2', displayName: 'Fatma', seat: 2, isConnected: true, isHost: false, ...extra });
const bot = (extra: Partial<PlayerDto> = {}): PlayerDto => ({ id: 'bot', displayName: 'Usta Bot', seat: 2, isConnected: true, isHost: false, isBot: true, ...extra });

function room(players: PlayerDto[], extra: Partial<RoomSnapshotDto> = {}): RoomSnapshotDto {
  return {
    roomCode: 'ABC123',
    status: 'Waiting',
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

function renderLobby(snapshot: RoomSnapshotDto, me: string | null, opts: { spectator?: boolean; onPlayBot?: (d: 'Easy' | 'Master') => void } = {}) {
  useGameStore.getState().setMyPlayerId(me);
  // 3.9C: başlatma eylemi yalnızca bağlantı 'connected' iken etkin; bu fixture bağlı bir oturumu temsil eder.
  useGameStore.getState().setConnectionStatus('connected');
  const onStartMatch = vi.fn();
  render(<LobbyView snapshot={snapshot} onStartMatch={onStartMatch} {...opts} />);
  return { onStartMatch };
}

const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

beforeEach(() => {
  useGameStore.getState().reset();
  useGameStore.getState().setMyPlayerId(null);
});

describe('LobbyView A3 — başlık hiyerarşisi', () => {
  it('tek h1 ("Lobi"); bot bölümü h2 başlığı taşır ve h1 sayısı artmaz', () => {
    renderLobby(room([host()]), 'p1', { onPlayBot: vi.fn() });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: /Yapay zekâya karşı oyna/ })).toBeInTheDocument();
  });

  it('bot bölümü görünmeyen durumlarda h2 yoktur (misafir)', () => {
    renderLobby(room([host(), guest()]), 'p2');
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });
});

describe('LobbyView A3 — rol ve durum yalnızca renk/ikonla verilmez', () => {
  it('host satırı görünür "Oda sahibi" metni ve erişilebilir simge etiketi taşır; rozet aria-hidden (çift okuma yok)', () => {
    renderLobby(room([host(), guest()]), 'p2');
    const row = rowOf('Ayşe');
    expect(within(row).getByText('Oda sahibi')).toHaveAttribute('aria-hidden', 'true');
    expect(within(row).getByLabelText('Oda sahibi')).toBeInTheDocument();
  });

  it('bot satırı görünür "Yapay zekâ" metni ve "Hazır" durumu taşır', () => {
    renderLobby(room([host(), bot()]), 'p1');
    const row = rowOf('Usta Bot');
    expect(within(row).getByText('Yapay zekâ')).toBeInTheDocument();
    expect(within(row).getByLabelText('Yapay zekâ')).toBeInTheDocument();
    expect(within(row).getByText('Hazır')).toBeInTheDocument();
  });

  it('misafir satırında rol rozeti yoktur; bağlantı durumu metinle verilir', () => {
    renderLobby(room([host(), guest({ isConnected: false })]), 'p1');
    const row = rowOf('Fatma');
    expect(within(row).queryByText('Oda sahibi')).not.toBeInTheDocument();
    expect(within(row).queryByText('Yapay zekâ')).not.toBeInTheDocument();
    expect(within(row).getByText('Çevrimdışı')).toBeInTheDocument();
  });
});

describe('LobbyView A3 — biçim ve süre bilgisi', () => {
  it.each([
    [1, 'Tek el — ilk eli kazanan maçı alır'],
    [3, '3 el üzerinden — 2 puan kazanan maçı alır'],
    [5, '5 el üzerinden — 3 puan kazanan maçı alır'],
    [7, '7 el üzerinden'],
  ])('bestOf=%i için "%s" metni görünür', (bestOf, label) => {
    renderLobby(room([host()], { bestOf }), 'p1');
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('hamle süresi saniye olarak gösterilir', () => {
    renderLobby(room([host()], { turnTimeLimitSeconds: 45 }), 'p1');
    expect(screen.getByText('Hamle süresi: 45 sn — süre dolunca sunucu otomatik oynar')).toBeInTheDocument();
  });

  it('süresiz oda "Hamle süresi: süresiz" gösterir', () => {
    renderLobby(room([host()], { turnTimeLimitSeconds: null }), 'p1');
    expect(screen.getByText('Hamle süresi: süresiz')).toBeInTheDocument();
  });
});

describe('LobbyView A3 — uzun oyuncu adı', () => {
  const longName = 'Abdülhamitoğulları-Karaçorlulu_'.repeat(5);

  it('uzun ad kesilmeden tam metin olarak DOM\'dadır (ekran okuyucu tamamını okur)', () => {
    renderLobby(room([host({ displayName: longName }), guest()]), 'p2');
    expect(screen.getByText(longName).textContent).toBe(longName);
  });

  it('uzun ad satırda durum metnini ve "(sen)" göstergesini ortadan kaldırmaz', () => {
    renderLobby(room([host({ displayName: longName }), guest()]), 'p1');
    const row = rowOf(longName);
    expect(within(row).getByText('(sen)')).toBeInTheDocument();
    expect(within(row).getByText('Bağlı')).toBeInTheDocument();
  });
});

describe('LobbyView A3 — klavye ve eylemler', () => {
  it('Tab sırası Kolay → Usta; Enter/Space doğru zorluk callback\'ini çağırır', async () => {
    const user = userEvent.setup();
    const onPlayBot = vi.fn();
    renderLobby(room([host()]), 'p1', { onPlayBot });

    await user.tab();
    expect(screen.getByRole('button', { name: 'Kolay' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onPlayBot).toHaveBeenLastCalledWith('Easy');

    await user.tab();
    expect(screen.getByRole('button', { name: 'Usta' })).toHaveFocus();
    await user.keyboard(' ');
    expect(onPlayBot).toHaveBeenLastCalledWith('Master');
    expect(onPlayBot).toHaveBeenCalledTimes(2);
  });

  it('host başlatma düğmesi klavyeyle odaklanır, type="button" ve Enter ile onStartMatch çağırır', async () => {
    const user = userEvent.setup();
    const { onStartMatch } = renderLobby(room([host(), guest()]), 'p1');

    await user.tab();
    const start = screen.getByRole('button', { name: 'Oyunu Başlat' });
    expect(start).toHaveFocus();
    expect(start).toHaveAttribute('type', 'button');
    await user.keyboard('{Enter}');
    expect(onStartMatch).toHaveBeenCalledTimes(1);
  });

  it('bot lobisinde host "Bota Karşı Başlat" görür; bot seçenekleri görünmez', () => {
    renderLobby(room([host(), bot()]), 'p1', { onPlayBot: vi.fn() });
    expect(screen.getByRole('button', { name: 'Bota Karşı Başlat' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kolay' })).not.toBeInTheDocument();
  });

  it('misafir için eylem yoktur; bekleme mesajı canlı bölgededir', () => {
    renderLobby(room([host(), guest()]), 'p2');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Oda sahibinin oyunu başlatması bekleniyor…');
  });

  it('izleyici host kimliğiyle bile başlatma/bot düğmesi görmez', () => {
    renderLobby(room([host(), guest()]), 'p1', { spectator: true, onPlayBot: vi.fn() });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('PlayerRow / EmptySeatRow (salt sunumsal)', () => {
  it('yetki türetmez: "(sen)" yalnızca isSelf ile görünür', () => {
    render(
      <ul>
        <PlayerRow displayName="Deniz" isHost={false} isSelf isConnected />
        <PlayerRow displayName="Kaan" isHost={false} isSelf={false} isConnected={false} />
      </ul>,
    );
    expect(within(rowOf('Deniz')).getByText('(sen)')).toBeInTheDocument();
    expect(within(rowOf('Kaan')).queryByText('(sen)')).not.toBeInTheDocument();
  });

  it('isHost ve isBot birlikte gelirse tek rol etiketi (host) gösterilir', () => {
    render(
      <ul>
        <PlayerRow displayName="X" isHost isBot isSelf={false} isConnected />
      </ul>,
    );
    expect(screen.getAllByLabelText(/Oda sahibi|Yapay zekâ/)).toHaveLength(1);
    expect(screen.getByLabelText('Oda sahibi')).toBeInTheDocument();
  });

  it('EmptySeatRow verilen metni liste öğesi olarak gösterir', () => {
    render(
      <ul>
        <EmptySeatRow>Rakip bekleniyor…</EmptySeatRow>
      </ul>,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('Rakip bekleniyor…');
  });
});

describe('Badge ve Notice', () => {
  it('Badge çocuk metni gösterir, ikonu aria-hidden yapar ve ek nitelikleri iletir', () => {
    render(
      <Badge tone="accent" icon={<svg data-testid="ic" />} data-x="1">
        Etiket
      </Badge>,
    );
    expect(screen.getByText('Etiket')).toHaveAttribute('data-x', '1');
    expect(screen.getByTestId('ic').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('Notice ARIA rolünü çağırandan alır; kendiliğinden canlı bölge olmaz', () => {
    const { rerender } = render(<Notice>Merhaba</Notice>);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(<Notice role="status">Merhaba</Notice>);
    expect(screen.getByRole('status')).toHaveTextContent('Merhaba');
  });

  it('Notice ikonu dekoratiftir', () => {
    render(<Notice icon={<svg data-testid="ic" />}>Mesaj</Notice>);
    expect(screen.getByTestId('ic').parentElement).toHaveAttribute('aria-hidden', 'true');
  });
});
