import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';
import { installDialogPolyfill } from '../../test/dialog';

// NOT: jsdom'da showModal/close yok; ../../test/dialog.ts bunları kısmen taklit eder (top layer, inert, Tab sınırı,
// Esc→cancel YOK). Bu dosya mantık/senkronizasyon testidir; gerçek tarayıcı doğrulaması Playwright ile yapılır.
let polyfill: ReturnType<typeof installDialogPolyfill>;
beforeEach(() => {
  polyfill = installDialogPolyfill();
});
afterEach(() => polyfill.uninstall());

const tick = () => act(async () => { await Promise.resolve(); });

function Harness({ initialOpen = false, onClose }: { initialOpen?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <button onClick={() => setOpen(true)}>Aç</button>
      <button>Diğer</button>
      <Dialog
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        title="Başlık"
        closeLabel="Kapat"
      >
        <p>İçerik metni</p>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('kapalıyken erişilebilir ağaçta yoktur ve showModal çağrılmaz', () => {
    render(<Dialog open={false} onClose={() => {}} title="Başlık" closeLabel="Kapat">x</Dialog>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(polyfill.calls.showModal).toBe(0);
  });

  it('açıkken showModal ile açılır (show değil) ve görünür başlıkla adlandırılır (aria-labelledby)', () => {
    render(<Dialog open onClose={() => {}} title="Kız Tavlası Kuralları" closeLabel="Kapat">x</Dialog>);
    const dialog = screen.getByRole('dialog', { name: 'Kız Tavlası Kuralları' });
    expect(polyfill.calls.showModal).toBe(1);
    expect(dialog.getAttribute('aria-labelledby')).toBe(screen.getByRole('heading', { name: 'Kız Tavlası Kuralları' }).id);
  });

  it('description verilirse aria-describedby ile bağlanır; verilmezse öznitelik yoktur', () => {
    const { rerender } = render(<Dialog open onClose={() => {}} title="T" closeLabel="K">x</Dialog>);
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
    rerender(<Dialog open onClose={() => {}} title="T" closeLabel="K" description="Kısa açıklama">x</Dialog>);
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Kısa açıklama');
  });

  it('kapat düğmesi closeLabel ile adlandırılır ve onClose çağırır', async () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} title="T" closeLabel="Pencereyi kapat">x</Dialog>);
    await userEvent.click(screen.getByRole('button', { name: 'Pencereyi kapat' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('açılışta odak kapat düğmesine verilir', () => {
    render(<Dialog open onClose={() => {}} title="T" closeLabel="Kapat">x</Dialog>);
    expect(screen.getByRole('button', { name: 'Kapat' })).toHaveFocus();
  });

  it('cancel olayı (Esc) varsayılan kapanışı durdurur ve onClose çağırır; kapatmaya karar çağırana aittir', () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} title="T" closeLabel="K">x</Dialog>);
    const dialog = screen.getByRole('dialog');
    const notPrevented = fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(notPrevented).toBe(false); // preventDefault çağrıldı
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveAttribute('open'); // çağıran open=false yapmadıkça açık kalır
  });

  it('Esc sonrası durum tutarlı: çağıran open=false yapınca kapanır ve onClose İKİNCİ kez çağrılmaz', async () => {
    const onClose = vi.fn();
    render(<Harness initialOpen onClose={onClose} />);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    await tick();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(polyfill.calls.close).toBe(1);
    expect(onClose).toHaveBeenCalledTimes(1); // programatik close olayı yok sayıldı
  });

  it('başka yolla native close olayı gelirse durum eşitlenir (onClose çağrılır)', () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} title="T" closeLabel="K">x</Dialog>);
    fireEvent(screen.getByRole('dialog'), new Event('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop (dialog öğesinin kendisi) tıklaması onClose çağırır; içerik tıklaması çağırmaz', async () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} title="T" closeLabel="K"><p>İçerik</p></Dialog>);
    await userEvent.click(screen.getByText('İçerik'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog')); // hedef = dialog ⇒ ::backdrop tıklaması
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('tekrar açma/kapatma: her açılışta showModal, her kapanışta close; hata yok', async () => {
    render(<Harness />);
    for (let i = 1; i <= 3; i++) {
      await userEvent.click(screen.getByRole('button', { name: 'Aç' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Kapat' }));
      await tick();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(polyfill.calls.showModal).toBe(i);
      expect(polyfill.calls.close).toBe(i);
    }
  });

  it('kapanışta odak tetikleyici düğmeye döner (tarayıcı davranışı taklidiyle)', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Aç' });
    await userEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Kapat' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    await tick();
    expect(trigger).toHaveFocus();
  });

  it('açıkken unmount edilirse modal kapatılır ve onClose çağrılmaz', async () => {
    const onClose = vi.fn();
    const { unmount } = render(<Dialog open onClose={onClose} title="T" closeLabel="K">x</Dialog>);
    unmount();
    await tick();
    expect(polyfill.calls.close).toBe(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('StrictMode (çift effect) altında açık kalır ve sahte onClose üretmez', async () => {
    const onClose = vi.fn();
    render(
      <StrictMode>
        <Dialog open onClose={onClose} title="T" closeLabel="K">x</Dialog>
      </StrictMode>,
    );
    await tick();
    await tick();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('showModal desteklemeyen ortamda open özniteliğiyle açılır ve kapanır (hata fırlatmaz)', () => {
    polyfill.uninstall();
    const { rerender } = render(<Dialog open onClose={() => {}} title="T" closeLabel="K">x</Dialog>);
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
    rerender(<Dialog open={false} onClose={() => {}} title="T" closeLabel="K">x</Dialog>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    polyfill = installDialogPolyfill();
  });

  it('en güncel onClose kullanılır (eski closure değil)', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Dialog open onClose={first} title="T" closeLabel="Kapat">x</Dialog>);
    rerender(<Dialog open onClose={second} title="T" closeLabel="Kapat">x</Dialog>);
    await userEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('gövde klavyeyle odaklanabilir (kaydırılabilir bölge) ve içeriği taşır', async () => {
    render(<Dialog open onClose={() => {}} title="T" closeLabel="Kapat"><p>Uzun içerik</p></Dialog>);
    const body = screen.getByText('Uzun içerik').parentElement as HTMLElement;
    expect(body).toHaveAttribute('tabindex', '0');
    expect(body.className).toMatch(/overflow-y-auto/);
    await userEvent.tab(); // kapat düğmesinden gövdeye
    expect(body).toHaveFocus();
  });

  it('başlık Fraunces, gövde Inter yazı tipi sınıflarını kendisi taşır (sayfa font kapsamına bağımlı değil)', () => {
    render(<Dialog open onClose={() => {}} title="Başlık" closeLabel="K">x</Dialog>);
    expect(screen.getByRole('heading', { name: 'Başlık' })).toHaveClass('font-brand');
    expect(screen.getByRole('dialog')).toHaveClass('font-ui');
  });
});
