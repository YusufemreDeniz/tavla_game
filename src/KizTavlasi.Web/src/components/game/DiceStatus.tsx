import { PIP_LAYOUTS } from '../../lib/dicePips';
import { cx } from '../ui/cx';

interface DiceStatusProps {
  dice: [number, number];
  /** diceUsage() sonucu: true = hamlesi oynandı / boşa gitti. */
  used: [boolean, boolean];
}

/**
 * Kontrol çubuğundaki küçük zar durumu şeridi (salt sunumsal): hangi zar hâlâ oynanabilir, hangisi kullanıldı.
 * Zar yüzleri aria-hidden'dır (gerçek zarlar DiceArena'da `img` olarak tek kez verilir); anlam metinle de verilir.
 */
export function DiceStatus({ dice, used }: DiceStatusProps) {
  return (
    <div
      data-testid="dice-status"
      role="group"
      aria-label="Zarlar"
      className="flex shrink-0 items-center gap-1.5"
    >
      {dice.map((value, index) => (
        <span
          key={index}
          data-testid="dice-status-item"
          data-used={used[index] ? 'true' : 'false'}
          className={cx(
            'relative block size-7 rounded-control-sm border transition-opacity duration-(--duration-fast) md:size-8',
            used[index]
              ? 'border-line-subtle bg-surface-input opacity-45'
              : 'border-line-selected bg-stone-300 shadow-option-selected',
          )}
        >
          <span aria-hidden="true" className="absolute inset-0">
            {PIP_LAYOUTS[value].map(([x, y], pip) => (
              <span
                key={pip}
                className={cx(
                  'absolute size-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full',
                  used[index] ? 'bg-fg-muted' : value === 1 ? 'bg-bordo-600' : 'bg-ink-900',
                )}
                style={{ left: `${x}%`, top: `${y}%` }}
              />
            ))}
          </span>
          <span className="sr-only">
            {value} {used[index] ? 'kullanıldı' : 'kullanılabilir'}
          </span>
        </span>
      ))}
    </div>
  );
}
