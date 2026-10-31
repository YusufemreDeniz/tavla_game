import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
});
