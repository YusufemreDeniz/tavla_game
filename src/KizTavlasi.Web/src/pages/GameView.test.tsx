import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GameView from './GameView';
import { useGameStore } from '../store/gameStore';
import type { PlayerBoardDto, RoomSnapshotDto } from '../types/game';

function board(playerId: string, seat: number): PlayerBoardDto {
  return {
    playerId,
    seat,
    collectedCount: 0,
    isCollecting: false,
    points: Array.from({ length: 6 }, (_, i) => ({
      pointNumber: i + 1,
      backCount: i < 3 ? 2 : 3,
      frontCount: 0,
    })),
  };
}

function playingSnapshot(currentPlayerId: string): RoomSnapshotDto {
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
      player1Score: 0,
      player2Score: 0,
      winnerPlayerId: null,
      currentRound: {
        id: 'r1',
        roundNumber: 1,
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
  };
}

function renderGameView(
  snapshot: RoomSnapshotDto,
  onRollDice = vi.fn(),
  onPlayMove = vi.fn(),
) {
  render(
    <MemoryRouter>
      <GameView
        snapshot={snapshot}
        onRollDice={onRollDice}
        onPlayMove={onPlayMove}
        onSendReaction={vi.fn()}
        onRequestRematch={vi.fn()}
        onAcceptRematch={vi.fn()}
        onDeclineRematch={vi.fn()}
        onLeave={vi.fn()}
      />
    </MemoryRouter>,
  );
  return { onRollDice, onPlayMove };
}

describe('GameView', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useGameStore.getState().setMyPlayerId('p1');
  });

  it('sıra bende değilken zar butonu devre dışıdır', () => {
    renderGameView(playingSnapshot('p2'));

    expect(screen.getByRole('button', { name: /zar at/i })).toBeDisabled();
    expect(screen.getByText(/zar atıyor/i)).toBeInTheDocument();
  });

  it('sıra bendeyken zar butonu aktiftir ve stateVersion ile çağrılır', async () => {
    const { onRollDice } = renderGameView(playingSnapshot('p1'));
    const button = screen.getByRole('button', { name: /zar at/i });

    expect(button).toBeEnabled();
    fireEvent.click(button);

    await vi.waitFor(() => expect(onRollDice).toHaveBeenCalledWith(5));
  });

  it('bekleyen zar varken buton kilitli ve yalnızca o haneler tıklanabilir', async () => {
    const snapshot = playingSnapshot('p1');
    const withPendingDice: RoomSnapshotDto = {
      ...snapshot,
      match: {
        ...snapshot.match!,
        currentRound: {
          ...snapshot.match!.currentRound!,
          pendingDice: [5, 3],
        },
      },
    };

    const { onPlayMove } = renderGameView(withPendingDice);

    expect(screen.getByRole('button', { name: /zar at/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/zarını oyna/i);

    const playable = screen.getAllByRole('button', { name: /haneyi oyna/ });
    expect(playable).toHaveLength(2);
    // Tahta 1→6 sıralı çizilir; ilk tıklanabilir hane 3'tür.
    fireEvent.click(playable[0]);

    await vi.waitFor(() => expect(onPlayMove).toHaveBeenCalledWith(3, 5));
  });

  it('çift bonusu beklerken serbest haneler tıklanabilir', async () => {
    const snapshot = playingSnapshot('p1');
    const withPicks: RoomSnapshotDto = {
      ...snapshot,
      match: {
        ...snapshot.match!,
        currentRound: {
          ...snapshot.match!.currentRound!,
          pendingBonusPicks: 3,
          boards: snapshot.match!.currentRound!.boards.map((b) => ({
            ...b,
            isCollecting: true,
            points: b.points.map((p) => ({ ...p, backCount: 1, frontCount: 1 })),
          })),
        },
      },
    };

    const { onPlayMove } = renderGameView(withPicks);

    expect(screen.getByRole('alert')).toHaveTextContent(/çift bonusu/i);
    const playable = screen.getAllByRole('button', { name: /haneyi oyna/ });
    expect(playable).toHaveLength(6);
    fireEvent.click(playable[2]);

    await vi.waitFor(() => expect(onPlayMove).toHaveBeenCalledWith(3, 5));
  });

  it('aynı zar turunda aşama geçişi varken önce son indirme hanesi tıklanabilir olur', () => {
    const snapshot = playingSnapshot('p1');
    const transitionSnapshot: RoomSnapshotDto = {
      ...snapshot,
      match: {
        ...snapshot.match!,
        currentRound: {
          ...snapshot.match!.currentRound!,
          pendingDice: [6, 3],
          boards: snapshot.match!.currentRound!.boards.map((b) =>
            b.playerId === 'p1'
              ? {
                  ...b,
                  isCollecting: false,
                  points: b.points.map((p) =>
                    p.pointNumber === 6
                      ? { pointNumber: 6, backCount: 2, frontCount: 1 }
                      : { pointNumber: p.pointNumber, backCount: 1, frontCount: 1 },
                  ),
                }
              : b,
          ),
        },
      },
    };

    renderGameView(transitionSnapshot);

    const playable = screen.getAllByRole('button', { name: /haneyi oyna/ });
    expect(playable).toHaveLength(1);
    expect(playable[0]).toHaveAttribute('aria-label', '6. haneyi oyna');
  });

  it('rakip bağlantısı koptuğunda bilgilendirme bandı görünür', () => {
    const snapshot = playingSnapshot('p1');
    snapshot.players[1].isConnected = false;

    renderGameView(snapshot);

    expect(screen.getByText(/bağlantısı koptu/i)).toBeInTheDocument();
  });

  it('skor ve oyuncu adları görünür', () => {
    renderGameView(playingSnapshot('p1'));

    expect(screen.getByLabelText('Skor: 0 - 0')).toBeInTheDocument();
    expect(screen.getAllByText(/ayşe/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/fatma/i).length).toBeGreaterThan(0);
  });

  it('maç bittiğinde sonuç modalı ve rövanş butonu görünür', () => {
    const snapshot = playingSnapshot('p1');
    const completed: RoomSnapshotDto = {
      ...snapshot,
      status: 'Completed',
      match: {
        ...snapshot.match!,
        status: 'Completed',
        winnerPlayerId: 'p1',
        player1Score: 2,
        player2Score: 1,
        currentRound: null,
      },
    };

    renderGameView(completed);

    expect(screen.getByRole('dialog', { name: /maç sonucu/i })).toBeInTheDocument();
    expect(screen.getByText(/tebrikler, kazandın/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rövanş İste' })).toBeInTheDocument();
  });
  describe('izleyici, bot ve hamle süresi', () => {
    function renderWith(snapshot: RoomSnapshotDto, spectator = false) {
      render(
        <MemoryRouter>
          <GameView
            snapshot={snapshot}
            onRollDice={vi.fn()}
            onPlayMove={vi.fn()}
            onSendReaction={vi.fn()}
            onRequestRematch={vi.fn()}
            onAcceptRematch={vi.fn()}
            onDeclineRematch={vi.fn()}
            onLeave={vi.fn()}
            spectator={spectator}
          />
        </MemoryRouter>,
      );
    }

    it('izleyici tahtayı görür ama zar atamaz, hamle yapamaz ve tepki gönderemez', () => {
      useGameStore.getState().setMyPlayerId(null);
      const snapshot = playingSnapshot('p1');
      snapshot.match!.currentRound!.pendingDice = [3];

      renderWith(snapshot, true);

      expect(screen.getByRole('region', { name: /tavla tahtası/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /zar at/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /haneyi oyna/i })).not.toBeInTheDocument();
      expect(screen.getByText('İzleyici')).toBeInTheDocument();
      expect(screen.getAllByText(/Ayşe hamlesini oynuyor/i).length).toBeGreaterThan(0);
    });

    it('bot rakip sırasındayken düşünüyor mesajı gösterilir', () => {
      const snapshot = playingSnapshot('p2');
      snapshot.players[1] = { ...snapshot.players[1], displayName: 'Usta Bot', isBot: true };

      renderWith(snapshot);

      expect(screen.getByText(/usta bot düşünüyor/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Yapay zekâ')).toBeInTheDocument();
    });

    it('süreli odada insan oyuncunun sırasında geri sayım halkası görünür', () => {
      const snapshot = playingSnapshot('p1');
      const now = Date.now();
      snapshot.turnTimeLimitSeconds = 15;
      snapshot.serverTimeUtc = new Date(now).toISOString();
      // Sunucudan "Z" eki olmadan gelebilir; UTC kabul edilmeli.
      snapshot.match!.currentRound!.turnDeadlineUtc = new Date(now + 4_000).toISOString().replace('Z', '');

      renderWith(snapshot);

      const timer = screen.getByRole('timer');
      expect(timer).toHaveAttribute('data-urgent', 'true');
      expect(timer).toHaveAccessibleName(/kalan hamle süresi [1-4] saniye/i);
    });

    it('bot sırasında hamle süresi gösterilmez', () => {
      const snapshot = playingSnapshot('p2');
      snapshot.players[1] = { ...snapshot.players[1], isBot: true };
      snapshot.turnTimeLimitSeconds = 30;
      snapshot.match!.currentRound!.turnDeadlineUtc = new Date(Date.now() + 700).toISOString();

      renderWith(snapshot);

      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    });
  });
  it('boş gelen atışta zarlar, rakibin atışı başlasa bile yere inip okunana kadar kaybolmaz', () => {
    vi.useFakeTimers();
    try {
      renderGameView(playingSnapshot('p2')); // boş atıştan sonra sıra hemen rakipte

      act(() => {
        useGameStore.getState().setPendingRoll({
          playerId: 'p1',
          die1: 2,
          die2: 6,
          isDouble: false,
          wastedSteps: [],
          playableDice: [],
          bonusPicksGranted: 0,
          turnWasted: true,
          stateVersion: 5,
        });
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      // Rakip (bot) hemen atmaya başlar: önceki zarlar bunu görünce silinmemeli.
      act(() => {
        useGameStore.getState().setRollingPlayer('p2');
      });
      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(screen.getByTestId('dice-arena')).toHaveAttribute('data-phase', 'thrown');
      expect(screen.getByRole('img', { name: 'Zar: 2' })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Zar: 6' })).toBeInTheDocument();

      // Atış ve okunma süresi dolunca zarlar kalkar; rakibin zarları elde sallanır.
      act(() => {
        vi.advanceTimersByTime(6000);
      });
      expect(screen.getByTestId('dice-arena')).toHaveAttribute('data-phase', 'shaking');
    } finally {
      vi.useRealTimers();
    }
  });
});
