import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import MatchStatsPanel from './MatchStatsPanel';
import type { MatchStatsDto, PlayerDto } from '../types/game';

const players: PlayerDto[] = [
  { id: 'p2', displayName: 'Fatma', seat: 2, isConnected: true, isHost: false },
  { id: 'p1', displayName: 'Ayşe', seat: 1, isConnected: true, isHost: true },
];

const stats: MatchStatsDto = {
  matchId: 'm1',
  roundsPlayed: 1,
  totalRolls: 3,
  highlight: {
    kind: 'Mars',
    playerId: 'p1',
    roundNumber: 1,
    text: 'Ayşe 1. eli MARS ile aldı — rakip daha indirmeyi bitirememişti!',
  },
  players: [
    {
      playerId: 'p1',
      rolls: 2,
      averageRoll: 12,
      doubles: 2,
      longestDoubleStreak: 2,
      wastedDice: 0,
      lastBringDownTurn: 1,
      averageBringDownTurn: 1,
      marsWins: 1,
      points: 2,
    },
    {
      playerId: 'p2',
      rolls: 1,
      averageRoll: 3,
      doubles: 0,
      longestDoubleStreak: 0,
      wastedDice: 2,
      lastBringDownTurn: null,
      averageBringDownTurn: null,
      marsWins: 0,
      points: 0,
    },
  ],
};

describe('MatchStatsPanel', () => {
  it('kırılma anını ve koltuk sırasına göre yan yana karşılaştırmayı gösterir', async () => {
    render(<MatchStatsPanel matchId="m1" players={players} loadStats={() => Promise.resolve(stats)} />);

    expect(await screen.findByLabelText('Maçın kırılma anı')).toHaveTextContent(/MARS ile aldı/);

    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Şans vs. Strateji', 'Ayşe', 'Fatma']);

    const rowOf = (label: RegExp) => within(table).getByRole('row', { name: label });
    const cells = (label: RegExp) => within(rowOf(label)).getAllByRole('cell');

    expect(cells(/zar ortalaması/i).map((c) => c.textContent)).toEqual(['12', '3']);
    expect(cells(/zar ortalaması/i)[0]).toHaveAttribute('data-leader', 'true');
    // Boşa giden zarda az olan iyidir.
    expect(cells(/boşa giden zar/i)[0]).toHaveAttribute('data-leader', 'true');
    expect(cells(/çift zar/i)[0]).toHaveTextContent('2 (seri 2)');
    expect(cells(/İndirme bitişi/).map((c) => c.textContent)).toEqual(['1. atış', '—']);
    expect(screen.getByText(/1 el · toplam 3 zar atışı/)).toBeInTheDocument();
  });

  it('eşit değerlerde kimse öne çıkarılmaz', async () => {
    const tied: MatchStatsDto = {
      ...stats,
      highlight: null,
      players: stats.players.map((p) => ({ ...p, marsWins: 0 })),
    };
    render(<MatchStatsPanel matchId="m1" players={players} loadStats={() => Promise.resolve(tied)} />);

    const row = await screen.findByRole('row', { name: /mars/i });
    within(row)
      .getAllByRole('cell')
      .forEach((cell) => expect(cell).not.toHaveAttribute('data-leader'));
    expect(screen.queryByLabelText('Maçın kırılma anı')).not.toBeInTheDocument();
  });

  it('yükleme hatasında sade bir mesaj gösterir', async () => {
    const loadStats = vi.fn().mockRejectedValue(new Error('ağ hatası'));
    render(<MatchStatsPanel matchId="m1" players={players} loadStats={loadStats} />);

    expect(await screen.findByText(/istatistikleri şu an yüklenemedi/i)).toBeInTheDocument();
    expect(loadStats).toHaveBeenCalledTimes(1);
  });
});
