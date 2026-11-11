/**
 * LobbyView BAĞLANTI-FARKINDA maç başlatma testleri (Aşama 3.9C). Davranış referansı `LobbyView.test.tsx` / `LobbyView.a3.test.tsx`.
 *
 * Sözleşme: başlatma eylemi YALNIZCA store'daki `connectionStatus === 'connected'` iken etkindir; diğer durumlarda
 * (idle, connecting, reconnecting, disconnected) gerçek `disabled` + kısa açıklama gösterilir. Görünürlük/yetki koşulları
 * (host, 2 oyuncu, izleyici değil) DEĞİŞMEZ. Mock yok: LobbyView, Button ve gerçek `useGameStore` kullanılır.
 * Bu testler sunucu yetkilendirmesini veya gerçek SignalR'ı doğrulamaz.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LobbyView from './LobbyView';
import { useGameStore } from '../store/gameStore';
import type { ConnectionStatus, PlayerDto, RoomSnapshotDto } from '../types/game';

const host = (extra: Partial<PlayerDto> = {}): PlayerDto => ({ id: 'p1', displayName: 'Ayşe', seat: 1, isConnected: true, isHost: true, ...extra });
const guest = (extra: Partial<PlayerDto> = {}): PlayerDto => ({ id: 'p2', displayName: 'Fatma', seat: 2, isConnected: true, isHost: false, ...extra });
const bot = (): PlayerDto => ({ id: 'bot', displayName: 'Usta Bot', seat: 2, isConnected: true, isHost: false, isBot: true });

function room(players: PlayerDto[]): RoomSnapshotDto {
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
  };
}

function renderLobby(snapshot: RoomSnapshotDto, me: string | null, status: ConnectionStatus, opts: { spectator?: boolean; onPlayBot?: () => void } = {}) {
  useGameStore.getState().setMyPlayerId(me);
  useGameStore.getState().setConnectionStatus(status);
  const onStartMatch = vi.fn();
  render(<LobbyView snapshot={snapshot} onStartMatch={onStartMatch} {...opts} />);
  return { onStartMatch };
}

const DISCONNECTED: Array<[ConnectionStatus, RegExp]> = [
  ['idle', /Sunucuya bağlanılıyor/],
  ['connecting', /Sunucuya bağlanılıyor/],
  ['reconnecting', /Yeniden bağlanılıyor/],
  ['disconnected', /Bağlantı kesildi/],
];

beforeEach(() => {
  useGameStore.getState().reset();
  useGameStore.getState().setMyPlayerId(null);
});

describe('Oyunu Başlat — bağlantı durumu', () => {
  it('host + iki oyuncu + connected: düğme etkin, açıklama yok, tıklama onStartMatch çağırır', async () => {
    const user = userEvent.setup();
    const { onStartMatch } = renderLobby(room([host(), guest()]), 'p1', 'connected');
    const button = screen.getByRole('button', { name: 'Oyunu Başlat' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-describedby');
    await user.click(button);
    expect(onStartMatch).toHaveBeenCalledTimes(1);
  });

  it.each(DISCONNECTED)('%s: düğme gerçek disabled, neden kısa metinle açıklanır ve düğmeye bağlanır', (status, reason) => {
    renderLobby(room([host(), guest()]), 'p1', status);
    const button = screen.getByRole('button', { name: 'Oyunu Başlat' });
    expect(button).toBeDisabled();
    const text = screen.getByText(reason);
    expect(button).toHaveAttribute('aria-describedby', text.id);
    expect(text.id).not.toBe('');
  });

  it('açıklama canlı bölge DEĞİLDİR (rozet ve uyarı zaten duyuruyor; tekrar yok)', () => {
    renderLobby(room([host(), guest()]), 'p1', 'reconnecting');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reconnecting → connected: düğme yeniden etkinleşir, açıklama kalkar; connected → disconnected: anında devre dışı', () => {
    renderLobby(room([host(), guest()]), 'p1', 'connected');
    expect(screen.getByRole('button', { name: 'Oyunu Başlat' })).toBeEnabled();

    act(() => useGameStore.getState().setConnectionStatus('reconnecting'));
    expect(screen.getByRole('button', { name: 'Oyunu Başlat' })).toBeDisabled();
    expect(screen.getByText(/Yeniden bağlanılıyor/)).toBeInTheDocument();

    act(() => useGameStore.getState().setConnectionStatus('connected'));
    expect(screen.getByRole('button', { name: 'Oyunu Başlat' })).toBeEnabled();
    expect(screen.queryByText(/Yeniden bağlanılıyor/)).not.toBeInTheDocument();

    act(() => useGameStore.getState().setConnectionStatus('disconnected'));
    expect(screen.getByRole('button', { name: 'Oyunu Başlat' })).toBeDisabled();
    expect(screen.getByText(/Bağlantı kesildi/)).toBeInTheDocument();
  });

  it('disabled düğmeye fareyle basmak callback çağırmaz', async () => {
    const user = userEvent.setup();
    const { onStartMatch } = renderLobby(room([host(), guest()]), 'p1', 'disconnected');
    await user.click(screen.getByRole('button', { name: 'Oyunu Başlat' }));
    expect(onStartMatch).not.toHaveBeenCalled();
  });

  it('disabled düğme klavyeyle tetiklenemez (Tab odaklamaz; Enter/Space callback çağırmaz)', async () => {
    const user = userEvent.setup();
    const { onStartMatch } = renderLobby(room([host(), guest()]), 'p1', 'reconnecting');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Oyunu Başlat' })).not.toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onStartMatch).not.toHaveBeenCalled();
  });
});

describe('Bota Karşı Başlat — aynı bağlantı koruması', () => {
  it('bot odasında connected: etkin; diğer durumlarda disabled + açıklama', () => {
    renderLobby(room([host(), bot()]), 'p1', 'connected');
    expect(screen.getByRole('button', { name: 'Bota Karşı Başlat' })).toBeEnabled();

    act(() => useGameStore.getState().setConnectionStatus('disconnected'));
    expect(screen.getByRole('button', { name: 'Bota Karşı Başlat' })).toBeDisabled();
    expect(screen.getByText(/Bağlantı kesildi/)).toBeInTheDocument();

    act(() => useGameStore.getState().setConnectionStatus('connected'));
    expect(screen.getByRole('button', { name: 'Bota Karşı Başlat' })).toBeEnabled();
  });

  it('bot odasında disabled iken tıklama callback çağırmaz', async () => {
    const user = userEvent.setup();
    const { onStartMatch } = renderLobby(room([host(), bot()]), 'p1', 'connecting');
    await user.click(screen.getByRole('button', { name: 'Bota Karşı Başlat' }));
    expect(onStartMatch).not.toHaveBeenCalled();
  });
});

describe('yetki ve görünürlük DEĞİŞMEZ', () => {
  it.each<ConnectionStatus>(['idle', 'connecting', 'connected', 'reconnecting', 'disconnected'])('misafir (%s): başlatma düğmesi ve bağlantı açıklaması yok; bekleme mesajı role=status', (status) => {
    renderLobby(room([host(), guest()]), 'p2', status);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/bağlanılıyor|Bağlantı kesildi/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Oda sahibinin oyunu başlatması bekleniyor…');
  });

  it.each<ConnectionStatus>(['connected', 'disconnected'])('izleyici (%s): host kimliğiyle bile başlatma düğmesi yok', (status) => {
    renderLobby(room([host(), guest()]), 'p1', status, { spectator: true });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/Bağlantı kesildi/)).not.toBeInTheDocument();
  });

  it('tek oyunculu normal lobi: başlatma düğmesi yok; bot seçenekleri bağlantıdan bağımsız mevcut davranışı korur', () => {
    renderLobby(room([host()]), 'p1', 'disconnected', { onPlayBot: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Oyunu Başlat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kolay' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Usta' })).toBeEnabled();
    expect(screen.queryByText(/Bağlantı kesildi/)).not.toBeInTheDocument();
  });
});
