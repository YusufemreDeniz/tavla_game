import { motion } from 'framer-motion';
import { Bot, Crown, Hourglass, User } from 'lucide-react';
import ConnectionDot from '../ConnectionDot';
import { Badge } from '../ui/Badge';

export interface PlayerRowProps {
  displayName: string;
  /** Çağıran taraf hesaplar; bu bileşen yetki/rol türetmez. */
  isHost: boolean;
  isBot?: boolean;
  /** "(sen)" göstergesi. */
  isSelf: boolean;
  isConnected: boolean;
}

/**
 * Lobi oyuncu koltuğu. Rol ve durum yalnızca renk/ikonla değil görünür METİNLE de verilir.
 * Simge etiketleri (aria-label) erişilebilir ad olarak korunur; görünür rozet metni tekrar
 * okunmasın diye aria-hidden'dır.
 */
export function PlayerRow({ displayName, isHost, isBot, isSelf, isConnected }: PlayerRowProps) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start justify-between gap-3 rounded-control border border-line-subtle bg-surface-input px-4 py-3"
    >
      <span className="flex min-w-0 flex-1 items-start gap-2.5 text-ui leading-6 font-medium text-fg-primary">
        <span className="flex h-6 shrink-0 items-center">
          {isHost ? (
            <Crown size={16} className="text-fg-accent" aria-label="Oda sahibi" />
          ) : isBot ? (
            <Bot size={16} className="text-fg-accent" aria-label="Yapay zekâ" />
          ) : (
            <User size={16} className="text-fg-muted" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span>{displayName}</span>
          {isSelf && <span className="ml-2 text-ui-sm font-normal text-fg-muted">(sen)</span>}
          {isHost && (
            <Badge tone="accent" aria-hidden="true" className="ml-2 align-middle">
              Oda sahibi
            </Badge>
          )}
          {isBot && !isHost && (
            <Badge aria-hidden="true" className="ml-2 align-middle">
              Yapay zekâ
            </Badge>
          )}
        </span>
      </span>
      <span className="flex h-6 shrink-0 items-center">
        {isBot ? <span className="text-ui-sm text-fg-accent">Hazır</span> : <ConnectionDot isConnected={isConnected} />}
      </span>
    </motion.li>
  );
}

/** Boş rakip koltuğu (rakip beklenirken). Metin LobbyView'dan gelen mevcut Türkçe metindir. */
export function EmptySeatRow({ children }: { children: string }) {
  return (
    <li className="flex items-center gap-2.5 rounded-control border border-dashed border-line-control bg-transparent px-4 py-3.5 text-ui text-fg-secondary">
      <Hourglass size={16} className="shrink-0 animate-pulse text-fg-accent motion-reduce:animate-none" aria-hidden="true" />
      {children}
    </li>
  );
}
