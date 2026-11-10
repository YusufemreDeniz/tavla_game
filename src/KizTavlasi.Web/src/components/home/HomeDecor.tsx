import { Panel } from '../ui';

/** Üst çubuktaki marka rozeti (A3). Süs: erişilebilir ağaçtan gizli. */
export function BrandMark() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" className="shrink-0">
      <circle cx="18" cy="18" r="16" strokeWidth="2" className="fill-surface-selected stroke-action-primary" />
      <path d="M10 25 14 11 18 25Z M18 25 22 11 26 25Z" className="fill-action-primary" />
    </svg>
  );
}

const POINTS = [
  { x: 35, pieces: 2, red: true },
  { x: 105, pieces: 2, red: false },
  { x: 175, pieces: 2, red: true },
  { x: 245, pieces: 3, red: false },
  { x: 315, pieces: 3, red: true },
  { x: 385, pieces: 3, red: false },
];

/** Altı haneli tavla motifi: ahşap çerçeveli küçük tahta (A3 "plate"). Yalnızca ≥768 px'te gösterilir. */
export function BoardPlate({ className }: { className?: string }) {
  return (
    <Panel
      variant="wood"
      padding="none"
      aria-hidden="true"
      className={`bg-wood p-2.5 shadow-plate max-md:hidden ${className ?? ''}`}
    >
      <svg viewBox="0 0 420 150" className="block h-auto w-full rounded-lg ring-1 ring-action-primary/40">
        <rect width="420" height="150" className="fill-surface-input" />
        {POINTS.map(({ x, red }) => (
          <polygon
            key={x}
            points={`${x - 35},150 ${x},14 ${x + 35},150`}
            strokeWidth="1.1"
            className={red ? 'fill-surface-selected/60 stroke-fg-primary/20' : 'fill-fg-primary/10 stroke-fg-primary/20'}
          />
        ))}
        {POINTS.flatMap(({ x, pieces }) =>
          Array.from({ length: pieces }, (_, i) => (
            <circle
              key={`${x}-${i}`}
              cx={x}
              cy={132 - i * 28}
              r="13"
              strokeWidth="2.5"
              className="fill-action-primary stroke-surface-selected"
            />
          )),
        )}
      </svg>
    </Panel>
  );
}

/** Hero ile içerik arasındaki ahşap ayırıcı çubuk, üç altın perçinle (A3 "rail"). */
export function WoodRail() {
  return (
    <div aria-hidden="true" className="relative h-2.5 rounded-rail bg-wood-rail shadow-rail">
      {['left-5', 'left-1/2 -translate-x-1/2', 'right-5'].map((pos) => (
        <i key={pos} className={`absolute top-1/2 size-1.5 -translate-y-1/2 rounded-pill bg-action-primary ${pos}`} />
      ))}
    </div>
  );
}
