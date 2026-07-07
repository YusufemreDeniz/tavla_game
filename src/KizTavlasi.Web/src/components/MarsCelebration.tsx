import { useMemo } from 'react';
import { motion } from 'framer-motion';

/**
 * MARS kutlaması: ekranı kaplayan dev MARS yazısı, yağan alaycı emojiler
 * ve altın parıltılar. Kışkırtıcı ama sevimli.
 */
export default function MarsCelebration({ won }: { won: boolean }) {
  const emojis = useMemo(() => {
    const set = won ? ['😂', '🤣', '👑', '🔥', '🎉', '💃'] : ['😂', '🤣', '😜', '🫢', '🙈', '💀'];
    return Array.from({ length: 26 }, (_, i) => ({
      emoji: set[i % set.length],
      left: (i * 37) % 100,
      delay: (i % 9) * 0.18,
      duration: 2.4 + (i % 5) * 0.35,
      size: 22 + ((i * 13) % 22),
    }));
  }, [won]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {/* Yağan emojiler */}
      {emojis.map((e, index) => (
        <motion.span
          key={index}
          initial={{ y: -60, opacity: 0, rotate: -20 }}
          animate={{ y: '110vh', opacity: [0, 1, 1, 0.8], rotate: 20 }}
          transition={{ duration: e.duration, delay: e.delay, ease: 'easeIn' }}
          className="absolute top-0"
          style={{ left: `${e.left}%`, fontSize: e.size }}
        >
          {e.emoji}
        </motion.span>
      ))}

      {/* Dev MARS yazısı */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={{ scale: 0, rotate: -12 }}
          animate={{
            scale: [0, 1.35, 1],
            rotate: [-12, 6, -3],
          }}
          transition={{ duration: 0.9, times: [0, 0.6, 1], type: 'tween', ease: 'easeOut' }}
          className="relative select-none"
        >
          <motion.span
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 0.9 }}
            className="block font-display text-7xl font-black tracking-wider md:text-9xl"
            style={{
              color: '#d4af37',
              textShadow:
                '0 0 24px rgba(212,175,55,0.6), 0 4px 0 #6e2432, 0 8px 0 #4a1620, 0 12px 24px rgba(0,0,0,0.7)',
              WebkitTextStroke: '2px #8e2f3c',
            }}
          >
            MARS!
          </motion.span>
          <motion.span
            animate={{ opacity: [0, 1, 0], scale: [0.8, 1.25, 0.8] }}
            transition={{ repeat: Infinity, duration: 1.6 }}
            className="absolute -top-8 -right-10 text-5xl md:-top-10 md:-right-14 md:text-6xl"
          >
            😂
          </motion.span>
          <motion.span
            animate={{ opacity: [0, 1, 0], scale: [0.8, 1.2, 0.8] }}
            transition={{ repeat: Infinity, duration: 1.6, delay: 0.8 }}
            className="absolute -bottom-6 -left-10 text-5xl md:-bottom-8 md:-left-14 md:text-6xl"
          >
            🤣
          </motion.span>
        </motion.div>
      </div>
    </div>
  );
}
