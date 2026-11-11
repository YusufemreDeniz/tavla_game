import { lazy, Suspense, useState } from 'react';
import { Check, Copy, Info, QrCode as QrIcon, Share2 } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { PRODUCT_NAME } from '../config/branding';
import { Button, IconButton, Notice, Panel } from './ui';

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
    <Panel as="section" aria-labelledby="share-heading" className="font-ui shadow-plate">
      <h2 id="share-heading" className="mb-4 font-brand text-heading-md text-fg-primary">
        Arkadaşını davet et
      </h2>

      <p className="mb-1 text-caption tracking-wider text-fg-muted uppercase">Oda kodu</p>
      <p className="mb-4 font-code text-heading-lg tracking-[0.35em] break-all text-fg-accent">{roomCode}</p>

      <div className="space-y-2.5 rounded-control border border-line-subtle bg-surface-input p-3">
        <p className="font-code text-ui-sm break-all text-fg-secondary">{shareUrl}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={copyLink}
            className="min-w-0 flex-1"
            icon={copied ? <Check size={16} className="text-status-success-fg" /> : <Copy size={16} />}
          >
            {copied ? 'Kopyalandı' : 'Linki Kopyala'}
          </Button>
          <Button variant="secondary" size="sm" onClick={shareLink} className="min-w-0 flex-1" icon={<Share2 size={16} />}>
            Paylaş
          </Button>
          <IconButton
            onClick={() => setQrOpen((open) => !open)}
            aria-expanded={qrOpen}
            label={qrOpen ? 'QR kodu gizle' : 'QR kodu göster'}
            icon={<QrIcon size={18} />}
            className="aria-expanded:border-line-selected aria-expanded:bg-surface-hover"
          />
        </div>
      </div>

      {qrOpen && (
        <div className="mt-4 flex flex-col items-center gap-3">
          <Suspense fallback={<div className="h-[168px] w-[168px] animate-pulse rounded-lg bg-surface-hover" />}>
            <QrCode value={shareUrl} label={`${roomCode} odasına katılma QR kodu`} />
          </Suspense>
          <p className="max-w-xs text-center text-ui-sm text-fg-secondary">
            Telefon kamerasıyla tara, doğrudan odaya katıl.
          </p>
          {isLoopback && (
            <Notice role="note" icon={<Info size={16} />} className="max-w-xs py-3 text-ui-sm">
              Bu adres yalnızca bu bilgisayarda açılır. Telefondan taramak için sayfayı bilgisayarın
              yerel ağ adresiyle aç (ör. http://192.168.x.x:5173).
            </Notice>
          )}
        </div>
      )}
    </Panel>
  );
}
