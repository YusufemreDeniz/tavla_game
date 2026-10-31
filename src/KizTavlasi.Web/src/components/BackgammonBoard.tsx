import { memo } from 'react';
import type { PlayerBoardDto } from '../types/game';

/**
 * Gerçek bir tavla masası görünümü: ceviz çerçeve, ahşap damarlı zemin,
 * menteşeli omurga, üçgen haneler, tornalanmış pullar, yan toplama rayı.
 *
 * Performans: framer-motion yerine hafif CSS animasyonları ve memo'lanmış
 * alt bileşenler kullanılır; sonsuz JS animasyon döngüsü yoktur.
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

/** Yarım kanat yüksekliği: ekranı dikeyde doldurur, 360px mobilde bile taşma yapmaz. */
const HALF_HEIGHT = 'h-[clamp(10.5rem,27vh,21.5rem)]';

const Checker = memo(function Checker({ isMine, isDown }: { isMine: boolean; isDown: boolean }) {
  return (
    <div
      className="anim-piece-pop relative aspect-square w-[76%] max-w-11 shrink-0 rounded-full transition-transform duration-150"
      style={{
        background: isMine
          ? 'radial-gradient(circle at 32% 28%, #c0687a 0%, #983342 38%, #631d29 76%, #3f121a 100%)'
          : 'radial-gradient(circle at 32% 28%, #fffefb 0%, #f5ebd6 38%, #dcc7a1 76%, #b59a70 100%)',
        boxShadow: [
          '0 3px 6px rgba(0,0,0,0.55)',
          'inset 0 2px 3px rgba(255,255,255,0.55)',
          'inset 0 -3px 5px rgba(0,0,0,0.4)',
          isDown
            ? '0 0 0 2px rgba(212,175,55,0.95), 0 0 10px rgba(212,175,55,0.5)'
            : '0 0 0 1px rgba(0,0,0,0.28)',
        ].join(', '),
      }}
      aria-hidden="true"
    >
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
    </div>
  );
});

interface PointColumnProps {
  pointNumber: number;
  backCount: number;
  frontCount: number;
  isMine: boolean;
  isTop: boolean;
  colorIndex: number;
  clickable: boolean;
  flashToken: number | null;
  onPick?: (pointNumber: number) => void;
}

const PointColumn = memo(function PointColumn({
  pointNumber,
  backCount,
  frontCount,
  isMine,
  isTop,
  colorIndex,
  clickable,
  flashToken,
  onPick,
}: PointColumnProps) {
  const dark = colorIndex % 2 === 0;
  const direction = isTop ? '180deg' : '0deg';
  const fill = dark
    ? `linear-gradient(${direction}, #8a4a22 0%, #6d3a1a 60%, #542c12 100%)`
    : `linear-gradient(${direction}, #efdcae 0%, #e2c893 60%, #cbab72 100%)`;

  const totalPieces = backCount + frontCount;

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
          <Checker key={`up-${i}`} isMine={isMine} isDown={false} />
        ))}
        {frontCount > 0 && backCount > 0 && <div className="h-[5%]" aria-hidden="true" />}
        {Array.from({ length: frontCount }).map((_, i) => (
          <Checker key={`down-${i}`} isMine={isMine} isDown />
        ))}
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
    return (
      <button
        type="button"
        onClick={() => onPick?.(pointNumber)}
        aria-label={`${pointNumber}. haneyi oyna`}
        className="group relative h-full min-h-11 min-w-11 cursor-pointer touch-manipulation rounded-md transition-transform active:scale-[0.98]"
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
  count,
  isMine,
  label,
}: {
  count: number;
  isMine: boolean;
  label: string;
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
        {Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            className="anim-piece-pop block w-full rounded-[2px]"
            style={{
              height: 'max(3px, 5%)',
              background: isMine
                ? 'linear-gradient(180deg, #b85264 0%, #5c1d29 100%)'
                : 'linear-gradient(180deg, #fdfaf2 0%, #cbb790 100%)',
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
  const left = board.points.slice(0, 3);
  const right = board.points.slice(3, 6);

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
          pointNumber={point.pointNumber}
          backCount={point.backCount}
          frontCount={point.frontCount}
          isMine={isMine}
          isTop={isTop}
          colorIndex={offset + index}
          clickable={clickablePoints.includes(point.pointNumber)}
          flashToken={flash?.point === point.pointNumber ? flash.token : null}
          onPick={onPick}
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
          <CollectedRail count={board.collectedCount} isMine={isMine} label={name} />
        </div>
      </div>
    </div>
  );
});

interface BackgammonBoardProps {
  myBoard: PlayerBoardDto;
  opponentBoard: PlayerBoardDto;
  myName: string;
  opponentName: string;
  isMyTurn: boolean;
  clickablePoints: number[];
  myFlash: PointFlash | null;
  opponentFlash: PointFlash | null;
  onPickPoint: (pointNumber: number) => void;
  centerContent: React.ReactNode;
}

export default function BackgammonBoard({
  myBoard,
  opponentBoard,
  myName,
  opponentName,
  isMyTurn,
  clickablePoints,
  myFlash,
  opponentFlash,
  onPickPoint,
  centerContent,
}: BackgammonBoardProps) {
  return (
    <section
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
          clickablePoints={[]}
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
          onPick={onPickPoint}
        />
      </div>
    </section>
  );
}
