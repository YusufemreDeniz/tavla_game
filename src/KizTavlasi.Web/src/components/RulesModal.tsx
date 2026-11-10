import { useUiStore } from '../store/uiStore';
import { Dialog } from './ui';

/**
 * Oyun kuralları penceresi. Açık/kapalı durum `useUiStore` üzerinden yönetilir (HomePage ve RoomPage'deki
 * tetikleyiciler `setRulesModalOpen(true)` çağırır). Erişilebilirlik ve odak yönetimi `ui/Dialog` (native <dialog>) içindedir.
 * Kural metinleri değişmeden korunmuştur.
 */
export default function RulesModal() {
  const open = useUiStore((s) => s.rulesModalOpen);
  const setOpen = useUiStore((s) => s.setRulesModalOpen);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Kız Tavlası Kuralları" closeLabel="Kuralları kapat">
      <div className="space-y-3 text-ui leading-relaxed text-fg-prose">
        <p>
          Her oyuncunun 15 pulu ve 1'den 6'ya numaralı altı hanesi vardır. Başlangıçta
          1–3. hanelerde ikişer, 4–6. hanelerde üçer pul bulunur.
        </p>
        <p>
          Sıran geldiğinde <strong className="font-semibold text-fg-primary">Zar At</strong>'a bas, sonra{' '}
          <strong className="font-semibold text-fg-accent">parlayan haneye dokunarak</strong> hamleni kendin yap.
        </p>
        <p>
          <strong className="font-semibold text-fg-primary">1) İndirme:</strong> Zarın gösterdiği haneden bir
          pul indirilir. Her hanede <strong className="font-semibold text-fg-primary">son pul inmez</strong>{' '}
          (toplam 9 indirme). O hanede inecek pul yoksa zar boşa gider.
        </p>
        <p>
          <strong className="font-semibold text-fg-primary">2) Toplama:</strong> 9 indirme bitince başlar.
          Zarın gösterdiği haneden bir pul toplanır; hane boşsa zar boşa gider.
        </p>
        <p>
          <strong className="font-semibold text-fg-accent">Çift zar = 2×zar hamle:</strong> 5-5 atarsan 10
          hamle yaparsın. İlk hamle çift atılan haneden zorunludur; o hane oynanamıyorsa el
          boşa gider. Kalan hakları istediğin hanelerden kullanırsın.
        </p>
        <p>
          <strong className="font-semibold text-fg-accent">MARS:</strong> Sen bitirdiğinde rakip hâlâ indirme
          aşamasındaysa 1 yerine <strong className="font-semibold text-fg-primary">2 puan</strong> alırsın.
        </p>
        <p>
          Maç formatları: tek el (1 puan), 3 el üzerinden (2 puan), 5 el üzerinden (3 puan).
          Sonraki ele kaybeden başlar.
        </p>
      </div>
    </Dialog>
  );
}
