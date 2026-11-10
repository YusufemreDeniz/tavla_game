/**
 * ShareLinkCard KARAKTERİZASYON testleri (Aşama 3.8A): mevcut davranışı belgeler.
 *
 * Mock sınırları:
 *  - Pano: `userEvent.setup()` jsdom'a bir `navigator.clipboard` taslağı kurar (gerçek yazma/okuma davranışı taklidi).
 *    Başarısızlık `writeText`'in reddedilmesiyle simüle edilir. Gerçek tarayıcı izin modeli test EDİLMEZ.
 *  - `navigator.share`/`canShare` jsdom'da yoktur; testler gerektiğinde tanımlar/siler.
 *  - `window.location` yalnızca origin/hostname'i değiştirmek için geçici olarak sarılır.
 *  - ShareLinkCard, QrCode (lazy), lib/qr ve uiStore GERÇEKTİR; QR içeriği SVG'den geri çözülerek (jsQR) doğrulanır.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import jsQR from 'jsqr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShareLinkCard from './ShareLinkCard';
import { useUiStore } from '../store/uiStore';
import { PRODUCT_NAME } from '../config/branding';

const originalLocation = window.location;

function setLocation(origin: string, hostname: string) {
  Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, origin, hostname } });
}

const inviteUrl = (code: string) => `${window.location.origin}/oda/${code}`;

/** Render edilen QR <svg>'sini piksellere çevirip bağımsız çözücüyle (jsQR) okur. */
function decodeQr(svg: SVGSVGElement): string | null {
  const dimension = Number(svg.getAttribute('viewBox')?.split(' ')[2]);
  const d = svg.querySelector('path')?.getAttribute('d') ?? '';
  const scale = 4;
  const width = dimension * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const match of d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const offset = ((y * scale + dy) * width + (x * scale + dx)) * 4;
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
      }
    }
  }
  return jsQR(pixels, width, width, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

const qrImage = (code: string) => screen.findByRole('img', { name: `${code} odasına katılma QR kodu` });

beforeEach(() => {
  useUiStore.setState({ toast: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
});

describe('ShareLinkCard — gösterim ve bağlantı', () => {
  it('oda kodunu ve davet bağlantısını gösterir (origin + /oda/KOD)', () => {
    render(<ShareLinkCard roomCode="7K9M2X" />);
    expect(screen.getByText('Oda kodu')).toBeInTheDocument();
    expect(screen.getByText('7K9M2X')).toBeInTheDocument();
    expect(screen.getByText(inviteUrl('7K9M2X'))).toBeInTheDocument();
  });

  it('bağlantı geçerli sayfanın origin\'inden üretilir (sabit localhost değil)', () => {
    setLocation('https://kiztavlasi.example.com', 'kiztavlasi.example.com');
    render(<ShareLinkCard roomCode="ABC123" />);
    expect(screen.getByText('https://kiztavlasi.example.com/oda/ABC123')).toBeInTheDocument();
  });

  it('oda kodu değişince kod ve bağlantı güncellenir', () => {
    const { rerender } = render(<ShareLinkCard roomCode="AAAAAA" />);
    expect(screen.getByText('AAAAAA')).toBeInTheDocument();
    rerender(<ShareLinkCard roomCode="BBBBBB" />);
    expect(screen.queryByText('AAAAAA')).not.toBeInTheDocument();
    expect(screen.getByText('BBBBBB')).toBeInTheDocument();
    expect(screen.getByText(inviteUrl('BBBBBB'))).toBeInTheDocument();
  });

  it('eylemler erişilebilir adlarla sunulur; QR düğmesi aria-expanded taşır', () => {
    render(<ShareLinkCard roomCode="ABC123" />);
    expect(screen.getByRole('button', { name: 'Linki Kopyala' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paylaş' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'QR kodu göster' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('ShareLinkCard — panoya kopyalama', () => {
  it('"Linki Kopyala" davet bağlantısını panoya yazar ve "Kopyalandı" durumunu gösterir', async () => {
    const user = userEvent.setup();
    render(<ShareLinkCard roomCode="ABC123" />);

    await user.click(screen.getByRole('button', { name: 'Linki Kopyala' }));

    expect(await screen.findByRole('button', { name: 'Kopyalandı' })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(inviteUrl('ABC123'));
  });

  it('"Kopyalandı" durumu 2 saniye sonra eski haline döner', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ShareLinkCard roomCode="ABC123" />);

    await user.click(screen.getByRole('button', { name: 'Linki Kopyala' }));
    expect(await screen.findByRole('button', { name: 'Kopyalandı' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1900);
    });
    expect(screen.getByRole('button', { name: 'Kopyalandı' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole('button', { name: 'Linki Kopyala' })).toBeInTheDocument();
  });

  it('kopyalanan bağlantı güncel oda koduna aittir (oda kodu değiştikten sonra)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ShareLinkCard roomCode="AAAAAA" />);
    rerender(<ShareLinkCard roomCode="BBBBBB" />);

    await user.click(screen.getByRole('button', { name: 'Linki Kopyala' }));
    expect(await navigator.clipboard.readText()).toBe(inviteUrl('BBBBBB'));
  });

  it('pano reddedilirse Türkçe hata toast\'ı gösterilir ve düğme "Kopyalandı"ya geçmez', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('izin yok', 'NotAllowedError'));
    render(<ShareLinkCard roomCode="ABC123" />);

    await user.click(screen.getByRole('button', { name: 'Linki Kopyala' }));

    expect(useUiStore.getState().toast).toEqual({
      message: 'Bağlantı kopyalanamadı. Adres çubuğundan kopyalayabilirsin.',
      kind: 'error',
    });
    expect(screen.getByRole('button', { name: 'Linki Kopyala' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kopyalandı' })).not.toBeInTheDocument();
  });

  it('kopyalandıktan hemen sonra unmount edilirse bekleyen zamanlayıcı hata üretmez', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<ShareLinkCard roomCode="ABC123" />);

    await user.click(screen.getByRole('button', { name: 'Linki Kopyala' }));
    await screen.findByRole('button', { name: 'Kopyalandı' });
    unmount();
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('ShareLinkCard — Paylaş', () => {
  const sharedData = (code: string) => ({
    title: PRODUCT_NAME,
    text: `${PRODUCT_NAME} odasına katıl! Oda kodu: ${code}`,
    url: inviteUrl(code),
  });

  it('Web Share API destekleniyorsa başlık, metin ve bağlantıyla çağrılır; panoya yazılmaz', async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<ShareLinkCard roomCode="ABC123" />);

    await user.click(screen.getByRole('button', { name: 'Paylaş' }));

    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith(sharedData('ABC123'));
    expect(await navigator.clipboard.readText()).toBe('');
    expect(screen.queryByRole('button', { name: 'Kopyalandı' })).not.toBeInTheDocument();
  });

  it('Web Share API yoksa bağlantıyı panoya kopyalar', async () => {
    const user = userEvent.setup();
    render(<ShareLinkCard roomCode="ABC123" />);

    await user.click(screen.getByRole('button', { name: 'Paylaş' }));

    expect(await screen.findByRole('button', { name: 'Kopyalandı' })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(inviteUrl('ABC123'));
  });

  it('canShare veriyi paylaşılamaz bulursa kopyalamaya düşer ve share çağrılmaz', async () => {
    const user = userEvent.setup();
    const share = vi.fn();
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn().mockReturnValue(false) });
    render(<ShareLinkCard roomCode="ABC123" />);

    await user.click(screen.getByRole('button', { name: 'Paylaş' }));

    expect(share).not.toHaveBeenCalled();
    expect(await navigator.clipboard.readText()).toBe(inviteUrl('ABC123'));
  });

  it('kullanıcı paylaşımı iptal ederse (AbortError) sessiz kalır: kopyalama ve toast yok', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException('iptal', 'AbortError')),
    });
    render(<ShareLinkCard roomCode="ABC123" />);

    await user.click(screen.getByRole('button', { name: 'Paylaş' }));

    expect(await navigator.clipboard.readText()).toBe('');
    expect(useUiStore.getState().toast).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kopyalandı' })).not.toBeInTheDocument();
  });

  it('gerçek bir paylaşım hatasında bağlantı kopyalanır', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException('başarısız', 'NotAllowedError')),
    });
    render(<ShareLinkCard roomCode="ABC123" />);

    await user.click(screen.getByRole('button', { name: 'Paylaş' }));

    expect(await screen.findByRole('button', { name: 'Kopyalandı' })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(inviteUrl('ABC123'));
  });
});

describe('ShareLinkCard — QR kod', () => {
  it('QR yalnızca düğmeyle açılır ve kapanır; aria-expanded ve ad durumu yansıtır', async () => {
    const user = userEvent.setup();
    render(<ShareLinkCard roomCode="ABC123" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'QR kodu göster' }));
    expect(await qrImage('ABC123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'QR kodu gizle' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Telefon kamerasıyla tara, doğrudan odaya katıl.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'QR kodu gizle' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'QR kodu göster' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('QR düğmesi klavyeyle (Enter) açılır', async () => {
    const user = userEvent.setup();
    render(<ShareLinkCard roomCode="ABC123" />);
    screen.getByRole('button', { name: 'QR kodu göster' }).focus();
    await user.keyboard('{Enter}');
    expect(await qrImage('ABC123')).toBeInTheDocument();
  });

  it('QR, davet bağlantısının KENDİSİNİ kodlar (SVG piksellere çevrilip bağımsız çözücüyle okunur)', async () => {
    const user = userEvent.setup();
    render(<ShareLinkCard roomCode="7K9M2X" />);
    await user.click(screen.getByRole('button', { name: 'QR kodu göster' }));

    const svg = (await qrImage('7K9M2X')) as unknown as SVGSVGElement;
    expect(decodeQr(svg)).toBe(inviteUrl('7K9M2X'));
  });

  it('QR içeriği geçerli origin\'i izler (alan adı değişince kodlanan bağlantı da değişir)', async () => {
    setLocation('https://kiztavlasi.example.com', 'kiztavlasi.example.com');
    const user = userEvent.setup();
    render(<ShareLinkCard roomCode="HJKMNP" />);
    await user.click(screen.getByRole('button', { name: 'QR kodu göster' }));

    const svg = (await qrImage('HJKMNP')) as unknown as SVGSVGElement;
    expect(decodeQr(svg)).toBe('https://kiztavlasi.example.com/oda/HJKMNP');
  });

  it('oda kodu QR açıkken değişirse QR yeni bağlantıyı kodlar', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ShareLinkCard roomCode="AAAAAA" />);
    await user.click(screen.getByRole('button', { name: 'QR kodu göster' }));
    expect(decodeQr((await qrImage('AAAAAA')) as unknown as SVGSVGElement)).toBe(inviteUrl('AAAAAA'));

    rerender(<ShareLinkCard roomCode="BBBBBB" />);
    expect(decodeQr((await qrImage('BBBBBB')) as unknown as SVGSVGElement)).toBe(inviteUrl('BBBBBB'));
  });

  it.each([
    ['localhost', true],
    ['127.0.0.1', true],
    ['[::1]', true],
    ['kiztavlasi.example.com', false],
    ['192.168.1.42', false],
  ])('yerel adres uyarısı (role=note): %s → %s', async (hostname, expected) => {
    setLocation(`http://${hostname}:5173`, hostname);
    const user = userEvent.setup();
    render(<ShareLinkCard roomCode="ABC123" />);
    await user.click(screen.getByRole('button', { name: 'QR kodu göster' }));
    await qrImage('ABC123');

    if (expected) {
      expect(screen.getByRole('note')).toHaveTextContent('Bu adres yalnızca bu bilgisayarda açılır.');
    } else {
      expect(screen.queryByRole('note')).not.toBeInTheDocument();
    }
  });
});
