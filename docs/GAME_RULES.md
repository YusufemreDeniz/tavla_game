# Kız Tavlası — Oyun Kuralları

Bu doküman, uygulamanın `KizTavlasi.Domain` katmanındaki `GameEngine` tarafından uygulanan
kuralların tek referans kaynağıdır. Kurallar yalnızca sunucuda çalışır; istemci hiçbir kural
hesaplamaz, yalnızca sunucudan gelen adımları animasyonla gösterir.

## 1. Başlangıç Dizilimi

Her oyuncunun 15 pulu ve 1–6 numaralı altı hanesi vardır.

| Hane | Başlangıç pul sayısı |
|------|----------------------|
| 1    | 2 |
| 2    | 2 |
| 3    | 2 |
| 4    | 3 |
| 5    | 3 |
| 6    | 3 |

## 2. Oyuna Başlama

- Sunucu her iki oyuncu için birer zar üretir; yüksek atan başlar.
- Eşitlik durumunda sunucu yeniden zar atar; tüm atışlar animasyon için istemciye gönderilir.

## 3. Hamleleri Oyuncu Yapar

Zar sunucuda atılır; **hamleleri oyuncu kendisi yapar**: parlayan haneye dokunur,
sunucu hamleyi doğrulayıp uygular. Oynanamayan zarlar sunucu tarafından anında
boşa sayılır. Tüm hamleler bitmeden sıra rakibe geçmez.

## 4. Aşama 1 — İndirme

1. Zarın gösterdiği haneye dokunularak **bir pul indirilir** (öne alınır).
2. **Hanedeki son pul indirilmez**: her haneden en fazla `pulSayısı - 1` pul iner
   (2'li hanelerden 1, 3'lü hanelerden 2 — toplam **9 indirme**).
3. O hanede indirilecek pul yoksa **zar boşa gider** (başka haneye bakılmaz).

Örnek: 6 ve 3 attıysanız 6. haneden ve 3. haneden birer pul indirirsiniz. 5 attığınızda
5. hanede indirilecek pul kalmadıysa o zar oynanmaz.

## 5. Aşama 2 — Toplama

Bir oyuncu 9 indirmeyi tamamlayınca (tüm haneler son pula düşünce) **toplama** başlar:

1. Zarın gösterdiği haneye dokunularak **bir pul toplanır** (inen + kalan tüm pullar).
2. O hane boşsa **zar boşa gider**.

Aynı atış içinde indirme biterse kalan hamleler toplamada kullanılabilir.

## 6. Çift Zar = 2×Zar Hamle (her iki aşamada)

Çift atan oyuncu **toplam 2×zar hamle** yapar. Örnekler: 5-5 → 10 indirme hakkı,
3-3 (toplarken) → 6 pul.

- İlk hamle **çift atılan haneden** yapılmak zorundadır.
- Kalan haklar (örnekte 9 veya 5) **oyuncunun istediği hanelerden** tek tek oynanır;
  hamleler bitene kadar sıra rakibe geçmez.
- Çift atılan hane **oynanamıyorsa el tamamen boşa gider** ve sıra rakibe geçer
  (indirmede: hanede inecek pul yoksa; toplamada: hane boşsa).
- İndirme sırasında haklar bitmeden 9 indirme tamamlanırsa kalan haklar toplamaya geçer.

## 7. El Sonu ve MARS

15 pulunu ilk toplayan oyuncu eli kazanır ve normalde **1 puan** alır.

**MARS:** Kazanan bittiğinde rakip hâlâ indirme aşamasındaysa (9 indirmeyi tamamlamadıysa)
el **MARS** ile biter ve kazanan **2 puan** alır. Ekranda büyük MARS kutlaması gösterilir.

Sonraki ele önceki eli **kaybeden** oyuncu başlar.

## 8. Maç Formatı

| Format | Gerekli puan |
|--------|--------------|
| Tek el | 1 |
| 3 el üzerinden | 2 |
| 5 el üzerinden | 3 |

Gerekli puana ulaşan oyuncu maçı kazanır (mars 2 puan sayıldığı için maçı tek elde
bitirebilir). Maç sonunda rövanş istenebilir.

## 9. Yapılandırılabilir Kurallar

```csharp
public sealed class GameRulesOptions
{
    public bool DoubleGrantsBonusCollects { get; init; } = true; // Çift = 2×zar hamle
    public bool MarsScoresDouble { get; init; } = true;          // Mars 2 puan
    public bool LoserStartsNextRound { get; init; } = true;      // Sonraki ele kaybeden başlar
}
```
