import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx, focusRing } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'type'> {
  /**
   * primary: altın (tek birincil eylem) · secondary: bordo · tertiary: çerçeveli altın ·
   * ghost: nötr çerçeveli, ikincil/araç çubuğu eylemleri (ör. "Kurallar").
   */
  variant?: ButtonVariant;
  /** md: 54 px form eylemi · sm: 44 px araç çubuğu düğmesi. */
  size?: ButtonSize;
  /** true iken düğme gerçekten `disabled` olur ve `aria-busy="true"` alır. */
  loading?: boolean;
  /** loading iken çocukların yerine gösterilecek metin (metin çağıran taraftan gelir). */
  loadingLabel?: ReactNode;
  fullWidth?: boolean;
  /** Metnin solunda gösterilen dekoratif ikon (aria-hidden). loading iken spinner ile değişir. */
  icon?: ReactNode;
  /** Varsayılan `button`: bir <form> içinde yanlışlıkla submit etmez. */
  type?: 'button' | 'submit' | 'reset';
}

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'bg-linear-to-b from-action-primary-from via-action-primary to-action-primary-to border-action-primary-border text-fg-on-gold shadow-button-gold enabled:hover:brightness-110',
  secondary:
    'bg-linear-to-b from-action-secondary-from to-action-secondary border-action-secondary-border text-fg-on-action enabled:hover:from-action-secondary-hover enabled:hover:to-action-secondary-hover',
  tertiary:
    'bg-transparent border-action-tertiary-border text-action-tertiary-fg enabled:hover:border-action-tertiary-border-hover enabled:hover:bg-action-primary/10',
  ghost:
    'bg-transparent border-line-control text-fg-primary enabled:hover:border-line-control-hover enabled:hover:bg-surface-hover',
};

const sizeClass: Record<ButtonSize, string> = {
  md: 'min-h-(--size-button) rounded-control px-5 text-body font-bold',
  sm: 'min-h-(--size-touch-min) rounded-control-sm px-3.5 text-ui-sm font-medium',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  fullWidth = false,
  icon,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2.5 border font-ui transition duration-(--duration-fast)',
        focusRing,
        sizeClass[size],
        variantClass[variant],
        loading ? 'cursor-progress' : 'cursor-pointer disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled)',
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-4 shrink-0 animate-[spin_var(--duration-spin)_linear_infinite] rounded-full border-2 border-current/30 border-t-current"
        />
      ) : (
        icon && (
          <span aria-hidden="true" className="inline-flex shrink-0">
            {icon}
          </span>
        )
      )}
      <span>{loading && loadingLabel !== undefined ? loadingLabel : children}</span>
    </button>
  );
}
