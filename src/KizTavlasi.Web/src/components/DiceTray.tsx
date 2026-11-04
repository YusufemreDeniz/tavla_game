import Die from './Die';
import { DIE_DROP_MS, scaleDuration, useMotionPrefs } from '../lib/motion';

interface DiceTrayProps {
  dice: [number, number] | null;
  rolling: boolean;
  /** Her yeni atışta değişir; düşüş animasyonunu yeniden başlatır. */
  rollToken: number;
  size?: number;
}

/**
 * Tahtanın ortasındaki zarlar: atılırken döner, sonuç gelince masaya sekerek düşer.
 * Çift zarda arkada altın halka patlar ve zarlar nabız gibi parlar.
 */
export default function DiceTray({ dice, rolling, rollToken, size = 42 }: DiceTrayProps) {
  const prefs = useMotionPrefs();

  if (rolling) {
    return (
      <>
        <Die value={1} rolling size={size} />
        <Die value={6} rolling size={size} />
      </>
    );
  }

  if (!dice) return null;

  const isDouble = dice[0] === dice[1];
  const dropMs = scaleDuration(DIE_DROP_MS, prefs);
  const animate = !prefs.reduced;

  return (
    <div
      key={rollToken}
      data-testid="dice-tray"
      data-double={isDouble ? 'true' : undefined}
      className="relative flex items-center gap-1.5 md:gap-2.5"
    >
      {isDouble && animate && (
        <span
          aria-hidden="true"
          className="anim-double-burst pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(240,205,90,0.55) 0%, rgba(212,175,55,0.18) 45%, transparent 70%)',
          }}
        />
      )}
      {dice.map((value, index) => (
        <span
          key={index}
          className={`relative inline-flex ${animate ? 'anim-die-drop' : ''}`}
          style={
            animate
              ? ({
                  '--drop-x': index === 0 ? '-22px' : '18px',
                  '--drop-rot': index === 0 ? '-150deg' : '130deg',
                  '--drop-duration': `${dropMs}ms`,
                  animationDelay: index === 0 ? '0ms' : `${Math.round(dropMs * 0.12)}ms`,
                } as React.CSSProperties)
              : undefined
          }
        >
          {/* Parıltı ayrı katmanda: tek elemanda iki `animation` sınıfı birbirini ezer. */}
          <span className={`inline-flex ${isDouble && animate ? 'anim-double-glow' : ''}`}>
            <Die value={value} size={size} highlight={isDouble} />
          </span>
        </span>
      ))}
    </div>
  );
}
