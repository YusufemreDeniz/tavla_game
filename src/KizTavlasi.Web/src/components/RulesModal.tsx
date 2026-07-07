import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useUiStore } from '../store/uiStore';

export default function RulesModal() {
  const open = useUiStore((s) => s.rulesModalOpen);
  const setOpen = useUiStore((s) => s.setRulesModalOpen);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-night-950/80 p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 12 }}
            role="dialog"
            aria-modal="true"
            aria-label="Oyun kuralları"
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gold-500/20 bg-night-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl text-gold-400">Kız Tavlası Kuralları</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Kuralları kapat"
                className="rounded-lg p-2 text-cream-300 hover:bg-night-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-cream-200">
              <p>
                Her oyuncunun 15 pulu ve 1'den 6'ya numaralı altı hanesi vardır. Başlangıçta
                1–3. hanelerde ikişer, 4–6. hanelerde üçer pul bulunur.
              </p>
              <p>
                Sıran geldiğinde <strong className="text-cream-50">Zar At</strong>'a bas, sonra{' '}
                <strong className="text-gold-400">parlayan haneye dokunarak</strong> hamleni kendin yap.
              </p>
              <p>
                <strong className="text-cream-50">1) İndirme:</strong> Zarın gösterdiği haneden bir
                pul indirilir. Her hanede <strong className="text-cream-50">son pul inmez</strong>{' '}
                (toplam 9 indirme). O hanede inecek pul yoksa zar boşa gider.
              </p>
              <p>
                <strong className="text-cream-50">2) Toplama:</strong> 9 indirme bitince başlar.
                Zarın gösterdiği haneden bir pul toplanır; hane boşsa zar boşa gider.
              </p>
              <p>
                <strong className="text-gold-400">Çift zar = 2×zar hamle:</strong> 5-5 atarsan 10
                hamle yaparsın. İlk hamle çift atılan haneden zorunludur; o hane oynanamıyorsa el
                boşa gider. Kalan hakları istediğin hanelerden kullanırsın.
              </p>
              <p>
                <strong className="text-gold-400">MARS:</strong> Sen bitirdiğinde rakip hâlâ indirme
                aşamasındaysa 1 yerine <strong className="text-cream-50">2 puan</strong> alırsın.
              </p>
              <p>
                Maç formatları: tek el (1 puan), 3 el üzerinden (2 puan), 5 el üzerinden (3 puan).
                Sonraki ele kaybeden başlar.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
