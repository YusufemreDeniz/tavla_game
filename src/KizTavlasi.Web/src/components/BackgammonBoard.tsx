import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, type Easing } from 'framer-motion';
import type { PlayerBoardDto } from '../types/game';
import { detectPieceMove, pieceKey, railKey, type PieceMove } from '../lib/boardDiff';
import { flightDuration, scaleDuration, useMotionPrefs } from '../lib/motion';
import { useBoardOrientation, type BoardOrientation } from '../lib/useBoardOrientation';
import { FELT_TEXTURE, MAPLE_TEXTURE, WALNUT_TEXTURE } from '../lib/woodTexture';

/**
 * Gerçek bir tavla masası: kumaş kaplı masanın üstünde, kakmalı ceviz çerçeveli, 24 haneli tahta.
 * İki kanat (12'şer hane: 6 üstte + 6 altta), ortada menteşe, sağda toplama tepsileri.
 * Kız Tavlası'nda yalnızca iki çeyrek (oyuncuların 6'şar hanesi) oynanır; kalan haneler boş ama
 * çizili kalır ve zarlar boş kanada atılır.
 *
 * Geniş ekran: yatay (menteşe dikey; kanatlar solda/sağda).
 * Telefon: dikey (menteşe yatay; kanatlar üstte/altta) — hane satırları parmakla basılacak kadar yüksek.
 *
 * Pul kimliği: pullar hanede kenardan ortaya doğru sıra numarasıyla (slot) anahtarlanır; indirilen
 * pul aynı DOM düğümü olarak kalır, yalnızca boşluğun ötesine itilir. Hareket FLIP ile tek bir
 * üst katmanda oynatılır. Işık tek kaynak, sol üstten: tüm gölgeler sağ alta düşer.
 */

export interface PointFlash {
  point: number;
  token: number;
}

type Side = 'top' | 'bottom' | 'left' | 'right';

const MINE_CHECKER =
  'radial-gradient(circle at 32% 28%, #c0687a 0%, #983342 38%, #631d29 76%, #3f121a 100%)';
const THEIR_CHECKER =
  'radial-gradient(circle at 32% 28%, #fffefb 0%, #f5ebd6 38%, #dcc7a1 76%, #b59a70 100%)';
const MINE_RAIL = 'linear-gradient(180deg, #b85264 0%, #5c1d29 100%)';
const THEIR_RAIL = 'linear-gradient(180deg, #fdfaf2 0%, #cbb790 100%)';

/** Mobilde basılı tutma önizlemesi için bekleme süresi. */
const LONG_PRESS_MS = 280;
/** Öne itilmiş (inmiş) pulları ayıran boşluk: pul çapının %80'i. */
const GAP_RATIO = 0.8;
const PIECE_GAP_PX = 2;
/** İstif bu sayıdan büyükse adet rozeti görünür (normalde pullar sayılabilir). */
const BADGE_MIN_STACK = 6;

const GEOMETRY: Record<
  Side,
  {
    vertical: boolean;
    clip: string;
    outline: string;
    angle: string;
    flex: string;
    forward: [number, number];
    glowAt: string;
  }
> = {
  top: {
    vertical: true,
    clip: 'polygon(0 0, 100% 0, 50% 100%)',
    outline: 'polygon(0 0, 100% 0, 50% 100%, 47% 94%, 94% 3%, 6% 3%, 53% 94%)',
    angle: '180deg',
    flex: 'flex-col',
    forward: [0, 1],
    glowAt: '50% 35%',
  },
  bottom: {
    vertical: true,
    clip: 'polygon(50% 0, 0 100%, 100% 100%)',
    outline: 'polygon(50% 0, 0 100%, 100% 100%, 94% 97%, 50% 8%, 6% 97%)',
    angle: '0deg',
    flex: 'flex-col-reverse',
    forward: [0, -1],
    glowAt: '50% 65%',
  },
  left: {
    vertical: false,
    clip: 'polygon(0 0, 100% 50%, 0 100%)',
    outline: 'polygon(0 0, 0 100%, 100% 50%, 94% 47%, 3% 94%, 3% 6%, 94% 53%)',
    angle: '90deg',
    flex: 'flex-row',
    forward: [1, 0],
    glowAt: '35% 50%',
  },
  right: {
    vertical: false,
    clip: 'polygon(100% 0, 0 50%, 100% 100%)',
    outline: 'polygon(100% 0, 100% 100%, 0 50%, 6% 47%, 97% 94%, 97% 6%, 6% 53%)',
    angle: '270deg',
    flex: 'flex-row-reverse',
    forward: [-1, 0],
    glowAt: '65% 50%',
  },
};

/** Pulun görsel yüzeyi: yan yüzey kalınlığı + turnalanmış halkalar; tahtada ve uçuş katmanında ortak. */
function CheckerFace({ isMine, shadow = true }: { isMine: boolean; shadow?: boolean }) {
  return (
    <>
      {/* Kenar kalınlığı: ışık sol üstten, bu yüzden koyu şerit sağ-altta görünür. */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          transform: 'translate(1px, 2.5px)',
          background: isMine ? '#33101a' : '#86704c',
          boxShadow: shadow ? '2px 4px 4px rgba(0,0,0,0.45)' : undefined,
        }}
      />
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: isMine ? MINE_CHECKER : THEIR_CHECKER,
          boxShadow: [
            '0 0 0 1px rgba(0,0,0,0.3)',
            'inset 1px 1.5px 1.5px rgba(255,255,255,0.5)',
            'inset -1.5px -2px 3px rgba(0,0,0,0.34)',
          ].join(', '),
        }}
      />
      {[6, 16, 30].map((inset, i) => (
        <span
          key={inset}
          className="absolute rounded-full"
          style={{
            inset: `${inset}%`,
            border: isMine
              ? `1px solid rgba(255,220,225,${0.3 - i * 0.04})`
              : `1px solid rgba(120,85,50,${0.34 - i * 0.04})`,
            borderBottomColor: isMine ? 'rgba(20,0,5,0.35)' : 'rgba(90,60,30,0.4)',
            background:
              i === 2
                ? `radial-gradient(circle at 40% 35%, rgba(255,255,255,${isMine ? 0.2 : 0.48}), transparent 65%)`
                : undefined,
          }}
        />
      ))}
    </>
  );
}

/** Toplama tepsisinde yan yatmış pul (yandan görünüm); raydaki pul ve uçuşun varış karesi aynı görünür. */
function railPieceStyle(isMine: boolean): React.CSSProperties {
  return {
    background: isMine ? MINE_RAIL : THEIR_RAIL,
    boxShadow:
      '1px 1px 2px rgba(0,0,0,0.55), inset 0 1px 1px rgba(255,255,255,0.38), inset 0 -2px 1px rgba(0,0,0,0.34)',
  };
}

type CheckerMode = 'normal' | 'hint' | 'pressed';

const Checker = memo(function Checker({
  isMine,
  side,
  dataKey,
  mode = 'normal',
  lifted = false,
  ghost = false,
}: {
  isMine: boolean;
  side: Side;
  dataKey?: string;
  /** hint: oynanabilir pul hafifçe kalkık; pressed: dokunuldu, hareketine başlıyor. */
  mode?: CheckerMode;
  /** Önizlemede hareket edecek pul: yerinde soluklaşır. */
  lifted?: boolean;
  /** Önizlemede pulun varacağı yeri gösteren hayalet pul. */
  ghost?: boolean;
}) {
  const geo = GEOMETRY[side];
  const [fx, fy] = geo.forward;
  const lift = mode === 'pressed' ? 6 : mode === 'hint' ? 3 : 0;
  const scale = mode === 'pressed' ? 1.1 : mode === 'hint' ? 1.06 : 1;
  const ghostCalc = (f: number) => (f === 0 ? '0' : `calc(${f * GAP_RATIO * 100}% + ${f * PIECE_GAP_PX}px)`);

  return (
    <div
      data-piece={dataKey}
      data-variant={lifted ? 'lifted' : undefined}
      data-mode={mode === 'normal' ? undefined : mode}
      className={`relative aspect-square shrink-0 rounded-full ${
        geo.vertical ? 'w-[76%] max-w-11' : 'h-[76%] max-h-11'
      }`}
      aria-hidden="true"
    >
      <div
        className="anim-piece-in absolute inset-0 transition-[opacity,transform,filter] duration-200"
        style={{
          opacity: lifted ? 0.4 : undefined,
          transform: lift ? `translate(${fx * lift}px, ${fy * lift}px) scale(${scale})` : undefined,
          filter: lift ? 'drop-shadow(3px 5px 3px rgba(0,0,0,0.35))' : undefined,
        }}
      >
        <CheckerFace isMine={isMine} />
      </div>
      {ghost && (
        <div
          data-variant="ghost"
          className="anim-ghost absolute inset-0 rounded-full"
          style={{
            transform: `translate(${ghostCalc(fx)}, ${ghostCalc(fy)})`,
            outline: '2px dashed rgba(212,175,55,0.9)',
            outlineOffset: '1px',
          }}
        >
          <CheckerFace isMine={isMine} shadow={false} />
        </div>
      )}
    </div>
  );
});

/** Hanenin üçgeni: kakma ahşap gibi (kenarda ince gölge ve parlaklık) + yumuşak ışık katmanı. */
function PointArt({
  side,
  dark,
  glow,
  flashToken,
}: {
  side: Side;
  dark: boolean;
  glow: boolean;
  flashToken: number | null;
}) {
  const geo = GEOMETRY[side];
  const fill = dark
    ? `linear-gradient(${geo.angle}, #8a4a22 0%, #6d3a1a 60%, #542c12 100%)`
    : `linear-gradient(${geo.angle}, #efdcae 0%, #e2c893 60%, #cbab72 100%)`;
  const anchor = (
    geo.vertical
      ? { left: '6%', right: '6%', height: '88%', [side]: 0 }
      : { top: '6%', bottom: '6%', width: '88%', [side]: 0 }
  ) as React.CSSProperties;

  return (
    <>
      <div aria-hidden="true" className="absolute" style={{ ...anchor, filter: 'drop-shadow(1px 1.5px 1px rgba(40,18,4,0.45))' }}>
        <div className="h-full w-full" style={{ clipPath: geo.clip, background: fill }} />
      </div>
      <div
        aria-hidden="true"
        className="absolute"
        style={{
          ...anchor,
          clipPath: geo.outline,
          background: dark ? 'rgba(240,220,180,0.3)' : 'rgba(90,50,20,0.28)',
        }}
      />
      <div
        key={flashToken ?? 'steady'}
        aria-hidden="true"
        data-glow={glow || flashToken !== null ? 'on' : undefined}
        className={`point-glow pointer-events-none absolute inset-0 ${flashToken !== null ? 'point-glow-flash' : ''}`}
        style={{
          background: `radial-gradient(ellipse 75% 70% at ${geo.glowAt}, rgba(255,228,150,0.62), rgba(255,228,150,0) 72%)`,
        }}
      />
    </>
  );
}

type PreviewKind = 'advance' | 'collect';

interface PointProps {
  playerId: string;
  pointNumber: number;
  backCount: number;
  frontCount: number;
  isMine: boolean;
  side: Side;
  colorIndex: number;
  collecting: boolean;
  clickable: boolean;
  flashToken: number | null;
  /** Bu hane şu an önizleniyorsa hamle türü (yalnızca görsel). */
  preview: PreviewKind | null;
  onPick?: (pointNumber: number) => void;
  onPreview?: (pointNumber: number | null) => void;
}

const Point = memo(function Point({
  playerId,
  pointNumber,
  backCount,
  frontCount,
  isMine,
  side,
  colorIndex,
  collecting,
  clickable,
  flashToken,
  preview,
  onPick,
  onPreview,
}: PointProps) {
  const geo = GEOMETRY[side];
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const [pressed, setPressed] = useState(false);

  useEffect(
    () => () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    },
    [],
  );

  // Dokunulan pul hareketine başlar; sunucu yanıtı (sayılar değişince) veya kısa süre sonra sıfırlanır.
  useEffect(() => {
    setPressed(false);
  }, [backCount, frontCount]);
  useEffect(() => {
    if (!pressed) return;
    const timer = setTimeout(() => setPressed(false), 1500);
    return () => clearTimeout(timer);
  }, [pressed]);

  const totalPieces = backCount + frontCount;
  // Oynanacak pul: indirmede arka grubun son pulu, toplamada hanedeki en öndeki pul.
  const movableSlot = collecting ? totalPieces - 1 : backCount - 1;
  const liftedSlot = preview ? movableSlot : -1;

  // Pullar kenardan ortaya doğru slot sırasıyla dizilir; inmişlerle inmemişler arasında fiziksel boşluk kalır.
  const pieces: React.ReactNode[] = [];
  for (let slot = 0; slot < totalPieces; slot += 1) {
    if (slot === backCount && backCount > 0 && frontCount > 0) {
      pieces.push(
        <div
          key="gap"
          data-gap="true"
          aria-hidden="true"
          className={`shrink-0 ${geo.vertical ? 'w-[76%] max-w-11' : 'h-[76%] max-h-11'}`}
          style={{ aspectRatio: geo.vertical ? `1 / ${GAP_RATIO}` : `${GAP_RATIO} / 1` }}
        />,
      );
    }
    const isMovable = clickable && slot === movableSlot;
    pieces.push(
      <Checker
        key={slot}
        side={side}
        dataKey={pieceKey(playerId, pointNumber, slot)}
        isMine={isMine}
        mode={isMovable ? (pressed ? 'pressed' : 'hint') : 'normal'}
        lifted={slot === liftedSlot}
        ghost={preview === 'advance' && slot === liftedSlot}
      />,
    );
  }

  const labelPos: Record<Side, string> = {
    top: 'inset-x-0 bottom-0.5 justify-center',
    bottom: 'inset-x-0 top-0.5 justify-center',
    left: 'inset-y-0 right-1 flex-col justify-center',
    right: 'inset-y-0 left-1 flex-col justify-center',
  };

  const content = (
    <>
      <PointArt side={side} dark={colorIndex % 2 === 0} glow={clickable} flashToken={flashToken} />

      <div
        className={`absolute inset-0 flex items-center ${geo.flex} ${
          geo.vertical ? 'px-[7%] py-[4%]' : 'px-[4%] py-[7%]'
        }`}
        style={{ gap: PIECE_GAP_PX }}
      >
        {pieces}
      </div>

      {/* Hane numarası: kakma pirinç rakam gibi çok soluk; adet rozeti yalnızca istif sayılamayacak kadar büyükse. */}
      <div className={`pointer-events-none absolute z-10 flex items-center gap-0.5 ${labelPos[side]}`} aria-hidden="true">
        <span
          className="font-display text-[10px] font-bold leading-none md:text-[11px]"
          style={{ color: '#6b4a1e', opacity: 0.38, textShadow: '1px 1px 0 rgba(255,245,215,0.5)' }}
        >
          {pointNumber}
        </span>
        {totalPieces >= BADGE_MIN_STACK && (
          <span className="rounded-full bg-black/60 px-1 py-0.5 font-mono text-[9px] font-semibold leading-none text-cream-100">
            {totalPieces}
          </span>
        )}
      </div>
    </>
  );

  if (clickable) {
    const clearLongPress = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    return (
      <button
        type="button"
        onClick={() => {
          // Basılı tutarak önizleme yapıldıysa bırakmak hamle oynamaz; kısa dokunuş oynar.
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          setPressed(true);
          onPick?.(pointNumber);
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') onPreview?.(pointNumber);
        }}
        onPointerLeave={(e) => {
          clearLongPress();
          if (e.pointerType === 'mouse') onPreview?.(null);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          longPressed.current = false;
          clearLongPress();
          longPressTimer.current = setTimeout(() => {
            longPressed.current = true;
            onPreview?.(pointNumber);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={(e) => {
          clearLongPress();
          if (e.pointerType !== 'mouse' && longPressed.current) onPreview?.(null);
        }}
        onPointerCancel={() => {
          clearLongPress();
          longPressed.current = false;
          onPreview?.(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
        onFocus={() => onPreview?.(pointNumber)}
        onBlur={() => onPreview?.(null)}
        aria-label={`${pointNumber}. haneyi oyna`}
        data-clickable="true"
        className="relative block h-full min-h-9 w-full min-w-0 cursor-pointer touch-manipulation select-none rounded-md ring-1 ring-inset ring-gold-400/55 [-webkit-touch-callout:none]"
      >
        {content}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={`${pointNumber}. hane: inmemiş ${backCount}, inmiş ${frontCount} pul`}
      className="relative h-full min-w-0"
    >
      {content}
    </div>
  );
});

/** Oynanmayan (boş) hane: yalnızca çizili üçgen. */
const EmptyPoint = memo(function EmptyPoint({
  side,
  colorIndex,
  style,
}: {
  side: Side;
  colorIndex: number;
  style: React.CSSProperties;
}) {
  return (
    <div aria-hidden="true" data-empty="true" className="relative h-full min-w-0" style={style}>
      <PointArt side={side} dark={colorIndex % 2 === 0} glow={false} flashToken={null} />
    </div>
  );
});

function Hinge({ vertical, style }: { vertical: boolean; style: React.CSSProperties }) {
  const brass = {
    background: 'linear-gradient(180deg, #e8d49a, #a68334 50%, #d9c078)',
    boxShadow: '1px 1.5px 2px rgba(0,0,0,0.6)',
  };
  return (
    <div
      aria-hidden="true"
      className="relative"
      style={{
        ...style,
        background: vertical
          ? 'linear-gradient(90deg, #3a2110, #5c391d 45%, #6b4426 55%, #33200f)'
          : 'linear-gradient(180deg, #3a2110, #5c391d 45%, #6b4426 55%, #33200f)',
        boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.7), inset -1px -1px 2px rgba(255,220,170,0.15)',
      }}
    >
      {[12, 88].map((at) => (
        <span
          key={at}
          className="absolute rounded-sm"
          style={{
            ...brass,
            ...(vertical
              ? { left: '50%', top: `${at}%`, width: 8, height: 22, transform: 'translate(-50%, -50%)' }
              : { top: '50%', left: `${at}%`, height: 8, width: 22, transform: 'translate(-50%, -50%)' }),
          }}
        />
      ))}
    </div>
  );
}

const TRAY_PIECE = 'max(5px, 5%)';

/** Toplama tepsisi: pullar yan yatmış olarak, oyuncunun kenarından başlayarak istiflenir. */
const Tray = memo(function Tray({
  playerId,
  count,
  isMine,
  side,
  ghost,
  label,
  style,
}: {
  playerId: string;
  count: number;
  isMine: boolean;
  side: Side;
  ghost: boolean;
  label: string;
  style: React.CSSProperties;
}) {
  const vertical = GEOMETRY[side].vertical;
  const piece = (extra: React.CSSProperties): React.CSSProperties => ({
    ...railPieceStyle(isMine),
    borderRadius: 3,
    ...(vertical ? { width: '100%', height: TRAY_PIECE } : { height: '100%', width: TRAY_PIECE }),
    ...extra,
  });

  return (
    <div
      role="group"
      aria-label={label}
      className="relative min-h-0 min-w-0 rounded-sm p-[3px]"
      style={{
        ...style,
        background: 'linear-gradient(180deg, #3a2110, #241305)',
        boxShadow: 'inset 2px 3px 8px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,220,160,0.1)',
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-1 top-0.5 font-mono text-[8px] font-bold leading-none text-gold-400/50"
      >
        {count}
      </span>
      <div
        className={`flex h-full w-full gap-[2px] ${GEOMETRY[side].flex}`}
      >
        {ghost && (
          <span
            data-variant="ghost"
            aria-hidden="true"
            className="anim-ghost block"
            style={piece({ opacity: 0.5, outline: '1px dashed rgba(212,175,55,0.95)' })}
          />
        )}
        {Array.from({ length: count }).map((_, i) => (
          <span
            // En yeni pul en uçta: anahtar toplanma sırası, böylece yalnızca yeni pul mount olur.
            key={count - 1 - i}
            data-piece={railKey(playerId, count - 1 - i)}
            className="anim-piece-in block"
            style={piece({})}
          />
        ))}
      </div>
    </div>
  );
});

interface QuarterProps {
  board: PlayerBoardDto;
  name: string;
  isMine: boolean;
  side: Side;
  vertical: boolean;
  colorOffset: number;
  clickablePoints: number[];
  flash: PointFlash | null;
  onPick?: (pointNumber: number) => void;
  style: React.CSSProperties;
  onPreviewKind: (point: number | null, kind: PreviewKind) => void;
}

/** Bir oyuncunun çeyreği: 6 hane. */
const Quarter = memo(function Quarter({
  board,
  name,
  isMine,
  side,
  vertical,
  colorOffset,
  clickablePoints,
  flash,
  onPick,
  style,
  onPreviewKind,
}: QuarterProps) {
  const [previewPoint, setPreviewPoint] = useState<number | null>(null);
  const activePreview =
    previewPoint !== null && clickablePoints.includes(previewPoint) ? previewPoint : null;
  const previewKind: PreviewKind = board.isCollecting ? 'collect' : 'advance';

  // Tepsinin hayalet pulu için üst bileşene bildir.
  useEffect(() => {
    onPreviewKind(activePreview, previewKind);
  }, [activePreview, previewKind, onPreviewKind]);

  return (
    <div
      role="region"
      aria-label={`${name} tahtası${board.isCollecting ? ' (toplama aşamasında)' : ' (indirme aşamasında)'}`}
      className="grid min-h-0 min-w-0"
      style={{
        ...style,
        ...(vertical
          ? { gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }
          : { gridTemplateRows: 'repeat(6, minmax(0, 1fr))' }),
      }}
    >
      {board.points.map((point, index) => (
        <Point
          key={point.pointNumber}
          playerId={board.playerId}
          pointNumber={point.pointNumber}
          backCount={point.backCount}
          frontCount={point.frontCount}
          isMine={isMine}
          side={side}
          colorIndex={colorOffset + index}
          collecting={board.isCollecting}
          clickable={clickablePoints.includes(point.pointNumber)}
          flashToken={flash?.point === point.pointNumber ? flash.token : null}
          preview={activePreview === point.pointNumber ? previewKind : null}
          onPick={onPick}
          onPreview={onPick ? setPreviewPoint : undefined}
        />
      ))}
    </div>
  );
});

function PlayerChip({
  name,
  isMine,
  isTurn,
  board,
}: {
  name: string;
  isMine: boolean;
  isTurn: boolean;
  board: PlayerBoardDto;
}) {
  const remaining = board.points.reduce((sum, p) => sum + Math.max(0, p.backCount - 1), 0);
  return (
    <div
      data-active={isTurn ? 'true' : 'false'}
      className={`flex min-w-0 items-center gap-1.5 rounded-pill border px-2 py-0.5 font-ui text-micro text-fg-secondary transition-colors duration-(--duration-fast) ${
        isTurn ? 'border-line-selected bg-surface-raised' : 'border-transparent'
      }`}
    >
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/25"
        style={{ backgroundColor: isMine ? '#8e2f3c' : '#f2e8d2' }}
      />
      <span className="truncate font-semibold text-fg-primary">{name}</span>
      <span
        className={`shrink-0 rounded-pill border px-2 py-0.5 text-micro font-medium ${
          board.isCollecting
            ? 'border-line-accent bg-surface-input text-fg-accent'
            : 'border-line-subtle bg-surface-input text-fg-secondary'
        }`}
      >
        {board.isCollecting ? `Toplama · ${board.collectedCount}/15` : `İndirme · ${9 - remaining}/9`}
      </span>
    </div>
  );
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Flight {
  id: number;
  kind: PieceMove['kind'];
  isMine: boolean;
  from: Box;
  to: Box;
  toKey: string;
  durationMs: number;
}

/** Kök kapsayıcıya göre tüm pul kutularını ölçer (scroll'dan bağımsız). */
function measurePieces(root: HTMLElement): Map<string, Box> {
  const origin = root.getBoundingClientRect();
  const boxes = new Map<string, Box>();
  root.querySelectorAll<HTMLElement>('[data-piece]').forEach((el) => {
    const key = el.dataset.piece;
    if (!key) return;
    const r = el.getBoundingClientRect();
    boxes.set(key, { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
  });
  return boxes;
}

function findPiece(root: HTMLElement, key: string): HTMLElement | null {
  // Anahtarlar yalnızca GUID, rakam, harf ve ':' içerir; tırnaklı seçicide kaçış gerekmez.
  return root.querySelector<HTMLElement>(`[data-piece="${key}"]`);
}

/**
 * Uçuş zaman çizelgesi (sürenin oranı olarak):
 *  0 → .20  kalkış: pul masadan ayrılır (ölçek ~1.08, gölge büyür ve uzaklaşır)
 * .20 → .50  yaklaşma: yay çizerek hızlanır
 * .50 → .78  ease-out ile yavaşlayıp hedefe iner; .78'de masaya değer (ses burada)
 * .78 → .88  küçük sekme (hafif kalkış)  ·  .88 → 1  yerine oturur, gölge küçülür
 */
const FLIGHT_TIMES = [0, 0.2, 0.5, 0.78, 0.88, 1];
const FLIGHT_PROGRESS = [0, 0.06, 0.55, 1, 1, 1];
const FLIGHT_HEIGHT = [0, 1, 1, 0, 0.35, 0];
const FLIGHT_SQUASH_X = [1, 1, 1, 1.06, 1, 1];
const FLIGHT_SQUASH_Y = [1, 1, 1, 0.94, 1, 1];
const LIFT_SCALE = 0.08;
/** Toplamada diskten yan yatmış pula geçiş (0 = disk, 1 = yan yatmış). */
const FLIGHT_FLAT = [0, 0, 0, 1, 1, 1];

const MOVE_EASE: Easing[] = ['easeOut', 'linear', 'easeOut', 'linear', 'linear'];
const HEIGHT_EASE: Easing[] = ['easeOut', 'linear', 'easeIn', 'easeOut', 'easeIn'];

/** Ağırlık hissi veren uçuş: kalkış, yay, ease-out ile iniş, küçük sekme, oturma. */
function FlyingPiece({ flight, onDone }: { flight: Flight; onDone: (flight: Flight) => void }) {
  const { from, to, kind, isMine } = flight;
  const isCollect = kind === 'collect';
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const arc = Math.min(26, 8 + Math.hypot(dx, dy) * 0.12);

  const xs = FLIGHT_PROGRESS.map((p) => dx * p);
  const ys = FLIGHT_PROGRESS.map((p) => dy * p - 4 * arc * p * (1 - p));
  const lift = FLIGHT_HEIGHT.map((h) => 1 + LIFT_SCALE * h);
  const scaleX = lift.map((s, i) => s * FLIGHT_SQUASH_X[i]);
  const scaleY = lift.map((s, i) => s * FLIGHT_SQUASH_Y[i]);

  const shadowX = FLIGHT_HEIGHT.map((h) => 2 + 7 * h);
  const shadowY = FLIGHT_HEIGHT.map((h) => 3 + 10 * h);
  const shadowScale = FLIGHT_HEIGHT.map((h) => 1 + 0.15 * h);
  const shadowOpacity = FLIGHT_HEIGHT.map((h) => 0.5 - 0.2 * h);

  const duration = flight.durationMs / 1000;
  const times = FLIGHT_TIMES;
  const track = (ease: Easing | Easing[]) => ({ duration, times, ease });

  const animate: Record<string, number[]> = { x: xs, y: ys, scaleX, scaleY };
  const transition: Record<string, unknown> = {
    x: track(MOVE_EASE),
    y: track(MOVE_EASE),
    scaleX: track(HEIGHT_EASE),
    scaleY: track(HEIGHT_EASE),
  };
  if (isCollect) {
    const mix = (a: number, b: number) => FLIGHT_FLAT.map((f) => a + (b - a) * f);
    animate.width = mix(from.w, to.w);
    animate.height = mix(from.h, to.h);
    animate.borderRadius = mix(from.w / 2, 3);
    transition.width = track('easeInOut');
    transition.height = track('easeInOut');
    transition.borderRadius = track('easeInOut');
  }

  return (
    <motion.div
      data-testid="flying-piece"
      data-kind={kind}
      aria-hidden="true"
      className="pointer-events-none absolute z-30 will-change-transform"
      style={{ left: from.x, top: from.y, width: from.w, height: from.h, borderRadius: from.w / 2 }}
      initial={{ x: 0, y: 0, scaleX: 1, scaleY: 1 }}
      animate={animate}
      transition={transition}
      onAnimationComplete={() => onDone(flight)}
    >
      <motion.span
        className="absolute inset-0"
        style={{ borderRadius: 'inherit', background: 'rgba(0,0,0,0.55)', filter: 'blur(2px)' }}
        initial={{ x: shadowX[0], y: shadowY[0], scale: 1, opacity: shadowOpacity[0] }}
        animate={{ x: shadowX, y: shadowY, scale: shadowScale, opacity: shadowOpacity }}
        transition={{ duration, times, ease: HEIGHT_EASE }}
      />
      <motion.span
        className="absolute inset-0"
        style={{ borderRadius: 'inherit' }}
        initial={{ opacity: 1 }}
        animate={isCollect ? { opacity: FLIGHT_FLAT.map((f) => 1 - f) } : { opacity: 1 }}
        transition={{ duration, times, ease: 'linear' }}
      >
        <CheckerFace isMine={isMine} shadow={false} />
      </motion.span>
      {isCollect && (
        <motion.span
          className="absolute inset-0"
          style={{ borderRadius: 3, ...railPieceStyle(isMine) }}
          initial={{ opacity: 0 }}
          animate={{ opacity: FLIGHT_FLAT }}
          transition={{ duration, times, ease: 'linear' }}
        />
      )}
    </motion.div>
  );
}

const GRID: Record<BoardOrientation, React.CSSProperties> = {
  landscape: {
    gridTemplateColumns: 'repeat(6, minmax(0, 1fr)) 0.9rem repeat(6, minmax(0, 1fr)) 2.3rem',
    gridTemplateRows: 'minmax(0, 1fr) 2.4rem minmax(0, 1fr)',
    height: 'clamp(22rem, 62vh, 34rem)',
  },
  portrait: {
    gridTemplateColumns: 'minmax(0, 1fr) 1.4rem minmax(0, 1fr)',
    gridTemplateRows: 'repeat(6, minmax(0, 1fr)) 0.9rem repeat(6, minmax(0, 1fr)) 2rem',
    // 12 hane satırı ≥44 px (dokunma hedefi): (36rem − 0.9rem − 2rem) / 12 ≈ 44 px.
    height: 'clamp(36rem, 160vw, 46rem)',
  },
};

/** Her yerleşimde hücrelerin yeri: oyuncu çeyrekleri, tepsiler, menteşe ve boş kanat hanelerinin sırası. */
function cells(o: BoardOrientation) {
  if (o === 'landscape') {
    return {
      mineSide: 'bottom' as Side,
      theirSide: 'top' as Side,
      mineQuarter: { gridRow: 3, gridColumn: '8 / 14' },
      theirQuarter: { gridRow: 1, gridColumn: '8 / 14' },
      mineTray: { gridRow: 3, gridColumn: 14 },
      theirTray: { gridRow: 1, gridColumn: 14 },
      hinge: { gridColumn: 7, gridRow: '1 / 4' },
      empty: Array.from({ length: 12 }, (_, k) => {
        const i = k % 6;
        const top = k < 6;
        return { side: (top ? 'top' : 'bottom') as Side, index: i, style: { gridRow: top ? 1 : 3, gridColumn: i + 1 } };
      }),
    };
  }
  return {
    mineSide: 'left' as Side,
    theirSide: 'right' as Side,
    mineQuarter: { gridColumn: 1, gridRow: '8 / 14' },
    theirQuarter: { gridColumn: 3, gridRow: '8 / 14' },
    mineTray: { gridColumn: 1, gridRow: 14 },
    theirTray: { gridColumn: 3, gridRow: 14 },
    hinge: { gridRow: 7, gridColumn: '1 / 4' },
    empty: Array.from({ length: 12 }, (_, k) => {
      const i = k % 6;
      const left = k < 6;
      return { side: (left ? 'left' : 'right') as Side, index: i, style: { gridRow: i + 1, gridColumn: left ? 1 : 3 } };
    }),
  };
}

interface BackgammonBoardProps {
  myBoard: PlayerBoardDto;
  opponentBoard: PlayerBoardDto;
  myName: string;
  opponentName: string;
  isMyTurn: boolean;
  clickablePoints: number[];
  myFlash: PointFlash | null;
  opponentFlash: PointFlash | null;
  /** Değiştiğinde masa hafifçe sarsılır (ör. çift zar masaya değince). */
  shakeToken?: number | null;
  onPickPoint: (pointNumber: number) => void;
  /** Tahtanın üstünde, tıklamaları engellemeyen katman (zarlar burada atılır). */
  overlay?: React.ReactNode;
  /** Verilmezse ekran genişliğine göre seçilir. */
  orientation?: BoardOrientation;
}

const EMPTY_POINTS: number[] = [];
let flightCounter = 0;

export default function BackgammonBoard({
  myBoard,
  opponentBoard,
  myName,
  opponentName,
  isMyTurn,
  clickablePoints,
  myFlash,
  opponentFlash,
  shakeToken = null,
  onPickPoint,
  overlay,
  orientation: orientationProp,
}: BackgammonBoardProps) {
  const detected = useBoardOrientation();
  const orientation = orientationProp ?? detected;
  const layout = useMemo(() => cells(orientation), [orientation]);
  const vertical = orientation === 'landscape';

  const prefs = useMotionPrefs();
  const rootRef = useRef<HTMLElement | null>(null);
  const prevBoards = useRef<{ mine: PlayerBoardDto; theirs: PlayerBoardDto } | null>(null);
  const prevBoxes = useRef<Map<string, Box>>(new Map());
  const [flights, setFlights] = useState<Flight[]>([]);
  const [trayGhost, setTrayGhost] = useState(false);

  const onPickRef = useRef(onPickPoint);
  useLayoutEffect(() => {
    onPickRef.current = onPickPoint;
  });
  const stablePick = useCallback((pointNumber: number) => onPickRef.current(pointNumber), []);
  const handleMinePreview = useCallback(
    (point: number | null, kind: PreviewKind) => setTrayGhost(point !== null && kind === 'collect'),
    [],
  );
  const ignorePreview = useCallback(() => {}, []);

  const { reduced, fast } = prefs;

  // FLIP: önceki commit'teki kutular "First", yeni DOM "Last". Boyamadan önce çalışır;
  // hedef pul gizlenir ve uçuş katmanı ilk karede hazır olur.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const previous = prevBoards.current;
    if (!root || !previous || reduced) return;
    const boxes = measurePieces(root);

    const started: Flight[] = [];
    const candidates: [PlayerBoardDto, PlayerBoardDto, boolean][] = [
      [previous.mine, myBoard, true],
      [previous.theirs, opponentBoard, false],
    ];
    for (const [before, after, isMine] of candidates) {
      if (before === after) continue;
      const move = detectPieceMove(before, after);
      if (!move) continue;
      const from = prevBoxes.current.get(move.fromKey);
      const to = boxes.get(move.toKey);
      const target = findPiece(root, move.toKey);
      if (!from || !to || !target || from.w === 0 || to.w === 0) continue;
      target.dataset.landing = 'true';
      started.push({
        id: ++flightCounter,
        kind: move.kind,
        isMine,
        from,
        to,
        toKey: move.toKey,
        durationMs: flightDuration(move.kind, { reduced, fast }),
      });
    }
    if (started.length > 0) {
      setFlights((current) => [...current, ...started]);
    }
  }, [myBoard, opponentBoard, reduced, fast]);

  // Her commit sonrası kutular yeniden ölçülür (yalnızca ref günceller, render tetiklemez).
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    prevBoards.current = { mine: myBoard, theirs: opponentBoard };
    prevBoxes.current = measurePieces(root);
  });

  // Çift zar masaya değince masa hafifçe sarsılır (Web Animations API; React render'ı tetiklemez).
  useEffect(() => {
    const root = rootRef.current;
    if (shakeToken === null || !root || reduced || typeof root.animate !== 'function') return;
    root.animate(
      [
        { transform: 'translate3d(0,0,0)' },
        { transform: 'translate3d(-3px,1px,0) rotate(-0.25deg)' },
        { transform: 'translate3d(3px,-1px,0) rotate(0.25deg)' },
        { transform: 'translate3d(-2px,0,0)' },
        { transform: 'translate3d(1px,0,0)' },
        { transform: 'translate3d(0,0,0)' },
      ],
      { duration: scaleDuration(420, { reduced, fast }), easing: 'ease-out' },
    );
  }, [shakeToken, reduced, fast]);

  const handleFlightDone = (flight: Flight) => {
    const root = rootRef.current;
    const target = root ? findPiece(root, flight.toKey) : null;
    if (target) delete target.dataset.landing;
    setFlights((current) => current.filter((f) => f.id !== flight.id));
  };

  useEffect(() => {
    if (flights.length > 0) return;
    rootRef.current
      ?.querySelectorAll<HTMLElement>('[data-landing]')
      .forEach((el) => delete el.dataset.landing);
  }, [flights.length]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        <PlayerChip name={opponentName} isMine={false} isTurn={!isMyTurn} board={opponentBoard} />
        <PlayerChip name={myName} isMine isTurn={isMyTurn} board={myBoard} />
      </div>

      {/* Masa: A3 gece mavisi çuha; altın ince çizgiyle çerçevelenir, tahta onun üstünde durur. */}
      <div
        className="rounded-dialog border border-line-accent/50 p-2.5 md:p-6"
        style={{
          background: `radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.05), transparent 60%), ${FELT_TEXTURE}`,
          backgroundSize: 'auto, 160px',
          boxShadow: 'inset 0 0 44px rgba(0,0,0,0.65), 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <section ref={rootRef} aria-label="Tavla tahtası" className="relative w-full">
          <div className="board-tilt">
            {/* Ceviz çerçeve */}
            <div
              className="relative rounded-2xl p-2.5 md:p-4"
              style={{
                background: `linear-gradient(135deg, rgba(255,236,205,0.14), rgba(0,0,0,0) 38%, rgba(0,0,0,0.38)), ${WALNUT_TEXTURE}`,
                backgroundSize: 'auto, 100% 100%',
                boxShadow: [
                  '10px 22px 34px rgba(0,0,0,0.6)',
                  '3px 5px 8px rgba(0,0,0,0.5)',
                  'inset 1px 1px 2px rgba(255,236,205,0.3)',
                  'inset -2px -3px 5px rgba(0,0,0,0.55)',
                ].join(', '),
              }}
            >
              {/* Kakma bordür: altın çizgiler ve sedef noktalar. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-[5px] rounded-xl md:inset-[8px]"
                style={{
                  border: '3px dotted rgba(246,240,228,0.72)',
                  boxShadow:
                    '0 0 0 1px rgba(212,175,55,0.55), inset 0 0 0 1px rgba(212,175,55,0.45), 1px 1.5px 0 rgba(0,0,0,0.35)',
                }}
              />
              {/* Oyun yüzeyi: çerçeveden aşağıda; iç kenarlara gölge düşer. */}
              <div
                className="relative grid rounded-lg"
                style={{
                  ...GRID[orientation],
                  background: `linear-gradient(135deg, rgba(255,246,225,0.2), rgba(255,246,225,0) 45%, rgba(60,30,5,0.24)), ${MAPLE_TEXTURE}`,
                  backgroundSize: 'auto, 100% 100%',
                  boxShadow:
                    'inset 4px 5px 12px rgba(0,0,0,0.6), inset -2px -2px 6px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.5), 1px 1.5px 0 rgba(255,236,200,0.2)',
                }}
              >
                {layout.empty.map(({ side, index, style }) => (
                  <EmptyPoint key={`${side}-${index}`} side={side} colorIndex={index} style={style} />
                ))}

                <Hinge vertical={vertical} style={layout.hinge} />

                <Quarter
                  board={opponentBoard}
                  name={opponentName}
                  isMine={false}
                  side={layout.theirSide}
                  vertical={vertical}
                  colorOffset={6}
                  clickablePoints={EMPTY_POINTS}
                  flash={opponentFlash}
                  style={layout.theirQuarter}
                  onPreviewKind={ignorePreview}
                />
                <Quarter
                  board={myBoard}
                  name={myName}
                  isMine
                  side={layout.mineSide}
                  vertical={vertical}
                  colorOffset={6}
                  clickablePoints={clickablePoints}
                  flash={myFlash}
                  onPick={stablePick}
                  style={layout.mineQuarter}
                  onPreviewKind={handleMinePreview}
                />

                <Tray
                  playerId={opponentBoard.playerId}
                  count={opponentBoard.collectedCount}
                  isMine={false}
                  side={layout.theirSide}
                  ghost={false}
                  label={`${opponentName}: toplanan ${opponentBoard.collectedCount} pul`}
                  style={layout.theirTray}
                />
                <Tray
                  playerId={myBoard.playerId}
                  count={myBoard.collectedCount}
                  isMine
                  side={layout.mineSide}
                  ghost={trayGhost}
                  label={`${myName}: toplanan ${myBoard.collectedCount} pul`}
                  style={layout.mineTray}
                />
              </div>
            </div>
          </div>

          {flights.map((flight) => (
            <FlyingPiece key={flight.id} flight={flight} onDone={handleFlightDone} />
          ))}

          {overlay}
        </section>
      </div>
    </div>
  );
}
