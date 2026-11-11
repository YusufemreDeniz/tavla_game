import { Wifi, WifiOff, RefreshCw, Loader2 } from 'lucide-react';
import type { ConnectionStatus } from '../types/game';

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; className: string; Icon: typeof Wifi }
> = {
  idle: { label: 'Bağlı değil', className: 'text-cream-400', Icon: WifiOff },
  connecting: { label: 'Bağlanıyor…', className: 'text-gold-400', Icon: Loader2 },
  connected: { label: 'Bağlı', className: 'text-emerald-400', Icon: Wifi },
  reconnecting: { label: 'Yeniden bağlanıyor…', className: 'text-gold-400', Icon: RefreshCw },
  disconnected: { label: 'Bağlantı kesildi', className: 'text-bordo-500', Icon: WifiOff },
};

/** A3 varyantı (yalnızca lobi başlığı, açıkça seçilir): aynı metin/ikon/ARIA, A3 token renkleri + çerçeveli hap. */
const A3_CLASS: Record<ConnectionStatus, string> = {
  idle: 'border-line-control text-fg-muted',
  connecting: 'border-line-accent text-fg-accent',
  connected: 'border-line-control text-emerald-400',
  reconnecting: 'border-line-accent text-fg-accent',
  disconnected: 'border-status-error-border text-status-error-fg',
};

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  /** Varsayılan 'default' = mevcut görünüm (oyun başlığı bunu kullanır). */
  variant?: 'default' | 'a3';
}

export default function ConnectionBadge({ status, variant = 'default' }: ConnectionBadgeProps) {
  const { label, className, Icon } = STATUS_CONFIG[status];
  const spinning = status === 'connecting' || status === 'reconnecting';
  const classes =
    variant === 'a3'
      ? `inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 font-ui text-ui-sm font-medium ${A3_CLASS[status]}`
      : `inline-flex items-center gap-1.5 text-xs font-medium ${className}`;

  return (
    <span
      className={classes}
      role="status"
      aria-live="polite"
    >
      <Icon size={14} className={spinning ? 'animate-spin' : ''} aria-hidden="true" />
      {label}
    </span>
  );
}
