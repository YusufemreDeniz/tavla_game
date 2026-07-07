import { motion } from 'framer-motion';
import { Crown, User, Hourglass } from 'lucide-react';
import type { RoomSnapshotDto } from '../types/game';
import ConnectionDot from '../components/ConnectionDot';
import { useGameStore } from '../store/gameStore';

const FORMAT_LABELS: Record<number, string> = {
  1: 'Tek el — ilk eli kazanan maçı alır',
  3: '3 el üzerinden — 2 el kazanan maçı alır',
  5: '5 el üzerinden — 3 el kazanan maçı alır',
};

interface LobbyViewProps {
  snapshot: RoomSnapshotDto;
  onStartMatch: () => void;
}

export default function LobbyView({ snapshot, onStartMatch }: LobbyViewProps) {
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const me = snapshot.players.find((p) => p.id === myPlayerId);
  const isHost = me?.isHost ?? false;
  const bothPlayersPresent = snapshot.players.length === 2;

  return (
    <div className="space-y-4">
      <section
        aria-label="Lobi"
        className="rounded-2xl border border-gold-500/15 bg-night-800 p-5"
      >
        <h1 className="mb-4 font-display text-lg text-gold-400">Lobi</h1>

        <ul className="space-y-2">
          {snapshot.players.map((player) => (
            <motion.li
              key={player.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center justify-between rounded-xl border border-night-600 bg-night-900 px-4 py-3"
            >
              <span className="flex items-center gap-2.5 text-sm font-medium text-cream-100">
                {player.isHost ? (
                  <Crown size={16} className="text-gold-400" aria-label="Oda sahibi" />
                ) : (
                  <User size={16} className="text-cream-400" aria-hidden="true" />
                )}
                {player.displayName}
                {player.id === myPlayerId && <span className="text-xs text-cream-400">(sen)</span>}
              </span>
              <ConnectionDot isConnected={player.isConnected} />
            </motion.li>
          ))}

          {!bothPlayersPresent && (
            <li className="flex items-center gap-2.5 rounded-xl border border-dashed border-night-600 px-4 py-3 text-sm text-cream-400">
              <Hourglass size={16} className="animate-pulse" aria-hidden="true" />
              Rakip bekleniyor… Linki paylaş.
            </li>
          )}
        </ul>

        <p className="mt-4 rounded-lg bg-night-900 px-3 py-2 text-xs text-cream-300">
          {FORMAT_LABELS[snapshot.bestOf] ?? `${snapshot.bestOf} el üzerinden`}
        </p>
      </section>

      {bothPlayersPresent &&
        (isHost ? (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            type="button"
            onClick={onStartMatch}
            className="min-h-12 w-full rounded-xl bg-gradient-to-r from-bordo-600 to-bordo-700 px-4 py-3.5 text-lg font-bold text-cream-50 shadow-lg transition-transform hover:scale-[1.01]"
          >
            Oyunu Başlat
          </motion.button>
        ) : (
          <p className="rounded-xl border border-night-600 bg-night-800 px-4 py-3.5 text-center text-sm text-cream-300" role="status">
            Oda sahibinin oyunu başlatması bekleniyor…
          </p>
        ))}
    </div>
  );
}
