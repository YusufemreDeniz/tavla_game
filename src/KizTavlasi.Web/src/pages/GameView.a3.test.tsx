/**
 * GameView A3 sunum katmanı (yalnızca görsel/erişilebilirlik sözleşmeleri). Oyun kuralı, zar sonucu, hamle
 * eşlemesi ve SignalR akışı GameView.test.tsx / BackgammonBoard.test.tsx tarafından korunur; burada DEĞİŞMEZ.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GameView from './GameView';
import { useGameStore } from '../store/gameStore';
import { feltTexture } from '../lib/woodTexture';
import type { PlayerBoardDto, RoomSnapshotDto } from '../types/game';

function board(playerId: string, seat: number): PlayerBoardDto {
  return {
    playerId,
    seat,
    collectedCount: 0,
    isCollecting: false,
    points: Array.from({ length: 6 }, (_, i) => ({ pointNumber: i + 1, backCount: i < 3 ? 2 : 3, frontCount: 0 })),
  };
}

function snapshotOf(currentPlayerId: string, overrides: Partial<RoomSnapshotDto> = {}): RoomSnapshotDto {
  return {
    roomCode: 'ABC234',
    status: 'Playing',
    bestOf: 3,
    hostPlayerId: 'p1',
    players: [
      { id: 'p1', displayName: 'Ayşe', seat: 1, isConnected: true, isHost: true },
      { id: 'p2', displayName: 'Fatma', seat: 2, isConnected: true, isHost: false },
    ],
    match: {
      id: 'm1',
      matchNumber: 1,
      bestOf: 3,
      requiredWins: 2,
      status: 'InProgress',
      player1Score: 1,
      player2Score: 0,
      winnerPlayerId: null,
      currentRound: {
        id: 'r1',
        roundNumber: 2,
        status: 'InProgress',
        startingPlayerId: currentPlayerId,
        currentPlayerId,
        winnerPlayerId: null,
        turnNumber: 2,
        pendingDice: [],
        pendingBonusPicks: 0,
        boards: [board('p1', 1), board('p2', 2)],
      },
    },
    rematchRequestedByPlayerId: null,
    stateVersion: 5,
    serverTimeUtc: new Date().toISOString(),
    ...overrides,
  };
}

function withPending(snapshot: RoomSnapshotDto, pendingDice: number[]): RoomSnapshotDto {
  return {
    ...snapshot,
    match: {
      ...snapshot.match!,
      currentRound: { ...snapshot.match!.currentRound!, pendingDice },
    },
  };
}

function renderGame(snapshot: RoomSnapshotDto, extra: Partial<React.ComponentProps<typeof GameView>> = {}) {
  const handlers = {
    onRollDice: vi.fn(),
    onPlayMove: vi.fn(),
    onSendReaction: vi.fn(),
    onRequestRematch: vi.fn(),
    onAcceptRematch: vi.fn(),
    onDeclineRematch: vi.fn(),
    onLeave: vi.fn(),
  };
  const view = render(
    <MemoryRouter>
      <GameView snapshot={snapshot} {...handlers} {...extra} />
    </MemoryRouter>,
  );
  return { ...view, ...handlers };
}

const card = (seat: number) => document.querySelector(`[data-player-card][data-seat="${seat}"]`) as HTMLElement;

beforeEach(() => {
  useGameStore.getState().reset();
  useGameStore.getState().setMyPlayerId('p1');
});

describe('A3 oyuncu kartları ve sıra vurgusu', () => {
  it('her koltuk için bir oyuncu kartı vardır; yalnızca sıradaki kart aktiftir ve "Sırada" yazar', () => {
    renderGame(snapshotOf('p2'));

    expect(card(1)).not.toBeNull();
    expect(card(2)).not.toBeNull();
    expect(card(1)).toHaveAttribute('data-active', 'false');
    expect(card(2)).toHaveAttribute('data-active', 'true');
    expect(within(card(2)).getByText('Sırada')).toBeInTheDocument();
    expect(within(card(1)).queryByText('Sırada')).not.toBeInTheDocument();
    // Sıra bilgisi ekranda tek yerde (kart) verilir; tahta çipi tekrar etmez.
    expect(screen.getAllByText('Sırada')).toHaveLength(1);
  });

  it('kendi kartım "(sen)" ile işaretlenir; bot kartı "Yapay zekâ" simgesi taşır', () => {
    const snapshot = snapshotOf('p1');
    snapshot.players[1] = { ...snapshot.players[1], displayName: 'Usta Bot', isBot: true };
    renderGame(snapshot);

    expect(within(card(1)).getByText('(sen)')).toBeInTheDocument();
    expect(within(card(2)).getByLabelText('Yapay zekâ')).toBeInTheDocument();
  });

  it('bağlantısı kopan oyuncunun kartında "Çevrimdışı" yazar; bağlı oyuncuda yazmaz', () => {
    const snapshot = snapshotOf('p1');
    snapshot.players[1] = { ...snapshot.players[1], isConnected: false };
    renderGame(snapshot);

    expect(within(card(2)).getByText('Çevrimdışı')).toBeInTheDocument();
    expect(within(card(1)).queryByText('Çevrimdışı')).not.toBeInTheDocument();
  });

  it('skor ve el bilgisi okunur ve ekran okuyucuya tek etiketle verilir', () => {
    renderGame(snapshotOf('p1'));

    expect(screen.getByLabelText('Skor: 1 - 0')).toBeInTheDocument();
    expect(screen.getByText(/2\. el · Tur 2/)).toBeInTheDocument();
  });
});

describe('A3 zar durumu şeridi', () => {
  function rollDice(die1: number, die2: number, isDouble = false) {
    act(() => {
      useGameStore.getState().setPendingRoll({
        playerId: 'p1',
        die1,
        die2,
        isDouble,
        wastedSteps: [],
        playableDice: [die1, die2],
        bonusPicksGranted: 0,
        turnWasted: false,
        stateVersion: 5,
      });
    });
  }

  const items = () => within(screen.getByTestId('dice-status')).getAllByTestId('dice-status-item');

  it('zar yokken şerit görünmez', () => {
    renderGame(snapshotOf('p1'));
    expect(screen.queryByTestId('dice-status')).not.toBeInTheDocument();
  });

  it('iki zar da bekliyorsa ikisi de "kullanılabilir" işaretlenir', () => {
    renderGame(withPending(snapshotOf('p1'), [5, 3]));
    rollDice(5, 3);

    expect(items().map((i) => i.getAttribute('data-used'))).toEqual(['false', 'false']);
    expect(screen.getByTestId('dice-status')).toHaveAccessibleName('Zarlar');
    expect(screen.getByTestId('dice-status')).toHaveTextContent('5 kullanılabilir');
    expect(screen.getByTestId('dice-status')).toHaveTextContent('3 kullanılabilir');
  });

  it('oynanmış zar "kullanıldı" işaretlenir (yalnızca renkle değil, metinle de)', () => {
    renderGame(withPending(snapshotOf('p1'), [3]));
    rollDice(5, 3);

    expect(items().map((i) => i.getAttribute('data-used'))).toEqual(['true', 'false']);
    expect(screen.getByTestId('dice-status')).toHaveTextContent('5 kullanıldı');
    expect(screen.getByTestId('dice-status')).toHaveTextContent('3 kullanılabilir');
  });

  it('şerit zar yüzlerini erişilebilir "img" olarak ÇOĞALTMAZ (gerçek zarlar zar arenasında tek kaynak)', () => {
    renderGame(withPending(snapshotOf('p1'), [5, 3]));
    rollDice(5, 3);

    expect(within(screen.getByTestId('dice-status')).queryAllByRole('img')).toHaveLength(0);
  });
});

describe('A3 oyun kontrolleri', () => {
  it('"Zar At" düğmesi A3 Button (en az 44 px hedef) ve sıra bendeyken etkin', () => {
    const { onRollDice } = renderGame(snapshotOf('p1'));
    const button = screen.getByRole('button', { name: /zar at/i });

    expect(button).toBeEnabled();
    expect(button.className).toContain('min-h-(--size-touch-min)');
    fireEvent.click(button);
    expect(onRollDice).toHaveBeenCalledWith(5);
  });

  it('atış sürerken düğme kilitlenir, "Atılıyor…" yazar ve aria-busy alır', () => {
    renderGame(snapshotOf('p1'));
    fireEvent.click(screen.getByRole('button', { name: /zar at/i }));

    const button = screen.getByRole('button', { name: /zar at/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Atılıyor…');
  });

  it('sıra rakipteyken düğme kilitli ve nedeni ekranda yazılı', () => {
    renderGame(snapshotOf('p2'));

    expect(screen.getByRole('button', { name: /zar at/i })).toBeDisabled();
    expect(screen.getByText('Fatma zar atıyor…')).toBeInTheDocument();
  });

  it('geçmiş şeridi açılır/kapanır ve aria-expanded taşır', () => {
    renderGame(snapshotOf('p1'));
    act(() => {
      useGameStore.getState().addHistory('Ayşe 3-4 attı');
      useGameStore.getState().addHistory('Fatma 1. haneden pul indirdi');
    });

    const toggle = screen.getByRole('button', { name: /geçmiş/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /gizle/i })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('A3 bağlantı ve maç sonu', () => {
  it('rakip bağlantısı kopunca durum bildirimi (role=status) görünür', () => {
    const snapshot = snapshotOf('p1');
    snapshot.players[1] = { ...snapshot.players[1], isConnected: false };
    renderGame(snapshot);

    expect(screen.getByText(/bağlantısı koptu/i).closest('[role="status"]')).not.toBeNull();
  });

  function completed(extra: Partial<RoomSnapshotDto> = {}): RoomSnapshotDto {
    const base = snapshotOf('p1', extra);
    return {
      ...base,
      status: 'Completed',
      match: { ...base.match!, status: 'Completed', winnerPlayerId: 'p1', player1Score: 2, currentRound: null },
    };
  }

  it("rakip rövanş isterse Kabul Et / Reddet düğmeleri doğru callback'leri çağırır", () => {
    const { onAcceptRematch, onDeclineRematch } = renderGame(completed({ rematchRequestedByPlayerId: 'p2' }));

    const dialog = screen.getByRole('dialog', { name: /maç sonucu/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kabul Et' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));
    expect(onAcceptRematch).toHaveBeenCalledTimes(1);
    expect(onDeclineRematch).toHaveBeenCalledTimes(1);
  });

  it('maç sonu düğmeleri en az 44 px (A3 Button) ve type="button"', () => {
    renderGame(completed());

    const dialog = screen.getByRole('dialog', { name: /maç sonucu/i });
    for (const name of ['Rövanş İste', 'Ana Sayfaya Dön']) {
      const button = within(dialog).getByRole('button', { name });
      expect(button).toHaveAttribute('type', 'button');
      expect(button.className).toMatch(/min-h-\(--size-(button|touch-min)\)/);
    }
  });
});

describe('A3 renk dili', () => {
  it('oyun ekranı eski zümrüt/kehribar paletini taşımaz (A3: gece mavisi, ceviz, bordo, altın)', () => {
    const snapshot = snapshotOf('p1');
    snapshot.players[1] = { ...snapshot.players[1], isConnected: false };
    const { container } = renderGame(snapshot);

    expect(container.querySelector('[class*="emerald"]')).toBeNull();
    expect(container.querySelector('[class*="amber"]')).toBeNull();
  });

  it('masa çuhası yeşil değil gece mavisidir', () => {
    const felt = decodeURIComponent(feltTexture());
    expect(felt).not.toContain('#183626');
    expect(felt).toContain('#151c30');
  });
});
