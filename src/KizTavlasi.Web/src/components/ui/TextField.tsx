import { useId } from 'react';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { cx } from './cx';

export interface TextFieldProps extends Omit<ComponentPropsWithRef<'input'>, 'id' | 'children'> {
  /** Görünür etiket (zorunlu): <label htmlFor> ile bağlanır. */
  label: ReactNode;
  /** Verilmezse otomatik üretilir. */
  id?: string;
  /** Yardımcı metin; `aria-describedby` ile bağlanır. */
  hint?: ReactNode;
  /** Doluysa alan geçersiz sayılır: `aria-invalid`, hata rengi ve `role="alert"` mesajı. */
  error?: ReactNode;
  /** Oda kodu gibi değerler için mono, büyük harf görünüm (yalnızca görsel; veri dönüşümü çağıranın işi). */
  mono?: boolean;
}

export function TextField({
  label,
  id,
  hint,
  error,
  mono = false,
  className,
  'aria-describedby': describedByProp,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const hasError = Boolean(error);
  const describedBy =
    [describedByProp, hint ? hintId : undefined, hasError ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <div className="w-full font-ui">
      <label htmlFor={inputId} className="mb-2 block text-ui-sm leading-tight font-medium text-fg-secondary">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={hasError ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          'w-full rounded-control border bg-surface-input px-4 text-body text-fg-primary outline-hidden transition duration-(--duration-fast) placeholder:text-fg-placeholder placeholder:normal-case placeholder:tracking-normal',
          // font-code / font-ui birbirini ezmesin diye aileler koşullu seçilir (CSS sırasına bağımlılık yok).
          mono ? 'h-(--size-button) font-code text-xl font-medium tracking-code uppercase' : 'h-(--size-control) font-ui',
          hasError
            ? 'border-status-error-border focus-visible:shadow-(--focus-glow-error)'
            : 'border-line-control enabled:hover:border-line-control-hover focus-visible:border-line-focus focus-visible:shadow-(--focus-glow)',
          'disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled)',
          className,
        )}
      />
      {hint && (
        <p id={hintId} className="mt-2 text-ui-sm text-fg-muted">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={errorId} role="alert" className="mt-2 flex items-start gap-1.5 text-caption text-status-error-fg">
          <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
