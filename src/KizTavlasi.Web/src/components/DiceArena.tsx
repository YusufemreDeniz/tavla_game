import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import DieFaces from './DieFaces';
import { scaleDuration, useMotionPrefs, type MotionPrefs } from '../lib/motion';
import {
  MIN_SHAKE_MS,
  SECOND_DIE_DELAY_MS,
  THROW_HEIGHT_EASE,
  THROW_IMPACTS,
  THROW_MS,
  THROW_TIMES,
  handPoses,
  planThrow,
  type DiePlan,
  type ThrowArea,
  type ThrowSide,
} from '../lib/diceThrow';

export interface DiceImpact {
  die: 0 | 1;
  /** 0..1: ilk değme en güçlü, sonraki sekmeler daha hafif. */
  strength: number;
  /** Atışın masaya ilk değmesi (çift zarda masa sarsıntısı burada). */
  first: boolean;
}

interface DiceArenaProps {
  /** Sunucudan gelen sonuç; null = ortada zar yok. */
  dice: [number, number] | null;
  /** Atış istendi, sonuç henüz yok: zarlar elde sallanır. */
  rolling: boolean;
  /** Zarları atan oyuncunun tarafı: benim atışım alttan, rakibinki üstten fırlatılır. */
  side: ThrowSide;
  /** İniş bölgesinin merkezi (alanın oranı): boş kanadın ortası. */
  zone?: { cx: number; cy: number; spread?: number };
  /** Her yeni atışta değişir. */
  rollToken: number;
  /** Hamlesi oynanan (veya boşa giden) zar soluklaşır. */
  used: [boolean, boolean];
  onImpact?: (impact: DiceImpact) => void;
  onSettled?: (info: { isDouble: boolean }) => void;
}

function useArenaSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 340, h: 360 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      setSize((prev) =>
        Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1
          ? prev
          : { w: r.width, h: r.height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function cubeBox(size: number): React.CSSProperties {
  return { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 };
}

const SHADOW_STYLE: React.CSSProperties = {
  background: 'rgba(18, 9, 2, 0.95)',
  filter: 'blur(3px)',
  borderRadius: '22%',
};

/** Zarlar oyuncunun elinde: sonuç gelene kadar hafifçe sallanır (yüzler gerçek küp yüzleridir). */
function HandDice({ area }: { area: ThrowArea }) {
  const { size } = area;
  return (
    <>
      {handPoses(area).map((pose, i) => (
        <motion.div
          key={i}
          data-testid="hand-die"
          aria-hidden="true"
          className="absolute left-0 top-0"
          style={cubeBox(size)}
          initial={{ x: pose.x, y: pose.y, rotate: pose.tilt, scale: 1.12 }}
          animate={{
            x: [pose.x, pose.x - 4, pose.x + 4, pose.x - 3, pose.x + 3, pose.x],
            y: [pose.y, pose.y + 3, pose.y - 3, pose.y + 4, pose.y - 2, pose.y],
            rotate: [
              pose.tilt,
              pose.tilt - 7,
              pose.tilt + 7,
              pose.tilt - 5,
              pose.tilt + 6,
              pose.tilt,
            ],
          }}
          transition={{ duration: 0.34, repeat: Infinity, ease: 'easeInOut', delay: i * 0.05 }}
        >
          <div className="absolute inset-0" style={{ ...SHADOW_STYLE, transform: 'translate(5px, 8px)', opacity: 0.32 }} />
          <div className="absolute inset-0" style={{ perspective: size * 7 }}>
            <motion.div
              className="h-full w-full will-change-transform"
              style={{ transformStyle: 'preserve-3d' }}
              initial={{ rotateX: pose.cubeX, rotateY: pose.cubeY }}
              animate={{
                rotateX: [pose.cubeX, pose.cubeX + 14, pose.cubeX - 10, pose.cubeX + 8, pose.cubeX],
                rotateY: [pose.cubeY, pose.cubeY - 12, pose.cubeY + 10, pose.cubeY - 8, pose.cubeY],
              }}
              transition={{ duration: 0.34, repeat: Infinity, ease: 'easeInOut', delay: i * 0.05 }}
            >
              <DieFaces size={size} />
            </motion.div>
          </div>
        </motion.div>
      ))}
    </>
  );
}

interface ThrownDiceProps {
  plans: [DiePlan, DiePlan];
  size: number;
  used: [boolean, boolean];
  prefs: MotionPrefs;
  onImpactRef: React.RefObject<DiceArenaProps['onImpact']>;
  onSettledRef: React.RefObject<DiceArenaProps['onSettled']>;
}

const last = (values: number[]) => values[values.length - 1];

/** Fırlatılmış zarlar: havada döner, 3 kez seker, sürtünmeyle durur ve hamleler bitene kadar tahtada kalır. */
function ThrownDice({ plans, size, used, prefs, onImpactRef, onSettledRef }: ThrownDiceProps) {
  const { reduced } = prefs;
  const totalMs = scaleDuration(THROW_MS, prefs);
  const secondDelayMs = scaleDuration(SECOND_DIE_DELAY_MS, prefs);
  const isDouble = plans[0].value === plans[1].value;
  const duration = totalMs / 1000;

  // Ses ve masa sarsıntısı, zarın masaya GERÇEKTEN değdiği anlarla eşzamanlıdır.
  useEffect(() => {
    if (reduced) {
      onImpactRef.current?.({ die: 0, strength: 0.6, first: true });
      onSettledRef.current?.({ isDouble });
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    ([0, 1] as const).forEach((die) => {
      const delay = die * secondDelayMs;
      THROW_IMPACTS.forEach((impact, k) => {
        timers.push(
          setTimeout(
            () =>
              onImpactRef.current?.({
                die,
                strength: impact.strength,
                first: die === 0 && k === 0,
              }),
            delay + impact.at * totalMs,
          ),
        );
      });
    });
    timers.push(
      setTimeout(() => onSettledRef.current?.({ isDouble }), secondDelayMs + totalMs),
    );
    return () => timers.forEach(clearTimeout);
  }, [reduced, totalMs, secondDelayMs, isDouble, onImpactRef, onSettledRef]);

  return (
    <>
      {plans.map((plan, i) => {
        const delay = (i * secondDelayMs) / 1000;
        const times = THROW_TIMES;
        const rest = { x: last(plan.x), y: last(plan.y) };
        return (
          <div key={i} data-testid="thrown-die" data-value={plan.value} className="contents">
            {/* Gölge: zemin izdüşümü; zar yükseldikçe sağ alta uzaklaşır, büyür ve silikleşir. */}
            <motion.div
              aria-hidden="true"
              className="absolute left-0 top-0"
              style={{ ...cubeBox(size * 0.94), ...SHADOW_STYLE }}
              initial={
                reduced
                  ? false
                  : {
                      x: plan.shadowX[0],
                      y: plan.shadowY[0],
                      scale: plan.shadowScale[0],
                      opacity: plan.shadowOpacity[0],
                      rotate: plan.rotateZ[0],
                    }
              }
              animate={
                reduced
                  ? {
                      x: last(plan.shadowX),
                      y: last(plan.shadowY),
                      scale: 1,
                      opacity: last(plan.shadowOpacity),
                      rotate: plan.rest.tilt,
                    }
                  : {
                      x: plan.shadowX,
                      y: plan.shadowY,
                      scale: plan.shadowScale,
                      opacity: plan.shadowOpacity,
                      rotate: plan.rotateZ,
                    }
              }
              transition={{ duration, delay, times, ease: 'linear', scale: { duration, delay, times, ease: THROW_HEIGHT_EASE } }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
            />
            <motion.div
              className="absolute left-0 top-0 will-change-transform"
              style={cubeBox(size)}
              initial={
                reduced
                  ? false
                  : { x: plan.x[0], y: plan.y[0], scale: plan.scale[0], rotate: plan.rotateZ[0] }
              }
              animate={
                reduced
                  ? { x: rest.x, y: rest.y, scale: 1, rotate: plan.rest.tilt }
                  : { x: plan.x, y: plan.y, scale: plan.scale, rotate: plan.rotateZ }
              }
              transition={{
                duration,
                delay,
                times,
                ease: 'linear',
                scale: { duration, delay, times, ease: THROW_HEIGHT_EASE },
              }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
            >
              {/* Kullanılan zar soluklaşır ve hafifçe küçülür; çift zarda ikisi birden. */}
              <motion.div
                className="absolute inset-0"
                style={{
                  perspective: size * 7,
                  filter: isDouble ? 'drop-shadow(0 0 5px rgba(212,175,55,0.55))' : undefined,
                }}
                animate={{ opacity: used[i] ? 0.42 : 1, scale: used[i] ? 0.94 : 1 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  role="img"
                  aria-label={`Zar: ${plan.value}`}
                  className="h-full w-full will-change-transform"
                  style={{ transformStyle: 'preserve-3d' }}
                  initial={reduced ? false : { rotateX: plan.cubeX[0], rotateY: plan.cubeY[0] }}
                  animate={
                    reduced
                      ? { rotateX: last(plan.cubeX), rotateY: last(plan.cubeY) }
                      : { rotateX: plan.cubeX, rotateY: plan.cubeY }
                  }
                  transition={{ duration, delay, times, ease: 'linear' }}
                >
                  <DieFaces size={size} highlight={isDouble} />
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        );
      })}
    </>
  );
}

/**
 * Zar atış alanı: tahtanın üstünde, tıklamaları engellemeyen bir katman.
 *
 * Zarlar önce atan oyuncunun elinde sallanır; sunucu sonucu gelince tahtaya fırlatılır. Sonuç
 * erken gelse bile sallama en az {@link MIN_SHAKE_MS} sürer (rakibin atışı da "elden" çıkar).
 * Katman yalnızca görseldir: sonuç, sıra ve hamleler sunucudan gelir.
 */
export default function DiceArena({
  dice,
  rolling,
  side,
  zone,
  rollToken,
  used,
  onImpact,
  onSettled,
}: DiceArenaProps) {
  const prefs = useMotionPrefs();
  const ref = useRef<HTMLDivElement | null>(null);
  const { w, h } = useArenaSize(ref);
  const size = Math.round(Math.min(56, Math.max(38, w * 0.125)));

  const onImpactRef = useRef(onImpact);
  const onSettledRef = useRef(onSettled);
  useLayoutEffect(() => {
    onImpactRef.current = onImpact;
    onSettledRef.current = onSettled;
  });

  // Sallamanın başladığı an: hangi atış olursa olsun, en az MIN_SHAKE_MS elde kalır.
  const shakeStart = useRef<number | null>(null);
  const hadDice = useRef(false);
  useEffect(() => {
    const now = performance.now();
    if (dice) {
      if (!hadDice.current && shakeStart.current === null) shakeStart.current = now;
    } else {
      if (hadDice.current) shakeStart.current = null;
      if (rolling) shakeStart.current ??= now;
      else shakeStart.current = null;
    }
    hadDice.current = dice !== null;
  }, [rolling, dice]);

  const [launchedToken, setLaunchedToken] = useState<number | null>(null);
  const { reduced, fast } = prefs;
  useEffect(() => {
    if (!dice) return;
    const minShake = scaleDuration(MIN_SHAKE_MS, { reduced, fast });
    const elapsed = shakeStart.current === null ? 0 : performance.now() - shakeStart.current;
    const wait = Math.max(0, minShake - elapsed);
    const timer = setTimeout(() => setLaunchedToken(rollToken), wait);
    return () => clearTimeout(timer);
  }, [dice, rollToken, reduced, fast]);

  const cx = zone?.cx;
  const cy = zone?.cy;
  const spread = zone?.spread;
  const area: ThrowArea = useMemo(
    () => ({ w, h, size, side, cx, cy, spread }),
    [w, h, size, side, cx, cy, spread],
  );
  const die0 = dice?.[0];
  const die1 = dice?.[1];
  const plans = useMemo(
    () =>
      die0 !== undefined && die1 !== undefined
        ? planThrow([die0, die1], rollToken * 9973 + 17, area)
        : null,
    [die0, die1, rollToken, area],
  );

  const thrown = plans !== null && launchedToken === rollToken;
  const shaking = !thrown && !reduced && (rolling || dice !== null);

  return (
    <div
      ref={ref}
      data-testid="dice-arena"
      data-phase={thrown ? 'thrown' : shaking ? 'shaking' : 'idle'}
      className="pointer-events-none absolute inset-0 z-40"
    >
      {shaking && <HandDice area={area} />}
      <AnimatePresence>
        {thrown && (
          <ThrownDice
            key={rollToken}
            plans={plans}
            size={size}
            used={used}
            prefs={prefs}
            onImpactRef={onImpactRef}
            onSettledRef={onSettledRef}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
