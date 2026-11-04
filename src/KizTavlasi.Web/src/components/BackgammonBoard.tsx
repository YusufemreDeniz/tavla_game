import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { PlayerBoardDto } from '../types/game';
import { detectPieceMove, pieceKey, railKey, type PieceMove } from '../lib/boardDiff';
import { DIE_DROP_MS, flightDuration, scaleDuration, useMotionPrefs } from '../lib/motion';

/**
 * Gerçek bir tavla masası görünümü: ceviz çerçeve, ahşap damarlı zemin,
 * menteşeli omurga, üçgen haneler, tornalanmış pullar, yan toplama rayı.
 *
 * Performans: pullar sabit anahtarlarla memo'lanır; yalnızca sayıları değişen
 * hanenin pulları yeniden render edilir. Pul yörüngesi (FLIP) tek bir üst
 * katmanda framer-motion ile oynatılır; tahtanın kendisi animasyon sırasında
 * yeniden render edilmez.
 */

export interface PointFlash {
  point: number;
  token: number;
}

const WOOD_FRAME =
  'linear-gradient(135deg, #6d4527 0%, #543218 35%, #6d4527 55%, #452a14 100%)';
const WOOD_GRAIN_OVERLAY =
  'repeating-linear-gradient(92deg, rgba(0,0,0,0.10) 0px, rgba(0,0,0,0) 3px, rgba(255,255,255,0.05) 6px, rgba(0,0,0,0) 9px, rgba(0,0,0,0.08) 14px)';
const BOARD_WOOD =
  'linear-gradient(160deg, #d3b384 0%, #c6a271 30%, #cfae7d 55%, #b8925c 80%, #c9a878 100%)';
const BOARD_GRAIN =
  'repeating-linear-gradient(88deg, rgba(90,55,25,0.12) 0px, rgba(90,55,25,0) 4px, rgba(255,245,220,0.10) 7px, rgba(90,55,25,0) 11px, rgba(90,55,25,0.10) 18px)';
const SPINE_WOOD = 'linear-gradient(90deg, #4a2c15, #6b4426 45%, #7a4f2c 55%, #452a14)';

const MINE_CHECKER =
  'radial-gradient(circle at 32% 28%, #c0687a 0%, #983342 38%, #631d29 76%, #3f121a 100%)';
const THEIR_CHECKER =
  'radial-gradient(circle at 32% 28%, #fffefb 0%, #f5ebd6 38%, #dcc7a1 76%, #b59a70 100%)';
const MINE_RAIL = 'linear-gradient(180deg, #b85264 0%, #5c1d29 100%)';
const THEIR_RAIL = 'linear-gradient(180deg, #fdfaf2 0%, #cbb790 100%)';

/** Yarım kanat yüksekliği: ekranı dikeyde doldurur, 360px mobilde bile taşma yapmaz. */
const HALF_HEIGHT = 'h-[clamp(10.5rem,27vh,21.5rem)]';

/** Mobilde basılı tutma önizlemesi için bekleme süresi. */
const LONG_PRESS_MS = 280;

type CheckerVariant = 'normal' | 'lifted' | 'ghost';

/** Pulun görsel yüzeyi; tahtada ve uçuş katmanında ortak kullanılır. */
function CheckerFace({ isMine, isDown }: { isMine: boolean; isDown: boolean }) {
  return (
    <>
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: isMine ? MINE_CHECKER : THEIR_CHECKER,
          boxShadow: [
            '0 3px 6px rgba(0,0,0,0.55)',
            'inset 0 2px 3px rgba(255,255,255,0.55)',
            'inset 0 -3px 5px rgba(0,0,0,0.4)',
            isDown
              ? '0 0 0 2px rgba(212,175,55,0.95), 0 0 10px rgba(212,175,55,0.5)'
              : '0 0 0 1px rgba(0,0,0,0.28)',
          ].join(', '),
        }}
      />
      <span
        className="absolute inset-[14%] rounded-full"
        style={{
          border: isMine ? '1px solid rgba(255,220,225,0.28)' : '1px solid rgba(120,85,50,0.32)',
        }}
      />
      <span
        className="absolute inset-[30%] rounded-full"
        style={{
          border: isMine ? '1px solid rgba(255,220,225,0.22)' : '1px solid rgba(120,85,50,0.26)',
          background: isMine
            ? 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.20), transparent 65%)'
            : 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.48), transparent 65%)',
        }}
      />
    </>
  );
}

const Checker = memo(function Checker({
  isMine,
  isDown,
  dataKey,
  variant = 'normal',
}: {
  isMine: boolean;
  isDown: boolean;
  dataKey?: string;
  variant?: CheckerVariant;
}) {
  return (
    <div
      data-piece={dataKey}
      data-variant={variant === 'normal' ? undefined : variant}
      className={`relative aspect-square w-[76%] max-w-11 shrink-0 rounded-full transition-[opacity,transform] duration-150 ${
        variant === 'ghost' ? 'anim-ghost' : 'anim-piece-pop'
      }`}
      style={
        variant === 'ghost'
          ? { opacity: 0.5, outline: '2px dashed rgba(212,175,55,0.9)', outlineOffset: '1px' }
          : variant === 'lifted'
            ? { opacity: 0.45, transform: 'scale(0.92)' }
            : undefined
      }
      aria-hidden="true"
    >
      <CheckerFace isMine={isMine} isDown={isDown || variant === 'ghost'} />
    </div>
  );
});

type PreviewKind = 'advance' | 'collect';

interface PointColumnProps {
  playerId: string;
  pointNumber: number;
  backCount: number;
  frontCount: number;
  isMine: boolean;
  isTop: boolean;
  colorIndex: number;
  clickable: boolean;
  flashToken: number | null;
  /** Bu hane şu an önizleniyorsa hamle türü (yalnızca görsel). */
  preview: PreviewKind | null;
  onPick?: (pointNumber: number) => void;
  onPreview?: (pointNumber: number | null) => void;
}

const PointColumn = memo(function PointColumn({
  playerId,
  pointNumber,
  backCount,
  frontCount,
  isMine,
  isTop,
  colorIndex,
  clickable,
  flashToken,
  preview,
  onPick,
  onPreview,
}: PointColumnProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  useEffect(
    () => () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    },
    [],
  );

  const dark = colorIndex % 2 === 0;
  const direction = isTop ? '180deg' : '0deg';
  const fill = dark
    ? `linear-gradient(${direction}, #8a4a22 0%, #6d3a1a 60%, #542c12 100%)`
    : `linear-gradient(${direction}, #efdcae 0%, #e2c893 60%, #cbab72 100%)`;

  const totalPieces = backCount + frontCount;

  // Önizlemede hangi pul hareket edecek? İndirmede son arka pul; toplamada önce inmiş pul.
  const liftedBackIndex =
    preview === 'advance' || (preview === 'collect' && frontCount === 0) ? backCount - 1 : -1;
  const liftedFrontIndex = preview === 'collect' && frontCount > 0 ? frontCount - 1 : -1;
  const showGhostFront = preview === 'advance';

  const content = (
    <>
      {/* Üçgen hane + kontur */}
      <div
        aria-hidden="true"
        className="absolute inset-x-[6%]"
        style={{
          top: isTop ? 0 : 'auto',
          bottom: isTop ? 'auto' : 0,
          height: '88%',
          clipPath: isTop ? 'polygon(0 0, 100% 0, 50% 100%)' : 'polygon(50% 0, 0 100%, 100% 100%)',
          background: fill,
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-[6%]"
        style={{
          top: isTop ? 0 : 'auto',
          bottom: isTop ? 'auto' : 0,
          height: '88%',
          clipPath: isTop
            ? 'polygon(0 0, 100% 0, 50% 100%, 47% 94%, 94% 3%, 6% 3%, 53% 94%)'
            : 'polygon(50% 0, 0 100%, 100% 100%, 94% 97%, 50% 8%, 6% 97%)',
          background: dark ? 'rgba(240,220,180,0.28)' : 'rgba(90,50,20,0.30)',
        }}
      />

      {/* Oynanan hamle vurgusu: altın flaş */}
      {flashToken !== null && (
        <div
          key={flashToken}
          aria-hidden="true"
          className="anim-point-flash absolute inset-0 z-20 rounded-md"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(212,175,55,0.58), rgba(212,175,55,0.08) 70%)',
            boxShadow: 'inset 0 0 0 3px rgba(212,175,55,0.92)',
          }}
        />
      )}

      {/* Pullar: inmemişler kenardan; inmişler (altın halkalı) ortaya doğru */}
      <div
        className={`absolute inset-0 flex items-center px-[7%] py-[4%] ${
          isTop ? 'flex-col' : 'flex-col-reverse'
        }`}
        style={{ gap: '1.5%' }}
      >
        {Array.from({ length: backCount }).map((_, i) => (
          <Checker
            key={`up-${i}`}
            dataKey={pieceKey(playerId, pointNumber, 'back', i)}
            isMine={isMine}
            isDown={false}
            variant={i === liftedBackIndex ? 'lifted' : 'normal'}
          />
        ))}
        {(frontCount > 0 || showGhostFront) && backCount > 0 && (
          <div className="h-[5%]" aria-hidden="true" />
        )}
        {Array.from({ length: frontCount }).map((_, i) => (
          <Checker
            key={`down-${i}`}
            dataKey={pieceKey(playerId, pointNumber, 'front', i)}
            isMine={isMine}
            isDown
            variant={i === liftedFrontIndex ? 'lifted' : 'normal'}
          />
        ))}
        {showGhostFront && <Checker key="ghost" isMine={isMine} isDown variant="ghost" />}
      </div>

      {/* Hane numarası ve pul adedi rozeti (kakma pirinç görünümü) */}
      <div
        className={`absolute inset-x-0 z-10 flex items-center justify-center gap-1 ${
          isTop ? 'bottom-0.5' : 'top-0.5'
        }`}
        aria-hidden="true"
      >
        <span
          className="font-display text-[11px] font-bold leading-none md:text-xs"
          style={{ color: '#6b4a1e', textShadow: '0 1px 0 rgba(255,245,215,0.55)' }}
        >
          {pointNumber}
        </span>
        {totalPieces > 0 && (
          <span
            className="rounded-full px-1 py-0.5 font-mono text-[9px] font-semibold leading-none md:text-[10px]"
            style={{
              backgroundColor: clickable ? 'rgba(142,47,60,0.9)' : 'rgba(43,24,8,0.68)',
              color: clickable ? '#fffdf7' : '#f0e6d2',
            }}
          >
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
        className="group relative h-full min-h-11 min-w-11 cursor-pointer touch-manipulation select-none rounded-md transition-transform [-webkit-touch-callout:none] active:scale-[0.98]"
      >
        <span
          aria-hidden="true"
          className="anim-pulse-gold absolute inset-0 z-20 rounded-md"
          style={{
            boxShadow: 'inset 0 0 0 3px #d4af37, 0 0 16px rgba(212,175,55,0.75)',
            background: 'linear-gradient(180deg, rgba(212,175,55,0.14), rgba(212,175,55,0.04))',
          }}
        />
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

function Spine() {
  return (
    <div
      aria-hidden="true"
      className="relative h-full w-2.5 shrink-0 md:w-4"
      style={{ background: SPINE_WOOD, boxShadow: 'inset 0 0 4px rgba(0,0,0,0.6)' }}
    >
      <span
        className="absolute left-1/2 top-[12%] h-6 w-1.5 -translate-x-1/2 rounded-sm md:w-2"
        style={{
          background: 'linear-gradient(180deg, #e8d49a, #a68334 50%, #d9c078)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
        }}
      />
      <span
        className="absolute left-1/2 bottom-[12%] h-6 w-1.5 -translate-x-1/2 rounded-sm md:w-2"
        style={{
          background: 'linear-gradient(180deg, #e8d49a, #a68334 50%, #d9c078)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
        }}
      />
    </div>
  );
}

const CollectedRail = memo(function CollectedRail({
  playerId,
  count,
  isMine,
  label,
  ghost,
}: {
  playerId: string;
  count: number;
  isMine: boolean;
  label: string;
  ghost: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={`${label}: toplanan ${count} pul`}
      className="flex h-full w-7 flex-col justify-between rounded-sm p-[3px] md:w-9"
      style={{
        background: 'linear-gradient(180deg, #3a2110, #241305)',
        boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,220,160,0.1)',
      }}
    >
      <span
        aria-hidden="true"
        className="text-center font-mono text-[9px] font-bold leading-tight text-gold-400 md:text-[10px]"
      >
        {count}/15
      </span>
      <div className="flex flex-1 flex-col justify-end gap-[2px] pt-1">
        {ghost && (
          <span
            data-variant="ghost"
            aria-hidden="true"
            className="anim-ghost block w-full rounded-[2px]"
            style={{
              height: 'max(3px, 5%)',
              background: isMine ? MINE_RAIL : THEIR_RAIL,
              opacity: 0.5,
              outline: '1px dashed rgba(212,175,55,0.95)',
            }}
          />
        )}
        {Array.from({ length: count }).map((_, i) => (
          <span
            // En yeni pul en üstte: anahtar toplanma sırası, böylece yalnızca yeni pul mount olur.
            key={count - 1 - i}
            data-piece={railKey(playerId, count - 1 - i)}
            className="anim-piece-pop block w-full rounded-[2px]"
            style={{
              height: 'max(3px, 5%)',
              background: isMine ? MINE_RAIL : THEIR_RAIL,
              boxShadow: '0 1px 2px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.28)',
            }}
          />
        ))}
      </div>
    </div>
  );
});

interface HalfProps {
  board: PlayerBoardDto;
  name: string;
  isMine: boolean;
  isTop: boolean;
  isTurn: boolean;
  clickablePoints: number[];
  flash: PointFlash | null;
  onPick?: (pointNumber: number) => void;
}

const BoardHalf = memo(function BoardHalf({
  board,
  name,
  isMine,
  isTop,
  isTurn,
  clickablePoints,
  flash,
  onPick,
}: HalfProps) {
  const [previewPoint, setPreviewPoint] = useState<number | null>(null);
  const left = board.points.slice(0, 3);
  const right = board.points.slice(3, 6);

  // Önizleme yalnızca hâlâ tıklanabilir bir hane için gösterilir; tür sunucunun aşama bilgisinden gelir.
  const activePreview =
    previewPoint !== null && clickablePoints.includes(previewPoint) ? previewPoint : null;
  const previewKind: PreviewKind = board.isCollecting ? 'collect' : 'advance';

  // Kalan indirme sayısı: başlangıçta toplam 9 indirme yapılır.
  const remainingBringDowns = board.points.reduce(
    (sum, p) => sum + Math.max(0, p.backCount - 1),
    0,
  );
  const completedBringDowns = 9 - remainingBringDowns;

  const renderGroup = (points: typeof left, offset: number) => (
    <div className="grid h-full flex-1 grid-cols-3">
      {points.map((point, index) => (
        <PointColumn
          key={point.pointNumber}
          playerId={board.playerId}
          pointNumber={point.pointNumber}
          backCount={point.backCount}
          frontCount={point.frontCount}
          isMine={isMine}
          isTop={isTop}
          colorIndex={offset + index}
          clickable={clickablePoints.includes(point.pointNumber)}
          flashToken={flash?.point === point.pointNumber ? flash.token : null}
          preview={activePreview === point.pointNumber ? previewKind : null}
          onPick={onPick}
          onPreview={onPick ? setPreviewPoint : undefined}
        />
      ))}
    </div>
  );

  return (
    <div
      role="region"
      aria-label={`${name} tahtası${board.isCollecting ? ' (toplama aşamasında)' : ' (indirme aşamasında)'}`}
      className="space-y-1"
    >
      {/* Oyuncu aşama ve ilerleme şeridi */}
      <div className="flex items-center justify-between px-1 text-[11px] text-cream-200 md:text-xs">
        <span className="flex items-center gap-1.5 font-semibold">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full border border-white/25"
            style={{ backgroundColor: isMine ? '#8e2f3c' : '#f2e8d2' }}
          />
          <span className="truncate">{name}</span>
          {isTurn && (
            <span className="rounded-full bg-gold-500/20 px-1.5 py-0.5 text-[10px] font-bold text-gold-400">
              Sırada
            </span>
          )}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            board.isCollecting
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
              : 'bg-walnut-800/90 text-cream-200 border border-gold-500/20'
          }`}
        >
          {board.isCollecting
            ? `Toplama · ${board.collectedCount}/15`
            : `İndirme · ${completedBringDowns}/9`}
        </span>
      </div>

      <div className={`relative flex gap-0 ${HALF_HEIGHT}`}>
        <div
          className="flex flex-1 rounded-md"
          style={{
            background: `${BOARD_GRAIN}, ${BOARD_WOOD}`,
            boxShadow: isTurn
              ? 'inset 0 0 0 2px rgba(212,175,55,0.6), inset 0 3px 12px rgba(60,30,5,0.38)'
              : 'inset 0 3px 12px rgba(60,30,5,0.38)',
          }}
        >
          {renderGroup(left, 0)}
          <Spine />
          {renderGroup(right, 1)}
        </div>
        <div className="ml-1 md:ml-1.5">
          <CollectedRail
            playerId={board.playerId}
            count={board.collectedCount}
            isMine={isMine}
            label={name}
            ghost={activePreview !== null && previewKind === 'collect'}
          />
        </div>
      </div>
    </div>
  );
});

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

/** Ağırlık hissi veren kavisli yörüngede uçan pul. */
function FlyingPiece({ flight, onDone }: { flight: Flight; onDone: (flight: Flight) => void }) {
  const { from, to } = flight;
  const dx = to.x - from.x + (to.w - from.w) / 2;
  const dy = to.y - from.y + (to.h - from.h) / 2;
  // Pul önce kaldırılır, sonra hedefe "düşer": tepe noktası mesafeyle orantılı.
  const lift = 18 + Math.min(60, Math.hypot(dx, dy) * 0.25);
  const isCollect = flight.kind === 'collect';
  const endScaleX = isCollect ? to.w / from.w : 1;
  const endScaleY = isCollect ? to.h / from.h : 1;

  return (
    <motion.div
      data-testid="flying-piece"
      aria-hidden="true"
      className="pointer-events-none absolute z-30 rounded-full"
      style={{ left: from.x, top: from.y, width: from.w, height: from.h }}
      initial={{ x: 0, y: 0, scaleX: 1, scaleY: 1 }}
      animate={{
        x: [0, dx * 0.5, dx],
        y: [0, Math.min(0, dy) * 0.5 - lift, dy],
        scaleX: [1, 1.16, endScaleX],
        scaleY: [1, 1.16, endScaleY],
      }}
      transition={{
        duration: flight.durationMs / 1000,
        times: [0, 0.45, 1],
        ease: [0.3, 0.05, 0.25, 1],
      }}
      onAnimationComplete={() => onDone(flight)}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{ boxShadow: '0 12px 18px rgba(0,0,0,0.45)' }}
      />
      <CheckerFace isMine={flight.isMine} isDown={!isCollect} />
    </motion.div>
  );
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
  /** Değiştiğinde masa hafifçe sarsılır (ör. çift zar). */
  shakeToken?: number | null;
  onPickPoint: (pointNumber: number) => void;
  centerContent: React.ReactNode;
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
  centerContent,
}: BackgammonBoardProps) {
  const prefs = useMotionPrefs();
  const rootRef = useRef<HTMLElement | null>(null);
  const prevBoards = useRef<{ mine: PlayerBoardDto; theirs: PlayerBoardDto } | null>(null);
  const prevBoxes = useRef<Map<string, Box>>(new Map());
  const [flights, setFlights] = useState<Flight[]>([]);

  // Üst bileşen her render'da yeni callback verebilir; sabit bir sarmalayıcı
  // geçirerek memo'lanmış hanelerin gereksiz yeniden render'ını önleriz.
  const onPickRef = useRef(onPickPoint);
  useLayoutEffect(() => {
    onPickRef.current = onPickPoint;
  });
  const stablePick = useCallback((pointNumber: number) => onPickRef.current(pointNumber), []);

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

  // Her commit sonrası kutular yeniden ölçülür ki aradaki yerleşim kaymaları
  // (ör. orta panel yüksekliği) bir sonraki uçuşun kaynak konumunu bozmasın.
  // Yukarıdaki efektten SONRA çalışır; yalnızca ref günceller, render tetiklemez.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    prevBoards.current = { mine: myBoard, theirs: opponentBoard };
    prevBoxes.current = measurePieces(root);
  });

  // Çift zar: masa hafifçe sarsılır (Web Animations API; React render'ı tetiklemez).
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
      {
        duration: scaleDuration(420, { reduced, fast }),
        // Zarlar masaya değdiği anda (düşüş animasyonunun ~%45'i) sarsılır.
        delay: scaleDuration(DIE_DROP_MS * 0.45, { reduced, fast }),
        easing: 'ease-out',
      },
    );
  }, [shakeToken, reduced, fast]);

  const handleFlightDone = (flight: Flight) => {
    const root = rootRef.current;
    const target = root ? findPiece(root, flight.toKey) : null;
    if (target) {
      delete target.dataset.landing;
      if (typeof target.animate === 'function') {
        // Masaya oturma: kısa "tok" sıkışma.
        target.animate([{ transform: 'scale(1.1, 0.9)' }, { transform: 'scale(1)' }], {
          duration: 140,
          easing: 'ease-out',
        });
      }
    }
    setFlights((current) => current.filter((f) => f.id !== flight.id));
  };

  // Tüm uçuşlar bittiğinde, arada gelen bir snapshot hedefi değiştirmiş olsa bile gizli pul kalmasın.
  useEffect(() => {
    if (flights.length > 0) return;
    rootRef.current
      ?.querySelectorAll<HTMLElement>('[data-landing]')
      .forEach((el) => delete el.dataset.landing);
  }, [flights.length]);

  return (
    <section
      ref={rootRef}
      aria-label="Tavla tahtası"
      className="relative w-full rounded-2xl p-2 md:p-4"
      style={{
        background: `${WOOD_GRAIN_OVERLAY}, ${WOOD_FRAME}`,
        boxShadow: [
          '0 18px 44px rgba(0,0,0,0.65)',
          '0 2px 6px rgba(0,0,0,0.45)',
          'inset 0 1px 2px rgba(255,235,200,0.28)',
          'inset 0 -3px 6px rgba(0,0,0,0.55)',
        ].join(', '),
      }}
    >
      <div
        className="space-y-1.5 rounded-xl p-1.5 md:space-y-2 md:p-2.5"
        style={{
          background: 'linear-gradient(180deg, #2e1a0a, #241305)',
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(212,175,55,0.18)',
        }}
      >
        <BoardHalf
          board={opponentBoard}
          name={opponentName}
          isMine={false}
          isTop
          isTurn={!isMyTurn}
          clickablePoints={EMPTY_POINTS}
          flash={opponentFlash}
        />

        <div
          className="my-1 flex min-h-16 items-center justify-center rounded-md px-2.5 py-2 md:min-h-20 md:px-4"
          style={{
            background: `${WOOD_GRAIN_OVERLAY}, linear-gradient(180deg, #55341b, #40260f 60%, #4a2c15)`,
            boxShadow: 'inset 0 3px 10px rgba(0,0,0,0.68), 0 1px 1px rgba(255,235,200,0.14)',
          }}
        >
          {centerContent}
        </div>

        <BoardHalf
          board={myBoard}
          name={myName}
          isMine
          isTop={false}
          isTurn={isMyTurn}
          clickablePoints={clickablePoints}
          flash={myFlash}
          onPick={stablePick}
        />
      </div>

      {flights.map((flight) => (
        <FlyingPiece key={flight.id} flight={flight} onDone={handleFlightDone} />
      ))}
    </section>
  );
}
