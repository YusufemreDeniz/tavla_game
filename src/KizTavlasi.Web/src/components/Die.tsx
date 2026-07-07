import { motion } from 'framer-motion';

const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [30, 30],
    [70, 70],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [30, 30],
    [70, 30],
    [30, 70],
    [70, 70],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [30, 26],
    [70, 26],
    [30, 50],
    [70, 50],
    [30, 74],
    [70, 74],
  ],
};

interface DieProps {
  value: number;
  rolling?: boolean;
  size?: number;
}

export default function Die({ value, rolling = false, size = 48 }: DieProps) {
  const pips = PIP_LAYOUTS[value] ?? [];

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={rolling ? 'Zar atılıyor' : `Zar: ${value}`}
      animate={
        rolling
          ? { rotate: [0, 90, 180, 270, 360], scale: [1, 0.9, 1.05, 0.95, 1] }
          : { rotate: 0, scale: 1 }
      }
      transition={rolling ? { duration: 0.6, repeat: Infinity, ease: 'linear' } : { duration: 0.25 }}
    >
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="18"
        fill="var(--color-cream-50)"
        stroke="var(--color-walnut-700)"
        strokeWidth="4"
      />
      {!rolling &&
        pips.map(([cx, cy], index) => (
          <circle key={index} cx={cx} cy={cy} r="9" fill="var(--color-night-900)" />
        ))}
      {rolling && (
        <circle cx="50" cy="50" r="10" fill="var(--color-copper-500)" opacity="0.6" />
      )}
    </motion.svg>
  );
}
