import { Bot, WifiOff } from 'lucide-react';
import { Badge } from '../ui';
import { cx } from '../ui/cx';

interface PlayerCardProps {
  seat: number;
  name: string;
  isConnected: boolean;
  isActive: boolean;
  isMe: boolean;
  isBot: boolean;
  /** Bu oyuncunun pul rengi: izleyen oyuncunun bakışından bordo (benim) veya fildişi (rakip). */
  checkerColor: string;
  alignRight?: boolean;
}

/** Skor çubuğundaki oyuncu kartı (salt sunumsal). Sıra vurgusu renkle birlikte "Sırada" metniyle de verilir. */
export function PlayerCard({
  seat,
  name,
  isConnected,
  isActive,
  isMe,
  isBot,
  checkerColor,
  alignRight = false,
}: PlayerCardProps) {
  return (
    <div
      data-player-card
      data-seat={seat}
      data-active={isActive ? 'true' : 'false'}
      className={cx(
        'flex min-w-0 flex-col gap-1 rounded-control border px-2.5 py-1.5 font-ui transition-colors duration-(--duration-fast) md:px-3',
        alignRight ? 'items-end text-right' : 'items-start',
        isActive ? 'border-line-selected bg-surface-hover shadow-option-selected' : 'border-transparent',
      )}
    >
      <span className="flex max-w-full items-center gap-1.5 text-ui-sm font-semibold text-fg-primary md:text-ui">
        <span
          aria-hidden="true"
          className="inline-block size-2.5 shrink-0 rounded-full border border-white/25"
          style={{ backgroundColor: checkerColor }}
        />
        {isBot && <Bot size={14} className="shrink-0 text-fg-accent" aria-label="Yapay zekâ" />}
        <span className="truncate">{name}</span>
        {isMe && <span className="shrink-0 text-micro font-normal text-fg-muted">(sen)</span>}
      </span>
      {(isActive || !isConnected) && (
        <span className={cx('flex flex-wrap items-center gap-1', alignRight && 'justify-end')}>
          {isActive && (
            <Badge tone="accent" className="py-0 text-micro">
              <span aria-hidden="true" className="anim-turn-dot inline-block size-1.5 rounded-full bg-gold-400" />
              Sırada
            </Badge>
          )}
          {!isConnected && (
            <Badge className="border-status-error-border py-0 text-micro text-status-error-fg" icon={<WifiOff size={11} />}>
              Çevrimdışı
            </Badge>
          )}
        </span>
      )}
    </div>
  );
}
