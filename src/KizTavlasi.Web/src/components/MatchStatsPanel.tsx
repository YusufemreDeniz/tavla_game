import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { MatchStatsDto, PlayerDto, PlayerMatchStatsDto } from '../types/game';

interface MatchStatsPanelProps {
  matchId: string;
  players: PlayerDto[];
  loadStats: () => Promise<MatchStatsDto>;
}

type Better = 'higher' | 'lower' | 'none';

interface Row {
  label: string;
  hint?: string;
  value: (s: PlayerMatchStatsDto) => number | null;
  format: (s: PlayerMatchStatsDto) => string;
  better: Better;
}

const ROWS: Row[] = [
  {
    label: 'Zar ortalaması',
    hint: 'şans',
    value: (s) => (s.rolls > 0 ? s.averageRoll : null),
    format: (s) => (s.rolls > 0 ? s.averageRoll.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '—'),
    better: 'higher',
  },
  {
    label: 'Çift zar',
    value: (s) => s.doubles,
    format: (s) => (s.longestDoubleStreak >= 2 ? `${s.doubles} (seri ${s.longestDoubleStreak})` : `${s.doubles}`),
    better: 'higher',
  },
  {
    label: 'Boşa giden zar',
    hint: 'strateji',
    value: (s) => s.wastedDice,
    format: (s) => `${s.wastedDice}`,
    better: 'lower',
  },
  {
    label: 'İndirme bitişi',
    hint: 'son el',
    value: (s) => s.lastBringDownTurn,
    format: (s) => (s.lastBringDownTurn ? `${s.lastBringDownTurn}. atış` : '—'),
    better: 'lower',
  },
  { label: 'Mars', value: (s) => s.marsWins, format: (s) => `${s.marsWins}`, better: 'higher' },
  { label: 'Atış', value: (s) => s.rolls, format: (s) => `${s.rolls}`, better: 'none' },
];

/** İki oyuncunun değerinden daha iyisini (eşitlikte hiçbirini) işaretler. */
function leader(row: Row, a: PlayerMatchStatsDto, b: PlayerMatchStatsDto): 0 | 1 | null {
  if (row.better === 'none') return null;
  const va = row.value(a);
  const vb = row.value(b);
  if (va === null && vb === null) return null;
  if (va === null) return 1;
  if (vb === null) return 0;
  if (va === vb) return null;
  const aBetter = row.better === 'higher' ? va > vb : va < vb;
  return aBetter ? 0 : 1;
}

/**
 * Maç sonu "Şans vs. Strateji" karşılaştırması ve maçın kırılma anı.
 * Tüm değerler sunucuda hesaplanır; istemci yalnızca gösterir.
 */
export default function MatchStatsPanel({ matchId, players, loadStats }: MatchStatsPanelProps) {
  const [stats, setStats] = useState<MatchStatsDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setFailed(false);
    loadStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // Aynı maç için bir kez yüklenir; loadStats her render'da yeni olabilir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  if (failed) {
    return <p className="mt-4 text-xs text-cream-400">Maç istatistikleri şu an yüklenemedi.</p>;
  }

  if (!stats) {
    return (
      <div
        role="status"
        aria-label="İstatistikler yükleniyor"
        className="mt-4 h-40 animate-pulse rounded-xl border border-night-600 bg-night-900/80"
      />
    );
  }

  const ordered = [...players].sort((x, y) => x.seat - y.seat);
  const [first, second] = ordered.map((p) => stats.players.find((s) => s.playerId === p.id));
  if (!first || !second) return null;

  return (
    <section aria-label="Maç istatistikleri" className="mt-4 space-y-2.5 text-left">
      {stats.highlight && (
        <p
          className="flex items-start gap-2 rounded-xl border border-gold-500/35 bg-gold-500/10 px-3 py-2 text-xs text-cream-100"
          aria-label="Maçın kırılma anı"
        >
          <Sparkles size={15} className="mt-0.5 shrink-0 text-gold-400" aria-hidden="true" />
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gold-400">
              Maçın kırılma anı
            </span>
            {stats.highlight.text}
          </span>
        </p>
      )}

      <table className="w-full table-fixed overflow-hidden rounded-xl border border-night-600 bg-night-900/80 text-xs">
        <caption className="sr-only">Şans ve strateji karşılaştırması</caption>
        <thead>
          <tr className="border-b border-night-700 text-[10px] uppercase tracking-wider text-cream-400">
            <th scope="col" className="w-[38%] px-2.5 py-2 text-left font-medium">
              Şans vs. Strateji
            </th>
            {ordered.map((p) => (
              <th key={p.id} scope="col" className="truncate px-2 py-2 text-center font-semibold text-cream-100">
                {p.displayName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const lead = leader(row, first, second);
            return (
              <tr key={row.label} className="border-b border-night-800 last:border-0">
                <th scope="row" className="px-2.5 py-1.5 text-left font-normal text-cream-300">
                  {row.label}
                  {row.hint && <span className="ml-1 text-[10px] text-cream-400/70">({row.hint})</span>}
                </th>
                {[first, second].map((s, index) => (
                  <td
                    key={s.playerId}
                    data-leader={lead === index ? 'true' : undefined}
                    className={`px-2 py-1.5 text-center font-mono ${
                      lead === index ? 'font-bold text-gold-400' : 'text-cream-100'
                    }`}
                  >
                    {row.format(s)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-center text-[10px] text-cream-400">
        {stats.roundsPlayed} el · toplam {stats.totalRolls} zar atışı
      </p>
    </section>
  );
}
