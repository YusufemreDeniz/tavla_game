import { motion } from 'framer-motion';
import { Bot, Crown, Eye, Hourglass, Timer, User } from 'lucide-react';
import type { BotDifficulty, RoomSnapshotDto } from '../types/game';
import ConnectionDot from '../components/ConnectionDot';
import { useGameStore } from '../store/gameStore';

const FORMAT_LABELS: Record<number, string> = {
  1: 'Tek el — ilk eli kazanan maçı alır',
  3: '3 el üzerinden — 2 puan kazanan maçı alır',
  5: '5 el üzerinden — 3 puan kazanan maçı alır',
};

interface LobbyViewProps {
  snapshot: RoomSnapshotDto;
  onStartMatch: () => void;
  /** Rakip beklerken aynı ayarlarla yapay zekâya karşı yeni masa açar. */
  onPlayBot?: (difficulty: BotDifficulty) => void;
  spectator?: boolean;
}

export default function LobbyView({ snapshot, onStartMatch, onPlayBot, spectator = false }: LobbyViewProps) {
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const me = snapshot.players.find((p) => p.id === myPlayerId);
  const isHost = !spectator && (me?.isHost ?? false);
  const bothPlayersPresent = snapshot.players.length === 2;
  const hasBot = snapshot.players.some((p) => p.isBot);

  return (
    <div className="space-y-4">
      <section
        aria-label="Lobi"
        className="rounded-2xl border border-gold-500/20 bg-gradient-to-b from-night-800 to-night-900 p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-display text-lg text-gold-400">Lobi</h1>
          <span className="rounded-full border border-gold-500/30 bg-night-900 px-2.5 py-0.5 text-xs text-cream-200">
            {snapshot.players.length} / 2 Oyuncu
          </span>
        </div>

        <ul className="space-y-2.5">
          {snapshot.players.map((player) => (
            <motion.li
              key={player.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center justify-between rounded-xl border border-night-600 bg-night-950/70 px-4 py-3"
            >
              <span className="flex items-center gap-2.5 text-sm font-medium text-cream-100">
                {player.isHost ? (
                  <Crown size={16} className="text-gold-400" aria-label="Oda sahibi" />
                ) : player.isBot ? (
                  <Bot size={16} className="text-gold-400" aria-label="Yapay zekâ" />
                ) : (
                  <User size={16} className="text-cream-400" aria-hidden="true" />
                )}
                <span>{player.displayName}</span>
                {player.id === myPlayerId && <span className="text-xs text-cream-400">(sen)</span>}
              </span>
              {player.isBot ? (
                <span className="text-xs text-gold-400">Hazır</span>
              ) : (
                <ConnectionDot isConnected={player.isConnected} />
              )}
            </motion.li>
          ))}

          {!bothPlayersPresent && (
            <li className="flex items-center gap-2.5 rounded-xl border border-dashed border-gold-500/30 bg-night-900/40 px-4 py-3.5 text-sm text-cream-300">
              <Hourglass size={16} className="animate-pulse text-gold-400" aria-hidden="true" />
              Rakip bekleniyor… Aşağıdaki davet bağlantısını paylaş.
            </li>
          )}
        </ul>

        <div className="mt-4 space-y-1.5 rounded-lg border border-night-700 bg-night-950/60 px-3 py-2 text-xs text-cream-300">
          <p>{FORMAT_LABELS[snapshot.bestOf] ?? `${snapshot.bestOf} el üzerinden`}</p>
          <p className="flex items-center gap-1.5">
            <Timer size={13} className="text-gold-400" aria-hidden="true" />
            {snapshot.turnTimeLimitSeconds
              ? `Hamle süresi: ${snapshot.turnTimeLimitSeconds} sn — süre dolunca sunucu otomatik oynar`
              : 'Hamle süresi: süresiz'}
          </p>
        </div>
      </section>

      {!bothPlayersPresent && isHost && onPlayBot && (
        <section
          aria-label="Beklerken yapay zekâya karşı oyna"
          className="rounded-2xl border border-gold-500/20 bg-night-800 p-4"
        >
          <p className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-cream-100">
            <Bot size={16} className="text-gold-400" aria-hidden="true" />
            Beklemek istemiyor musun? Yapay zekâya karşı oyna
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onPlayBot('Easy')}
              className="min-h-11 rounded-xl border border-night-600 bg-night-700 px-3 py-2.5 text-sm font-semibold text-cream-100 hover:bg-night-600"
            >
              Kolay
            </button>
            <button
              type="button"
              onClick={() => onPlayBot('Master')}
              className="min-h-11 rounded-xl border border-gold-500/40 bg-night-700 px-3 py-2.5 text-sm font-semibold text-gold-400 hover:bg-night-600"
            >
              Usta
            </button>
          </div>
        </section>
      )}

      {bothPlayersPresent &&
        (isHost ? (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            type="button"
            onClick={onStartMatch}
            className="min-h-12 w-full rounded-xl bg-gradient-to-r from-bordo-600 to-bordo-700 px-4 py-3.5 text-lg font-bold text-cream-50 shadow-lg ring-1 ring-gold-500/30 transition-transform hover:scale-[1.01]"
          >
            {hasBot ? 'Bota Karşı Başlat' : 'Oyunu Başlat'}
          </motion.button>
        ) : (
          <p
            className="flex items-center justify-center gap-2 rounded-xl border border-night-600 bg-night-800 px-4 py-3.5 text-center text-sm text-cream-300"
            role="status"
          >
            {spectator && <Eye size={15} className="text-gold-400" aria-hidden="true" />}
            Oda sahibinin oyunu başlatması bekleniyor…
          </p>
        ))}
    </div>
  );
}
