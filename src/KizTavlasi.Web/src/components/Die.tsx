import { useId } from 'react';
import { motion } from 'framer-motion';
import { PIP_LAYOUTS } from '../lib/dicePips';

interface DieProps {
  value: number;
  rolling?: boolean;
  size?: number;
  highlight?: boolean;
}

export default function Die({ value, rolling = false, size = 48, highlight = false }: DieProps) {
  const uid = useId();
  const bodyGradId = `die-body-${uid}`;
  const bevelGradId = `die-bevel-${uid}`;
  const pips = PIP_LAYOUTS[value] ?? [];
  const isOne = value === 1;

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={rolling ? 'Zar atılıyor' : `Zar: ${value}`}
      animate={
        rolling
          ? {
              rotate: [0, -18, 95, 200, 360],
              scale: [1, 0.92, 1.08, 0.95, 1],
              y: [0, -4, 2, -2, 0],
            }
          : { rotate: 0, scale: 1, y: 0 }
      }
      transition={
        rolling
          ? { duration: 0.52, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.22, ease: 'easeOut' }
      }
      style={{
        filter: highlight
          ? 'drop-shadow(0 0 8px rgba(212,175,55,0.65)) drop-shadow(0 3px 5px rgba(0,0,0,0.55))'
          : 'drop-shadow(0 3px 5px rgba(0,0,0,0.55))',
      }}
    >
      <defs>
        <radialGradient id={bodyGradId} cx="32%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#fffdf9" />
          <stop offset="55%" stopColor="#f5ebd6" />
          <stop offset="100%" stopColor="#dcc79f" />
        </radialGradient>
        <linearGradient id={bevelGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#6b4a32" stopOpacity="0.45" />
        </linearGradient>
      </defs>

      {/* Dış kemik/fildişi gövde */}
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="20"
        fill={`url(#${bodyGradId})`}
        stroke={highlight ? '#d4af37' : '#533b28'}
        strokeWidth={highlight ? '4.5' : '3.5'}
      />

      {/* İç pah (bevel) halkası */}
      <rect
        x="9"
        y="9"
        width="82"
        height="82"
        rx="15"
        fill="none"
        stroke={`url(#${bevelGradId})`}
        strokeWidth="2"
      />

      {!rolling &&
        pips.map(([cx, cy], index) => (
          <g key={index}>
            <circle
              cx={cx}
              cy={cy + 1.2}
              r={isOne ? '11.5' : '8.8'}
              fill="rgba(255,255,255,0.55)"
            />
            <circle
              cx={cx}
              cy={cy}
              r={isOne ? '11' : '8.5'}
              fill={isOne ? '#8e2f3c' : '#1c1510'}
            />
            {isOne && <circle cx={cx - 2.5} cy={cy - 2.5} r="2.5" fill="rgba(255,235,230,0.45)" />}
          </g>
        ))}

      {rolling && (
        <>
          <circle cx="34" cy="36" r="7" fill="#6b4a32" opacity="0.45" />
          <circle cx="50" cy="50" r="8.5" fill="#8e2f3c" opacity="0.6" />
          <circle cx="66" cy="64" r="7" fill="#6b4a32" opacity="0.45" />
        </>
      )}
    </motion.svg>
  );
}
