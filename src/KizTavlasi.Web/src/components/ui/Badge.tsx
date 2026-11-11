import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type BadgeTone = 'neutral' | 'accent';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** neutral: bilgi etiketi · accent: altın vurgu (rol/seçili bilgi). Anlam her zaman METİNLE verilir, yalnızca renkle değil. */
  tone?: BadgeTone;
  /** Metnin solunda dekoratif ikon (aria-hidden). */
  icon?: ReactNode;
}

const toneClass: Record<BadgeTone, string> = {
  neutral: 'border-line-control bg-surface-input text-fg-secondary',
  accent: 'border-line-accent bg-surface-input text-fg-accent',
};

/** Küçük, salt sunumsal etiket (pill). API/store bilmez. */
export function Badge({ tone = 'neutral', icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5 font-ui text-caption font-medium whitespace-nowrap',
        toneClass[tone],
        className,
      )}
    >
      {icon && (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
