import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx, focusRing } from './cx';

export interface IconButtonProps
  extends Omit<ComponentPropsWithRef<'button'>, 'type' | 'children' | 'aria-label' | 'aria-labelledby'> {
  /** ZORUNLU erişilebilir ad (ör. "Sesi kapat"). Metin çağıran taraftan gelir. */
  label: string;
  /** Dekoratif ikon; bileşen onu aria-hidden yapar. */
  icon: ReactNode;
  type?: 'button' | 'submit' | 'reset';
}

/** En az 44×44 px etkileşim alanı. `aria-pressed`, `aria-expanded` gibi native ARIA özellikleri doğrudan geçer. */
export function IconButton({ label, icon, type = 'button', className, ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      className={cx(
        'inline-flex min-h-(--size-touch-min) min-w-(--size-touch-min) items-center justify-center rounded-control-sm border border-line-control bg-transparent px-3 font-ui text-ui-sm font-medium text-fg-primary transition duration-(--duration-fast)',
        focusRing,
        'cursor-pointer enabled:hover:border-line-control-hover enabled:hover:bg-surface-hover aria-pressed:border-line-selected aria-pressed:bg-surface-hover',
        'disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled)',
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
    </button>
  );
}
