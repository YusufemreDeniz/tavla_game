import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export interface NoticeProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Metnin solunda dekoratif ikon (aria-hidden). */
  icon?: ReactNode;
}

/**
 * Kısa bilgi/bekleme mesajı. `role="status"` gibi ARIA nitelikleri çağıran taraftan gelir
 * (canlı bölge anlamı bu bileşenin kararı değildir). API/store bilmez.
 */
export function Notice({ icon, className, children, ...rest }: NoticeProps) {
  return (
    <p
      {...rest}
      className={cx(
        'flex items-center justify-center gap-2 rounded-control border border-line-subtle bg-surface-raised px-4 py-3.5 text-center font-ui text-ui text-fg-secondary',
        className,
      )}
    >
      {icon && (
        <span aria-hidden="true" className="inline-flex shrink-0 text-fg-accent">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </p>
  );
}
