import type { HTMLAttributes } from 'react';
import { cx } from './cx';

export type PanelVariant = 'raised' | 'sunken' | 'outline' | 'wood';
export type PanelPadding = 'none' | 'sm' | 'md' | 'lg';
export type PanelElement = 'div' | 'section' | 'article' | 'aside' | 'li';

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  /** HTML öğesi. Bölge (landmark) gerekiyorsa `section` + `aria-labelledby` kullanın. */
  as?: PanelElement;
  /** raised: kart yüzeyi · sunken: gömülü alan · outline: yalnızca çerçeve · wood: ahşap (yalnızca DESIGN.md §3.3'teki seçili alanlar). */
  variant?: PanelVariant;
  padding?: PanelPadding;
}

const variantClass: Record<PanelVariant, string> = {
  raised: 'bg-surface-raised border-line-subtle',
  sunken: 'bg-surface-input border-line-subtle',
  outline: 'bg-transparent border-line-subtle',
  wood: 'bg-surface-wood border-surface-wood-dark',
};

const paddingClass: Record<PanelPadding, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-8',
};

/** Sadece yüzey: gradient/gölge yok. Gölge gerekiyorsa çağıran semantic `shadow-*` token'ı ekler. */
export function Panel({ as = 'div', variant = 'raised', padding = 'md', className, ...rest }: PanelProps) {
  const Component = as;
  return (
    <Component
      {...rest}
      className={cx('rounded-panel border text-fg-primary', variantClass[variant], paddingClass[padding], className)}
    />
  );
}
