/**
 * ShareLinkCard A3 yapı/erişilebilirlik testleri (Aşama 3.8C). Davranış sözleşmesi `ShareLinkCard.test.tsx`'tir (değişmedi).
 * Mock sınırları: pano `userEvent.setup()` taslağıdır; `navigator.share` testte tanımlanır; ShareLinkCard, QrCode, lib/qr,
 * uiStore ve ui bileşenleri GERÇEKTİR. Testler rol/ad/metne dayanır, CSS sınıfına değil.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShareLinkCard from './ShareLinkCard';
import { useUiStore } from '../store/uiStore';

const originalLocation = window.location;
function setLocation(origin: string, hostname: string) {
  Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, origin, hostname } });
}

beforeEach(() => {
  useUiStore.setState({ toast: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
});

describe('ShareLinkCard A3 — yapı ve adlar', () => {
  it('bölge, "Arkadaşını davet et" h2 başlığıyla adlandırılır; ek h1 yoktur', () => {
    render(<ShareLinkCard roomCode="ABC123" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Arkadaşını davet et' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Arkadaşını davet et' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('üç eylem de erişilebilir adla bulunur ve type="button" (form submit etmez)', () => {
    render(<ShareLinkCard roomCode="ABC123" />);
    for (const name of ['Linki Kopyala', 'Paylaş', 'QR kodu göster']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('type', 'button');
    }
  });

  it('QR düğmesi simge-düğmedir: görünür metni yok, adı aria-label ile verilir', () => {
    render(<ShareLinkCard roomCode="ABC123" />);
    const qr = screen.getByRole('button', { name: 'QR kodu göster' });
    expect(qr).toHaveTextContent('');
    expect(qr).toHaveAttribute('aria-label', 'QR kodu göster');
  });

  it('kart açılışta img rolü içermez (ikonlar dekoratif)', () => {
    render(<ShareLinkCard roomCode="ABC123" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('ShareLinkCard A3 — klavye', () => {
  it('Tab sırası: Linki Kopyala → Paylaş → QR; Space ile kopyalanır', async () => {
    const user = userEvent.setup();
    render(<ShareLinkCard roomCode="ABC123" />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Linki Kopyala' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Paylaş' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'QR kodu göster' })).toHaveFocus();

    await user.tab({ shift: true });
    await user.tab({ shift: true });
    await user.keyboard(' ');
    expect(await screen.findByRole('button', { name: 'Kopyalandı' })).toBeInTheDocument();
  });

  it('QR klavyeyle açılıp kapanır; odak düğmede kalır ve ad/aria-expanded eşlik eder', async () => {
    const user = userEvent.setup();
    render(<ShareLinkCard roomCode="ABC123" />);
    screen.getByRole('button', { name: 'QR kodu göster' }).focus();

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('img', { name: 'ABC123 odasına katılma QR kodu' })).toBeInTheDocument();
    const hide = screen.getByRole('button', { name: 'QR kodu gizle' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    expect(hide).toHaveFocus();

    await user.keyboard(' ');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'QR kodu göster' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('ShareLinkCard A3 — uzun bağlantı ve oda kodu', () => {
  it('çok uzun origin tam metin olarak DOM\'da kalır (kesilmez)', () => {
    const origin = `https://${'cok-uzun-alt-alan-adi.'.repeat(6)}example.com`;
    setLocation(origin, 'x.example.com');
    render(<ShareLinkCard roomCode="ABC123" />);
    expect(screen.getByText(`${origin}/oda/ABC123`).textContent).toBe(`${origin}/oda/ABC123`);
  });

  it('oda kodu değişince bağlantı metni ve QR adı birlikte güncellenir', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ShareLinkCard roomCode="AAAAAA" />);
    await user.click(screen.getByRole('button', { name: 'QR kodu göster' }));
    expect(await screen.findByRole('img', { name: 'AAAAAA odasına katılma QR kodu' })).toBeInTheDocument();

    rerender(<ShareLinkCard roomCode="BBBBBB" />);
    expect(await screen.findByRole('img', { name: 'BBBBBB odasına katılma QR kodu' })).toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/oda/BBBBBB`)).toBeInTheDocument();
    expect(screen.queryByText(`${window.location.origin}/oda/AAAAAA`)).not.toBeInTheDocument();
  });
});

describe('ShareLinkCard A3 — geri bildirim', () => {
  it('kopyalama başarısızsa mevcut hata toast\'u gösterilir ve düğme "Linki Kopyala" kalır', async () => {
    const user = userEvent.setup();
    render(<ShareLinkCard roomCode="ABC123" />);
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Linki Kopyala' }));
    expect(useUiStore.getState().toast?.message).toBe('Bağlantı kopyalanamadı. Adres çubuğundan kopyalayabilirsin.');
    expect(screen.getByRole('button', { name: 'Linki Kopyala' })).toBeInTheDocument();
  });

  it('paylaşım iptali (AbortError) sessizdir: toast yok, "Kopyalandı" yok', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException('iptal', 'AbortError')),
    });
    render(<ShareLinkCard roomCode="ABC123" />);
    await user.click(screen.getByRole('button', { name: 'Paylaş' }));
    expect(useUiStore.getState().toast).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kopyalandı' })).not.toBeInTheDocument();
  });

  it('yerel adres uyarısı yalnızca QR açıkken ve loopback\'te görünür; role="note"', async () => {
    setLocation('http://localhost:5173', 'localhost');
    const user = userEvent.setup();
    render(<ShareLinkCard roomCode="ABC123" />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'QR kodu göster' }));
    const note = await screen.findByRole('note');
    expect(within(note).getByText(/Bu adres yalnızca bu bilgisayarda açılır\./)).toBeInTheDocument();
  });
});
