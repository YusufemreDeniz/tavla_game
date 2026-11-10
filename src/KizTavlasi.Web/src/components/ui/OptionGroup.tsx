import { useId } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';

export interface OptionItem<T extends string | number> {
  value: T;
  label: string;
  /** İkincil metin (ör. "1 Puan"). Erişilebilir adın parçasıdır (gizlenmez). */
  hint?: string;
  disabled?: boolean;
}

export interface OptionGroupProps<T extends string | number> {
  /** Grubun görünür başlığı (fieldset > legend). */
  legend: ReactNode;
  options: ReadonlyArray<OptionItem<T>>;
  value: T;
  onChange: (value: T) => void;
  /** 2 veya 3 sütun; mobilde de yan yana kalır. */
  columns?: 2 | 3;
  /** Radyo grubunun adı; verilmezse otomatik üretilir. */
  name?: string;
  disabled?: boolean;
  /** responsive: ≥1101px satır içi pul, altında dikey · stacked: her zaman dikey (dar konteynerler). */
  layout?: 'responsive' | 'stacked';
  className?: string;
}

/**
 * Tekli seçim: native `<input type="radio">` + `<fieldset>`/`<legend>`.
 * Ok tuşları, tek Tab durağı ve `disabled` davranışı tarayıcıdan gelir; ek JS yok.
 * Seçili durum yalnızca renkle değil, dolu pul göstergesi ve kalın kenarlıkla da belirtilir.
 */
export function OptionGroup<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  columns = 3,
  name,
  disabled = false,
  layout = 'responsive',
  className,
}: OptionGroupProps<T>) {
  const autoName = useId();
  const groupName = name ?? autoName;

  return (
    <fieldset disabled={disabled} className={cx('min-w-0 border-0 p-0 font-ui', className)}>
      <legend className="mb-2 block p-0 text-ui-sm leading-tight font-medium text-fg-secondary">{legend}</legend>
      <div className={cx('grid gap-2.5', columns === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
        {options.map((option) => {
          const selected = option.value === value;
          const optionDisabled = disabled || option.disabled;
          return (
            <label
              key={String(option.value)}
              className={cx(
                'relative flex min-h-[78px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-control border px-1.5 py-2.5 text-center transition duration-(--duration-fast)',
                layout === 'responsive' &&
                  'desk:min-h-[62px] desk:flex-row desk:justify-start desk:gap-3 desk:px-3.5 desk:text-left',
                'has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-solid has-focus-visible:outline-line-focus',
                selected
                  ? 'bg-linear-to-b from-surface-selected-top to-surface-selected border-line-selected shadow-option-selected'
                  : 'bg-surface-raised border-line-control',
                optionDisabled
                  ? 'cursor-not-allowed opacity-(--opacity-disabled)'
                  : cx('cursor-pointer', !selected && 'hover:border-line-control-hover hover:bg-surface-hover'),
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={String(option.value)}
                checked={selected}
                disabled={optionDisabled}
                onChange={() => onChange(option.value)}
                className="peer sr-only focus-visible:outline-none"
              />
              <span
                aria-hidden="true"
                className={cx(
                  'size-4 shrink-0 rounded-pill border-2 transition duration-(--duration-fast) desk:size-5',
                  selected
                    ? 'border-line-focus bg-action-primary shadow-[inset_0_0_0_3px_var(--color-surface-selected)]'
                    : 'border-line-indicator bg-transparent',
                )}
              />
              <span className={cx('flex min-w-0 flex-col gap-px', selected ? 'text-fg-primary' : 'text-fg-muted')}>
                <span className="text-ui font-semibold text-fg-primary">{option.label}</span>
                {/* Boşluk: erişilebilir ad "5 El 3 Puana" olur (CSS'siz ortamlarda da kelimeler yapışmaz). */}
                {option.hint && (
                  <>
                    {' '}
                    <span className="text-micro">{option.hint}</span>
                  </>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
