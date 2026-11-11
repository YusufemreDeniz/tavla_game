import { useId, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from './cx';
import { IconButton } from './IconButton';

export interface DialogProps {
  /** Kontrollü durum: true iken `showModal()` ile açılır, false iken kapatılır. */
  open: boolean;
  /**
   * Kapatma isteği (Esc, kapat düğmesi, backdrop tıklaması). Bileşen durumu kendisi değiştirmez:
   * çağıran `open`'ı false yapınca dialog kapanır.
   */
  onClose: () => void;
  /** Görünür başlık; dialog'un erişilebilir adı (`aria-labelledby`). */
  title: ReactNode;
  /** Kapat düğmesinin erişilebilir adı (metin çağıran taraftan gelir). */
  closeLabel: string;
  /** İsteğe bağlı kısa açıklama: görünür paragraf olarak gösterilir ve `aria-describedby` ile bağlanır. */
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Native `<dialog>` + `showModal()` tabanlı modal.
 *
 * Tarayıcının sağladıkları (ek JS yok): top layer, arka planın inert olması, Tab/Shift+Tab odağının sayfa
 * içeriğine kaçmaması, Esc (`cancel`), kapanışta odağın önceki öğeye dönmesi.
 *
 * Bu bileşenin eklediği: kontrollü `open`, `cancel`/`close` olaylarının React durumuyla senkronu, açılışta odağın
 * kapat düğmesine verilmesi, backdrop tıklaması, StrictMode/unmount güvenliği, `showModal` olmayan ortamlar için
 * `open` özniteliği geri dönüşü.
 */
export function Dialog({ open, onClose, title, closeLabel, description, children, className }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);
  /** Programatik `close()` çağrısının ardından gelen (asenkron) `close` olayını yok saymak için. */
  const programmaticCloseRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    openRef.current = open;
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
      closeRef.current?.focus();
    } else if (!open && el.open) {
      programmaticCloseRef.current = true;
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    }
  }, [open]);

  // Unmount (veya StrictMode'un deneme unmount'u): açık kalan modal'ı kapat; odak tetikleyiciye döner.
  useLayoutEffect(() => {
    const el = dialogRef.current;
    return () => {
      if (el?.open) {
        programmaticCloseRef.current = true;
        if (typeof el.close === 'function') el.close();
        else el.removeAttribute('open');
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Esc: varsayılan kapanışı durdurup kararı React durumuna bırakır (kontrollü bileşen).
      onCancel={(e) => {
        e.preventDefault();
        onCloseRef.current();
      }}
      // Başka yollarla (ör. ikinci Esc, form method=dialog) native kapanma: durumu eşitle.
      onClose={() => {
        if (programmaticCloseRef.current) {
          programmaticCloseRef.current = false;
          return;
        }
        if (openRef.current) onCloseRef.current();
      }}
      // Yalnızca ::backdrop tıklamaları hedef olarak dialog'un kendisini verir (içerik iç sarmalayıcıdadır).
      onClick={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-135 overflow-visible bg-transparent p-0 font-ui text-fg-primary backdrop:bg-surface-overlay/80"
    >
      <div
        className={cx(
          'flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-dialog border-[7px] border-surface-wood bg-surface-raised shadow-dialog',
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 pt-4.5 pr-5 pb-2 pl-6">
          <h2 id={titleId} className="font-brand text-heading-md font-medium tracking-heading text-fg-accent">
            {title}
          </h2>
          <IconButton ref={closeRef} label={closeLabel} icon={<X size={18} />} onClick={() => onCloseRef.current()} />
        </div>
        {description && (
          <p id={descriptionId} className="shrink-0 px-6 pb-1 text-ui-sm text-fg-secondary">
            {description}
          </p>
        )}
        {/*
          Kaydırılabilir gövde: klavyeyle odaklanıp ok tuşlarıyla kaydırılabilir. Odak halkası İÇTEN (ring-inset):
          dış outline, overflow-hidden çerçeve tarafından kırpılırdı. outline-hidden: zorlanmış renk modunda görünür kalır.
        */}
        <div
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto rounded-lg px-6 pt-2 pb-5.5 outline-hidden focus-visible:ring-3 focus-visible:ring-line-focus focus-visible:ring-inset"
        >
          {children}
        </div>
      </div>
    </dialog>
  );
}
