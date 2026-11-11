import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SmilePlus, X } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

/**
 * İzinli emoji listesi — backend GameConstants.AllowedReactions ile birebir aynı olmalı;
 * listede olmayan emoji sunucu tarafından reddedilir.
 */
const REACTIONS = [
  '❤️', '😂', '🎲', '👏', '😮', '🔥',
  '😎', '😭', '🥳', '😤', '🤯', '🙏',
  '💪', '🍀', '😉', '🤝', '🫣', '👑',
];

interface ReactionsBarProps {
  onSend: (emoji: string) => void;
}

/** Tek butonla açılan emoji kutusu. */
export function ReactionsBar({ onSend }: ReactionsBarProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Dışarı tıklanınca kutuyu kapat.
  useEffect(() => {
    if (!open) return;
    const handler = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex justify-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Emoji kutusunu kapat' : 'Emoji kutusunu aç'}
        className="inline-flex min-h-(--size-touch-min) cursor-pointer items-center gap-2 rounded-control border border-line-control bg-transparent px-4 py-2 font-ui text-ui-sm font-medium text-fg-primary transition-colors duration-(--duration-fast) hover:border-line-control-hover hover:bg-surface-hover focus-visible:outline-3 focus-visible:outline-line-focus"
      >
        {open ? <X size={18} aria-hidden="true" /> : <SmilePlus size={18} aria-hidden="true" />}
        Tepki Gönder
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.92 }}
            transition={{ duration: 0.16 }}
            role="menu"
            aria-label="Emoji tepkileri"
            className="absolute bottom-full z-30 mb-2 grid w-72 max-w-[calc(100vw-2.5rem)] grid-cols-6 gap-1 rounded-panel border border-line-accent bg-surface-raised p-2 shadow-dialog"
          >
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                onClick={() => {
                  onSend(emoji);
                  setOpen(false);
                }}
                aria-label={`Tepki gönder: ${emoji}`}
                className="min-h-10 min-w-10 rounded-lg text-xl transition-transform hover:scale-125 hover:bg-night-700"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FloatingReaction({ id, emoji, fromMe }: { id: number; emoji: string; fromMe: boolean }) {
  const removeReaction = useGameStore((s) => s.removeReaction);

  useEffect(() => {
    const timer = setTimeout(() => removeReaction(id), 2400);
    return () => clearTimeout(timer);
  }, [id, removeReaction]);

  return (
    <motion.span
      initial={{ opacity: 0, y: 0, scale: 0.6 }}
      animate={{
        opacity: [0, 1, 1, 0],
        // Benim emojim alttan yükselir; rakibinki üstten iner.
        y: fromMe ? -170 : 170,
        scale: 1.4,
      }}
      transition={{ duration: 2.2, ease: 'easeOut' }}
      className={`pointer-events-none absolute text-4xl ${fromMe ? 'bottom-24' : 'top-20'}`}
      style={{ left: `${30 + ((id * 17) % 40)}%` }}
      aria-hidden="true"
    >
      {emoji}
    </motion.span>
  );
}

export function FloatingReactions() {
  const reactions = useGameStore((s) => s.reactions);
  const myPlayerId = useGameStore((s) => s.myPlayerId);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-live="polite">
      <AnimatePresence>
        {reactions.map((reaction) => (
          <FloatingReaction
            key={reaction.id}
            id={reaction.id}
            emoji={reaction.emoji}
            fromMe={reaction.fromPlayerId === myPlayerId}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
