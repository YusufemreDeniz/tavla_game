import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { PRODUCT_NAME } from '../config/branding';

export default function ShareLinkCard({ roomCode }: { roomCode: string }) {
  const showToast = useUiStore((s) => s.showToast);
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/oda/${roomCode}`;

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
    if (navigator.share) {
      try {
        await navigator.share({
          title: PRODUCT_NAME,
          text: `${PRODUCT_NAME} odasına katıl! Oda kodu: ${roomCode}`,
          url: shareUrl,
        });
      } catch {
        // Kullanıcı paylaşımı iptal etti.
      }
    } else {
      await copyLink();
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
      </div>
    </div>
  );
}
