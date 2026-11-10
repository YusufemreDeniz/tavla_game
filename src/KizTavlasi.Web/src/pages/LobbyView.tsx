import { Bot, Eye, Timer, Trophy } from 'lucide-react';
import type { BotDifficulty, RoomSnapshotDto } from '../types/game';
import { EmptySeatRow, PlayerRow } from '../components/lobby/PlayerRow';
import { Badge, Button, Notice, Panel } from '../components/ui';
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
    <div className="space-y-4 font-ui">
      <Panel as="section" aria-label="Lobi" className="shadow-plate">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="font-brand text-heading-md text-fg-primary">Lobi</h1>
          <Badge tone="accent">{snapshot.players.length} / 2 Oyuncu</Badge>
        </div>

        <ul className="space-y-2.5">
          {snapshot.players.map((player) => (
            <PlayerRow
              key={player.id}
              displayName={player.displayName}
              isHost={player.isHost}
              isBot={player.isBot}
              isSelf={player.id === myPlayerId}
              isConnected={player.isConnected}
            />
          ))}

          {!bothPlayersPresent && <EmptySeatRow>Rakip bekleniyor… Aşağıdaki davet bağlantısını paylaş.</EmptySeatRow>}
        </ul>

        <div className="mt-4 space-y-2 rounded-control border border-line-subtle bg-surface-page px-4 py-3 text-ui-sm text-fg-secondary">
          <p className="flex items-start gap-2">
            <Trophy size={14} className="mt-0.5 shrink-0 text-fg-accent" aria-hidden="true" />
            <span>{FORMAT_LABELS[snapshot.bestOf] ?? `${snapshot.bestOf} el üzerinden`}</span>
          </p>
          <p className="flex items-start gap-2">
            <Timer size={14} className="mt-0.5 shrink-0 text-fg-accent" aria-hidden="true" />
            <span>
              {snapshot.turnTimeLimitSeconds
                ? `Hamle süresi: ${snapshot.turnTimeLimitSeconds} sn — süre dolunca sunucu otomatik oynar`
                : 'Hamle süresi: süresiz'}
            </span>
          </p>
        </div>
      </Panel>

      {!bothPlayersPresent && isHost && onPlayBot && (
        <Panel as="section" aria-label="Beklerken yapay zekâya karşı oyna" padding="sm" className="p-4">
          <h2 className="mb-3 flex items-start gap-2 text-ui font-semibold text-fg-primary">
            <Bot size={16} className="mt-0.5 shrink-0 text-fg-accent" aria-hidden="true" />
            Beklemek istemiyor musun? Yapay zekâya karşı oyna
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="sm" onClick={() => onPlayBot('Easy')}>
              Kolay
            </Button>
            <Button variant="tertiary" size="sm" onClick={() => onPlayBot('Master')}>
              Usta
            </Button>
          </div>
        </Panel>
      )}

      {bothPlayersPresent &&
        (isHost ? (
          <Button fullWidth onClick={onStartMatch}>
            {hasBot ? 'Bota Karşı Başlat' : 'Oyunu Başlat'}
          </Button>
        ) : (
          <Notice role="status" icon={spectator ? <Eye size={15} /> : undefined}>
            Oda sahibinin oyunu başlatması bekleniyor…
          </Notice>
        ))}
    </div>
  );
}
