/**
 * Toast erişilebilirlik ve davranış testleri (Aşama 3.9D-2).
 *
 * Gerçek kod yüzeyi: uiStore.toast = { message, kind: 'info' | 'error' } | null (TEK toast; başarı/uyarı türü ve
 * manuel kapatma düğmesi YOKTUR). Bu dosya yalnızca var olan davranışı ve yeni ARIA semantiğini sınar:
 * hata → role="alert" (assertive, ek aria-live yok); info → role="status" + aria-live="polite".
 * Gerçek ekran okuyucu sesi test EDİLMEZ; yalnızca DOM/ARIA semantiği doğrulanır.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Toast from './Toast';
import { useUiStore } from '../store/uiStore';

const show = (message: string, kind?: 'info' | 'error') => act(() => useUiStore.getState().showToast(message, kind));

beforeEach(() => {
  useUiStore.setState({ toast: null });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Toast — rol semantiği', () => {
  it('hata toast\'ı role="alert" taşır ve metni eksiksiz içerir', () => {
    render(<Toast />);
    show('Sıra sende değil.', 'error');
    expect(screen.getByRole('alert')).toHaveTextContent('Sıra sende değil.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('bilgi toast\'ı role="status" taşır (polite)', () => {
    render(<Toast />);
    show('Oyun durumu senkronize edildi, hamleni tekrar yapabilirsin.', 'info');
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Oyun durumu senkronize edildi, hamleni tekrar yapabilirsin.');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('tür verilmezse varsayılan "info": role="status"', () => {
    render(<Toast />);
    show('Merhaba');
    expect(screen.getByRole('status')).toHaveTextContent('Merhaba');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hata toast\'ında çakışan live region yoktur: alert üzerinde aria-live yok, içinde/dışında ikinci live region yok', () => {
    const { container } = render(<Toast />);
    show('Bağlantı kopyalanamadı.', 'error');
    const alert = screen.getByRole('alert');
    expect(alert).not.toHaveAttribute('aria-live');
    expect(alert.querySelector('[aria-live],[role=status],[role=alert],[role=log]')).toBeNull();
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(0);
    expect(container.querySelectorAll('[role=status],[role=alert]')).toHaveLength(1);
  });

  it('bilgi/başarı niteliğindeki mesajlarda assertive duyuru yoktur', () => {
    const { container } = render(<Toast />);
    show('Kopyalandı', 'info');
    expect(container.querySelector('[role=alert]')).toBeNull();
    expect(container.querySelector('[aria-live=assertive]')).toBeNull();
  });

  it('toast kendi içeriğini tekrar okutan aria-label taşımaz ve odak çalmaz', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Önceki odak</button>
        <Toast />
      </>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'Önceki odak' })).toHaveFocus();
    show('Hata oluştu', 'error');
    expect(screen.getByRole('alert')).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('alert')).not.toHaveAttribute('aria-labelledby');
    expect(screen.getByRole('button', { name: 'Önceki odak' })).toHaveFocus();
  });

  it('hata metni yalnızca renkle değil, metinle verilir (erişilebilir metin DOM\'da)', () => {
    render(<Toast />);
    show('Oda oluşturulamadı.', 'error');
    expect(within(screen.getByRole('alert')).getByText('Oda oluşturulamadı.')).toBeInTheDocument();
  });
});

describe('Toast — tür değişimi ve çoklu bildirim (tek toast modeli)', () => {
  it('hata ardından bilgi: toast yerini alır ve rolü doğru olur; tersi de geçerli', () => {
    render(<Toast />);
    show('Hata', 'error');
    expect(screen.getByRole('alert')).toHaveTextContent('Hata');
    show('Bilgi', 'info');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Bilgi');
    show('Yine hata', 'error');
    expect(screen.getByRole('alert')).toHaveTextContent('Yine hata');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('aynı hata art arda gösterildiğinde tek öğe kalır ve süre yeniden başlar (mevcut davranış)', () => {
    vi.useFakeTimers();
    render(<Toast />);
    show('Sıra sende değil.', 'error');
    act(() => void vi.advanceTimersByTime(3000));
    show('Sıra sende değil.', 'error');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(3000)); // ilk gösterimden 6 sn, ikinciden 3 sn
    expect(useUiStore.getState().toast).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1000));
    expect(useUiStore.getState().toast).toBeNull();
  });
});

describe('Toast — yaşam döngüsü', () => {
  it('store üzerinden tetiklenir; clearToast ile DOM\'dan kalkar', async () => {
    render(<Toast />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    show('Hata', 'error');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => useUiStore.getState().clearToast());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('otomatik kapanma süresi 4000 ms\'dir (3999 ms\'de açık, 4000 ms\'de store temizlenir)', () => {
    vi.useFakeTimers();
    render(<Toast />);
    show('Bilgi', 'info');
    act(() => void vi.advanceTimersByTime(3999));
    expect(useUiStore.getState().toast).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(useUiStore.getState().toast).toBeNull();
  });

  it('otomatik kapanma sonrası DOM\'dan kalkar (hata)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Toast />);
    show('Hata', 'error');
    act(() => void vi.advanceTimersByTime(4000));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('mevcut durumda manuel kapatma düğmesi yoktur (davranış değişmedi); toast etkileşimli öğe içermez', () => {
    render(<Toast />);
    show('Hata', 'error');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
