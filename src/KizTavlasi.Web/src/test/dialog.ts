/**
 * jsdom (29.x) `HTMLDialogElement`'te `showModal()` / `close()` yöntemlerini uygulamaz (ikisi de `undefined`).
 * Bu yardımcı, gerçek tarayıcı davranışının yalnızca BİR BÖLÜMÜNÜ taklit eder:
 *   - showModal: açıksa InvalidStateError fırlatır, `open` özniteliğini ekler, önceki odağı kaydeder
 *   - close: `open`'ı kaldırır, odağı önceki öğeye geri verir, `close` olayını asenkron (microtask) tetikler
 * Taklit edilmeyenler: top layer, arka planın inert olması, Tab odak sınırlandırması, Esc → `cancel`.
 * Bu yüzden buradaki testler birim (mantık) testidir; GERÇEK tarayıcı doğrulaması Playwright/Chromium ile yapılır.
 */
type DialogWithFocus = HTMLDialogElement & { __previousFocus?: Element | null };

export function installDialogPolyfill() {
  const proto = window.HTMLDialogElement.prototype;
  const calls = { showModal: 0, close: 0 };
  const original = { showModal: proto.showModal, close: proto.close };

  proto.showModal = function showModal(this: DialogWithFocus) {
    if (this.hasAttribute('open')) throw new DOMException('Already open', 'InvalidStateError');
    calls.showModal++;
    this.__previousFocus = document.activeElement;
    this.setAttribute('open', '');
  };

  proto.close = function close(this: DialogWithFocus) {
    if (!this.hasAttribute('open')) return;
    calls.close++;
    this.removeAttribute('open');
    const previous = this.__previousFocus;
    this.__previousFocus = null;
    if (previous instanceof HTMLElement) previous.focus();
    queueMicrotask(() => this.dispatchEvent(new Event('close')));
  };

  return {
    calls,
    reset() {
      calls.showModal = 0;
      calls.close = 0;
    },
    uninstall() {
      proto.showModal = original.showModal;
      proto.close = original.close;
    },
  };
}
