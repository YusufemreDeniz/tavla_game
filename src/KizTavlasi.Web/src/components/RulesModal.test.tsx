import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import RulesModal from './RulesModal';
import { useUiStore } from '../store/uiStore';
import { installDialogPolyfill } from '../test/dialog';

// jsdom'da showModal/close yok → ../test/dialog.ts kısmi taklit. Gerçek tarayıcı davranışı Playwright ile ayrıca doğrulanır.
let polyfill: ReturnType<typeof installDialogPolyfill>;
beforeEach(() => {
  polyfill = installDialogPolyfill();
  useUiStore.setState({ rulesModalOpen: false });
});
afterEach(() => polyfill.uninstall());

const tick = () => act(async () => { await Promise.resolve(); });

/** Oyun kuralları: HEAD'deki RulesModal ile birebir aynı metinler (boşluklar normalize). */
const RULES_PARAGRAPHS = [
  "Her oyuncunun 15 pulu ve 1'den 6'ya numaralı altı hanesi vardır. Başlangıçta 1–3. hanelerde ikişer, 4–6. hanelerde üçer pul bulunur.",
  "Sıran geldiğinde Zar At'a bas, sonra parlayan haneye dokunarak hamleni kendin yap.",
  '1) İndirme: Zarın gösterdiği haneden bir pul indirilir. Her hanede son pul inmez (toplam 9 indirme). O hanede inecek pul yoksa zar boşa gider.',
  '2) Toplama: 9 indirme bitince başlar. Zarın gösterdiği haneden bir pul toplanır; hane boşsa zar boşa gider.',
  'Çift zar = 2×zar hamle: 5-5 atarsan 10 hamle yaparsın. İlk hamle çift atılan haneden zorunludur; o hane oynanamıyorsa el boşa gider. Kalan hakları istediğin hanelerden kullanırsın.',
  'MARS: Sen bitirdiğinde rakip hâlâ indirme aşamasındaysa 1 yerine 2 puan alırsın.',
  'Maç formatları: tek el (1 puan), 3 el üzerinden (2 puan), 5 el üzerinden (3 puan). Sonraki ele kaybeden başlar.',
];

describe('RulesModal', () => {
  it('store kapalıyken görünmez', () => {
    render(<RulesModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('store açıldığında görünür; adı başlıktan gelir; kapat düğmesi adlandırılmıştır', () => {
    render(<RulesModal />);
    act(() => useUiStore.getState().setRulesModalOpen(true));
    const dialog = screen.getByRole('dialog', { name: 'Kız Tavlası Kuralları' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kuralları kapat' })).toBeInTheDocument();
    expect(polyfill.calls.showModal).toBe(1);
  });

  it('kural metinleri değişmeden korunur (7 paragraf)', () => {
    render(<RulesModal />);
    act(() => useUiStore.getState().setRulesModalOpen(true));
    const paragraphs = Array.from(screen.getByRole('dialog').querySelectorAll('p')).map((p) =>
      (p.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    expect(paragraphs).toEqual(RULES_PARAGRAPHS);
  });

  it("kapat düğmesi store'u kapatır ve modal kaybolur", async () => {
    render(<RulesModal />);
    act(() => useUiStore.getState().setRulesModalOpen(true));
    await userEvent.click(screen.getByRole('button', { name: 'Kuralları kapat' }));
    await tick();
    expect(useUiStore.getState().rulesModalOpen).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("Esc (cancel) store'u kapatır; durum ve görünüm tutarlıdır", async () => {
    render(<RulesModal />);
    act(() => useUiStore.getState().setRulesModalOpen(true));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    await tick();
    expect(useUiStore.getState().rulesModalOpen).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("backdrop tıklaması store'u kapatır", async () => {
    render(<RulesModal />);
    act(() => useUiStore.getState().setRulesModalOpen(true));
    fireEvent.click(screen.getByRole('dialog'));
    await tick();
    expect(useUiStore.getState().rulesModalOpen).toBe(false);
  });

  it('store dışarıdan kapatılırsa modal da kapanır', async () => {
    render(<RulesModal />);
    act(() => useUiStore.getState().setRulesModalOpen(true));
    act(() => useUiStore.getState().setRulesModalOpen(false));
    await tick();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tekrar açıp kapatma güvenlidir ve metinler her açılışta tamdır', async () => {
    render(<RulesModal />);
    for (let i = 1; i <= 3; i++) {
      act(() => useUiStore.getState().setRulesModalOpen(true));
      expect(screen.getByRole('dialog')).toHaveTextContent('Sonraki ele kaybeden başlar.');
      await userEvent.click(screen.getByRole('button', { name: 'Kuralları kapat' }));
      await tick();
      expect(useUiStore.getState().rulesModalOpen).toBe(false);
      expect(polyfill.calls.showModal).toBe(i);
    }
  });

  it('kapanışta odak tetikleyici düğmeye döner (tarayıcı odak dönüşü taklidiyle)', async () => {
    render(
      <>
        <button onClick={() => useUiStore.getState().setRulesModalOpen(true)}>Kurallar</button>
        <RulesModal />
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Kurallar' });
    await userEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Kuralları kapat' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Kuralları kapat' }));
    await tick();
    expect(trigger).toHaveFocus();
  });
});
