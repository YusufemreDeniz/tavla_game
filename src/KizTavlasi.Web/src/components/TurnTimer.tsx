import { useEffect, useMemo, useRef, useState } from 'react';
import { playTickSound } from '../lib/sound';
import { parseServerTime } from '../lib/time';

interface TurnTimerProps {
  deadlineUtc: string;
  /** Snapshot'ın sunucu saati: istemci saat kaymasını düzeltmek için. */
  serverTimeUtc: string;
  limitSeconds: number;
  /** Süre bu oyuncuya aitse son 5 saniyede tık sesi çalar. */
  isMine: boolean;
  soundEnabled: boolean;
}

const URGENT_SECONDS = 5;
const RADIUS = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Hamle süresi halkası. Süre dolduğunda istemci hiçbir şey yapmaz: sunucu otoritesiyle
 * otomatik zar atılır veya geçerli bir hamle oynanır; gösterge yalnızca bilgilendirir.
 */
export default function TurnTimer({
  deadlineUtc,
  serverTimeUtc,
  limitSeconds,
  isMine,
  soundEnabled,
}: TurnTimerProps) {
  // Snapshot alındığı andaki sunucu–istemci saat farkı.
  const clockOffsetMs = useMemo(
    () => parseServerTime(serverTimeUtc) - Date.now(),
    [serverTimeUtc],
  );
  const deadlineMs = useMemo(() => parseServerTime(deadlineUtc), [deadlineUtc]);
  const [now, setNow] = useState(() => Date.now());
  const lastTickSecond = useRef<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, []);

  const remainingMs = Math.max(0, deadlineMs - (now + clockOffsetMs));
  const seconds = Math.ceil(remainingMs / 1000);
  const urgent = seconds <= URGENT_SECONDS;
  // El başı beklemesi süreyi limitten uzun gösterebilir; halka dolu başlar.
  const fraction = Math.min(1, remainingMs / (limitSeconds * 1000));

  useEffect(() => {
    if (!isMine || !soundEnabled || !urgent || seconds === 0) return;
    if (lastTickSecond.current === seconds) return;
    lastTickSecond.current = seconds;
    playTickSound(seconds <= 2);
  }, [seconds, urgent, isMine, soundEnabled]);

  return (
    <div
      role="timer"
      aria-live={urgent ? 'assertive' : 'off'}
      aria-label={seconds > 0 ? `Kalan hamle süresi ${seconds} saniye` : 'Hamle süresi doldu'}
      data-urgent={urgent ? 'true' : undefined}
      className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center ${
        urgent && seconds > 0 ? 'anim-timer-urgent' : ''
      }`}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r={RADIUS} fill="rgba(20,12,4,0.65)" stroke="rgba(255,235,200,0.15)" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={RADIUS}
          fill="none"
          stroke={urgent ? '#e05252' : '#d4af37'}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 0.2s linear, stroke 0.3s' }}
        />
      </svg>
      <span
        className={`relative font-mono text-xs font-bold ${urgent ? 'text-rose-300' : 'text-cream-50'}`}
        aria-hidden="true"
      >
        {seconds}
      </span>
    </div>
  );
}
