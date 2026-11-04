import { lazy, Suspense, useState } from 'react';
import { Check, Copy, QrCode as QrIcon, Share2 } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { PRODUCT_NAME } from '../config/branding';

// QR üreteci yalnızca kullanıcı açtığında yüklenir.
const QrCode = lazy(() => import('./QrCode'));

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export default function ShareLinkCard({ roomCode }: { roomCode: string }) {
  const showToast = useUiStore((s) => s.showToast);
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const shareUrl = `${window.location.origin}/oda/${roomCode}`;
  const isLoopback = LOOPBACK_HOSTS.has(window.location.hostname);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Bağlantı kopyalanamadı. Adres çubuğundan kopyalayabilirsin.', 'error');
    }
  };

  const shareLink = async () => {
    const data: ShareData = {
      title: PRODUCT_NAME,
      text: `${PRODUCT_NAME} odasına katıl! Oda kodu: ${roomCode}`,
      url: shareUrl,
    };
    const canShare = typeof navigator.share === 'function' && (navigator.canShare?.(data) ?? true);
    if (!canShare) {
      await copyLink();
      return;
    }
    try {
      await navigator.share(data);
    } catch (error) {
      // Kullanıcı iptal ettiyse sessiz kal; gerçek bir hatada kopyalamaya düş.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        await copyLink();
      }
    }
  };

  return (
    <div className="rounded-2xl border border-gold-500/20 bg-night-800 p-5">
      <p className="mb-1 text-xs uppercase tracking-wider text-cream-400">Oda kodu</p>
      <p className="mb-4 font-mono text-3xl font-bold tracking-[0.35em] text-gold-400">{roomCode}</p>
      <p className="mb-2 break-all rounded-lg bg-night-900 px-3 py-2 font-mono text-xs text-cream-300">
        {shareUrl}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-night-600 bg-night-700 px-4 py-2.5 text-sm font-medium text-cream-100 hover:bg-night-600"
        >
          {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          {copied ? 'Kopyalandı' : 'Linki Kopyala'}
        </button>
        <button
          type="button"
          onClick={shareLink}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-bordo-600 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-bordo-500"
        >
          <Share2 size={16} />
          Paylaş
        </button>
        <button
          type="button"
          onClick={() => setQrOpen((open) => !open)}
          aria-expanded={qrOpen}
          aria-label={qrOpen ? 'QR kodu gizle' : 'QR kodu göster'}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-3 ${
            qrOpen
              ? 'border-gold-500/60 bg-gold-500/15 text-gold-400'
              : 'border-night-600 bg-night-700 text-cream-100 hover:bg-night-600'
          }`}
        >
          <QrIcon size={18} />
        </button>
      </div>

      {qrOpen && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <Suspense
            fallback={<div className="h-[168px] w-[168px] animate-pulse rounded-lg bg-night-700" />}
          >
            <QrCode value={shareUrl} label={`${roomCode} odasına katılma QR kodu`} />
          </Suspense>
          <p className="max-w-xs text-center text-xs text-cream-400">
            Telefon kamerasıyla tara, doğrudan odaya katıl.
          </p>
          {isLoopback && (
            <p role="note" className="max-w-xs text-center text-xs text-amber-300">
              Bu adres yalnızca bu bilgisayarda açılır. Telefondan taramak için sayfayı bilgisayarın
              yerel ağ adresiyle aç (ör. http://192.168.x.x:5173).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
