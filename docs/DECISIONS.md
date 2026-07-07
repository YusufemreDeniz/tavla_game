# Teknik Kararlar ve Varsayımlar

| # | Karar | Gerekçe |
|---|-------|---------|
| 1 | MediatR kullanılmadı | Use case sayısı az; doğrudan application service daha sade ve test edilebilir. |
| 2 | PK olarak `Guid.CreateVersion7()` | .NET 10 yerleşik, sıralanabilir GUID; index fragmentasyonunu azaltır. |
| 3 | Oda kodu 6 karakter, alfabe `23456789ABCDEFGHJKMNPQRSTUVWXYZ` | 0/O/1/I/L çıkarıldı; 31^6 ≈ 887M kombinasyon, rate limiting ile enumeration pratikte imkânsız. |
| 4 | Zar üretimi `RandomNumberGenerator.GetInt32(1,7)` | Kriptografik güvenlik; `System.Random` yasak. Testlerde `IDiceService` fake'i. |
| 5 | Doğrulama FluentValidation yerine DataAnnotations + elle kontrol değil, **FluentValidation** kullanıldı | İstemde zorunlu teknoloji listesinde; merkezi doğrulama. |
| 6 | SignalR token taşıma: `accessTokenFactory` | Query string'e elle token yazılmaz; SignalR client bunu standart mekanizmayla yapar. |
| 7 | Session token JWT'nin `jti`si üzerinden hash'lenerek DB'de saklanır | Rejoin doğrulaması; ham token DB'de tutulmaz. |
| 8 | Gerçek state MSSQL'de; SignalR grupları yalnızca yayın | Sunucu restart/reconnect sonrası state DB'den yüklenir. |
| 9 | Tek instance MVP; Redis backplane gelecek geliştirme | ARCHITECTURE.md'de açıklandı. |
| 10 | Sonraki ele kaybeden başlar (`LoserStartsNextRound = true`) | İstemdeki tercih; `GameRulesOptions` ile değiştirilebilir. |
| 11 | Deterministik E2E zarları: yalnızca `Development` ortamında ve `Game__DeterministicDiceSeed` set edildiğinde etkin | Production'da environment kontrolü ile fiziksel olarak devre dışı. |
| 12 | Oda ömrü 24 saat; kopan oyuncu için 5 dk grace; temizlik 10 dk'da bir | Options ile yapılandırılabilir. |
| 13 | Integration testlerde Testcontainers (Docker varsa) yoksa SQL LocalDB fallback | Geliştirme makinesinde Docker bulunmuyor; CI'da service container kullanılır. |
| 14 | Frontend state: TanStack Query (server state) + Zustand (oyun state) + local UI state | İstem gereği üçlü ayrım. |
| 15 | Ses efektleri Web Audio API ile kod içinde sentezlenir | Telif riski sıfır; dosya indirme yok. |
| 16 | Ürün adı tek merkezden: backend `Branding` options + frontend `src/config/branding.ts` | Sonradan değiştirilebilir ürün adı şartı. |
| 17 | Emoji tepkileri sabit liste (❤️ 😂 🎲 👏 😮 🔥) | Serbest sohbet yok; moderasyon kapsamı büyümez. |
| 18 | JWT süresi oda ömrüyle aynı (24 saat) | Token, oda yaşamı boyunca geçerli. |
| 19 | Round içinde `PlayerRoundStates.PlayerId` seat bazlı değil player Id bazlı | Basitlik; seat bilgisi Players tablosunda. |
| 20 | ~~İlk kural seti~~ Kurallar kullanıcı geri bildirimiyle yenilendi (bkz. 21-24) | 2. iterasyon. |
| 21 | İki aşamalı oyun: İNDİRME (hane başına son pul kalana dek, toplam 9) → TOPLAMA (tüm pullar) | Kullanıcının tarif ettiği gerçek Kız Tavlası akışı. |
| 22 | Alt hane fallback kaldırıldı: zarın hanesi oynanamıyorsa zar boşa gider | Kullanıcı kuralı. |
| 23 | Toplarken çift = 2×zar pul; ilki çift atılan haneden, kalanı oyuncunun seçtiği hanelerden (`CollectPiece` hub komutu, `Rounds.PendingBonusPicks`) | Kullanıcı kuralı; seçim bitmeden sıra geçmez. |
| 24 | MARS: rakip indirme aşamasındayken kazanmak 2 puan; ekranda büyük MARS animasyonu | Kullanıcı kuralı. |
| 25 | Skorlar puan bazlı (RequiredWins = gerekli puan); mars tek elde 2 puan yazar | BestOf formatlarıyla uyumlu. |
| 26 | Hamleleri oyuncu yapar: zar sonrası `Rounds.PendingDice` bekler, oyuncu haneye dokununca `PlayMove` hub komutu hamleyi uygular; oynanamayan zarlar sunucuda otomatik boşa gider | 3. iterasyon kullanıcı kuralı ("pul indirmeyi oyuncu yapmalı"). |
| 27 | Çift zar = 2×zar hamle HER İKİ aşamada (5-5 → 10 indirme); ilk hamle çift atılan haneden zorunlu, oynanamıyorsa el boşa | 3. iterasyon kullanıcı kuralı. |
| 28 | Tahta görünümü gerçek tavla masası: ahşap damar dokulu çerçeve, menteşeli omurga, üçgen haneler, tornalanmış pullar, yan toplama rayı | Kullanıcının fotoğraf referansı. |

## Varsayımlar

- Geliştirme makinesinde Docker yok; SQL LocalDB ile geliştirme yapılır, Docker Compose üretim/CI içindir.
- "Kız Tavlası" tek taraflı bir toplama oyunudur: oyuncular birbirinin pullarını vurmaz,
  her oyuncu yalnızca kendi 6 kapısı üzerinde oynar; rakiple etkileşim yalnızca sıra alternasyonudur.
- Skor gösterimi el galibiyeti sayısıdır (pip count yok).
- Rövanş yalnızca maç tamamlandığında istenebilir; iki taraf da kabul ederse yeni maç başlar.
