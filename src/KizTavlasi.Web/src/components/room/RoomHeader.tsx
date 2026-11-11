import { BookOpen, DoorOpen, Eye, Volume2, VolumeX, Zap } from 'lucide-react';
import type { ConnectionStatus } from '../../types/game';
import ConnectionBadge from '../ConnectionBadge';
import { IconButton } from '../ui/IconButton';

export interface RoomHeaderProps {
  roomCode: string;
  connectionStatus: ConnectionStatus;
  spectatorCount: number;
  /** Çağıran taraf belirler (izleyici bağlantısı mı). Bu bileşen yetki/rol türetmez. */
  spectator: boolean;
  fastMode: boolean;
  soundEnabled: boolean;
  onToggleFastMode: () => void;
  onToggleSound: () => void;
  onOpenRules: () => void;
  onLeave: () => void;
}

/**
 * YALNIZCA LOBİ için A3 oda başlığı (salt sunumsal). Oyun sürerken RoomPage mevcut başlığı kullanır.
 * Etiketler, aria-pressed ve callback'ler önceki başlıkla birebir aynıdır.
 */
export function RoomHeader({
  roomCode,
  connectionStatus,
  spectatorCount,
  spectator,
  fastMode,
  soundEnabled,
  onToggleFastMode,
  onToggleSound,
  onOpenRules,
  onLeave,
}: RoomHeaderProps) {
  return (
    <header className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 font-ui md:mb-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-control-sm border border-line-accent bg-surface-raised px-3 py-1.5 font-code text-ui font-medium tracking-widest [overflow-wrap:anywhere] text-fg-accent">
          {roomCode}
        </span>
        <ConnectionBadge status={connectionStatus} variant="a3" />
        {spectatorCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-pill border border-line-control px-2.5 py-0.5 text-caption text-fg-secondary"
            aria-label={`${spectatorCount} izleyici`}
            title="Maçı izleyenler"
          >
            <Eye size={12} aria-hidden="true" />
            {spectatorCount}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <IconButton
          onClick={onToggleFastMode}
          label={fastMode ? 'Normal animasyon hızına geç' : 'Hızlı animasyon modunu aç'}
          aria-pressed={fastMode}
          title={fastMode ? 'Hızlı animasyon açık' : 'Normal animasyon hızı'}
          icon={<Zap size={16} />}
          className="aria-pressed:text-fg-accent"
        />
        <IconButton
          onClick={onToggleSound}
          label={soundEnabled ? 'Sesi kapat' : 'Sesi aç'}
          icon={soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        />
        <IconButton onClick={onOpenRules} label="Kuralları göster" icon={<BookOpen size={16} />} />
        <IconButton
          onClick={onLeave}
          label={spectator ? 'İzlemeyi bırak' : 'Odadan çık'}
          icon={<DoorOpen size={16} />}
          className="border-status-error-border/60 text-status-error-fg"
        />
      </div>
    </header>
  );
}
