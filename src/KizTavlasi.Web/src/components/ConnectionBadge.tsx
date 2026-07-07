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

export default function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const { label, className, Icon } = STATUS_CONFIG[status];
  const spinning = status === 'connecting' || status === 'reconnecting';

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${className}`}
      role="status"
      aria-live="polite"
    >
      <Icon size={14} className={spinning ? 'animate-spin' : ''} aria-hidden="true" />
      {label}
    </span>
  );
}
