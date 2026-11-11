import type { ReactNode } from 'react';
import { cx } from './cx';
import { Panel } from './Panel';

export interface StateScreenProps {
  /** Dekoratif ikon (aria-hidden). */
  icon?: ReactNode;
  /** Sayfanın tek <h1>'i (durum mesajı veya ürün adı). */
  title: ReactNode;
  /** Başlığın altındaki açıklama; metin çağıran taraftan gelir. */
  description?: ReactNode;
  /** Başlık/açıklamadan sonra gelen içerik (ör. form). */
  children?: ReactNode;
  /** Eylem düğmeleri: dar ekranda alt alta, geniş ekranda yan yana. */
  actions?: ReactNode;
  /** center: mesaj ekranları · start: form içeren ekranlar. */
  align?: 'center' | 'start';
}

/**
 * Tam sayfa durum ekranı (yükleme dışı): ortalanmış Panel, ahşap şerit, Fraunces başlık, Inter gövde.
 * Yalnızca sunumdan sorumludur; mantık, yönlendirme ve metinler çağıranındadır.
 * Yazı tipleri kendi kapsamındadır (html/body font-family'ye dokunulmaz).
 */
export function StateScreen({ icon, title, description, children, actions, align = 'center' }: StateScreenProps) {
  const centered = align === 'center';
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-5 py-10 font-ui text-fg-primary">
      <Panel padding="none" className="w-full max-w-md p-6 md:p-8">
        <div aria-hidden="true" className="mb-6 h-1.5 w-16 rounded-rail bg-wood-rail shadow-rail" />
        <div className={cx('flex flex-col gap-4', centered && 'items-center text-center')}>
          {icon && (
            <span aria-hidden="true" className="inline-flex text-fg-accent">
              {icon}
            </span>
          )}
          <h1 className="font-brand text-heading-md font-medium tracking-heading text-fg-primary md:text-heading-lg">{title}</h1>
          {description && <p className="text-body text-fg-secondary">{description}</p>}
        </div>
        {children && <div className="mt-6">{children}</div>}
        {actions && <div className={cx('mt-6 flex flex-col gap-3', centered && 'sm:flex-row sm:justify-center')}>{actions}</div>}
      </Panel>
    </main>
  );
}

/** Tam sayfa yükleniyor ekranı: erişilebilir durum (role="status") ve dönen halka (azaltılmış harekette global kuralla durur). */
export function LoadingScreen({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-5 font-ui text-fg-primary">
      <p role="status" className="flex items-center gap-3 text-body text-fg-secondary">
        <span
          aria-hidden="true"
          className="size-5 shrink-0 animate-[spin_var(--duration-spin)_linear_infinite] rounded-full border-2 border-line-accent border-t-transparent"
        />
        {children}
      </p>
    </main>
  );
}
