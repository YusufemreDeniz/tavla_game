# Kız Tavlası Online — Geliştirme ve Modernizasyon Planı (Improvement Plan)

Bu plan, `docs/QUALITY_AUDIT.md` içindeki doğrulanmış bulguları güvenli, test edilebilir ve mevcut çalışan kuralları bozmayan 6 aşamada hayata geçirmek için uygulanmıştır.

---

## Aşama 1 — Audit & Baseline ✅ Tamamlandı
- Tüm dokümantasyonun (`GAME_RULES.md`, `ARCHITECTURE.md`, `SECURITY.md`, `SIGNALR_PROTOCOL.md`, `DECISIONS.md`), backend (`Domain`, `Application`, `Infrastructure`, `Api`) ve frontend (`Web`) kodunun incelenmesi.
- Mevcut birim, entegrasyon, tip ve lint kontrollerinin çalıştırılması.
- Bulguların `docs/QUALITY_AUDIT.md` içinde P0/P1/P2 olarak kayıt altına alınması.

## Aşama 2 — Core Reliability (Temel Güvenilirlik ve Dağıtık Tutarlılık) ✅ Tamamlandı
1. **Derleme Güvenliği (P0):**
   - `Directory.Build.props` yapılandırmasıyla derleyici uyarıları strict tutulurken transitif NuGet danışma uyarılarının derlemeyi kırması engellendi.
2. **Post-Commit SignalR Yayın Mimarisi (P1):**
   - `GameService` ve `RoomService` içindeki tüm SignalR yayınları veritabanı transaction'ı commit edildikten **sonra** çalıştırılacak şekilde yeniden yapılandırıldı.
   - SignalR yayın hatalarının commit edilmiş veritabanı işlemini iptal etmemesi için `SafeNotifyAsync` hata yalıtımı eklendi.
   - `GameHub.StartMatch` ve `GameHub.RollDice` içindeki doğrulama öncesi erken yayınlar (`StartingRollStarted`, `DiceRollStarted`) doğrulama ve commit sonrasına taşındı.
3. **Bağlantı Durumu ve Çoklu Sekme Senkronizasyonu (P1):**
   - Sunucuda oyuncu bazlı aktif SignalR bağlantı takibi (`ActiveConnections`) ile çoklu sekme ve sayfa yenileme sırasında yanlış `IsConnected = false` durumunun önlenmesi sağlandı.
   - İstemcide (`gameStore.ts` ve `gameHubClient.ts`) `PlayerConnectionChanged` olayının `setPlayerConnection` ile işlenmesi ve `RoomSnapshotReceived` olayının `applyAuthoritativeSnapshot` ile senkronize edilmesi sağlandı.
   - Sekme görünürlüğü (`visibilitychange`) ve `STALE_STATE` anında otomatik state senkronizasyonu (`refreshState`) eklendi.
4. **Oda Yaşam Döngüsü ve Terk Edilmiş Odalar (P1):**
   - `RoomCleanupService` içinde terk edilmiş `Playing` odalarının `Abandoned` durumuna geçirilmesi ve tek oyuncusu grace süresini aşan aktif maçlarda bağlı oyuncunun hükmen galip ilan edilmesi sağlandı.
   - `LeaveRoomAsync` sırasında aktif maç varsa kalan oyuncunun hükmen galip ilan edilmesi sağlandı.
5. **Komut Güvenliği ve Idempotency (P1):**
   - `StartMatchAsync`, `RollDiceAsync` ve `PlayMoveAsync` için oda/oyuncu kapsamlı `CommandId` doğrulaması ve idempotent yanıt desteği eklendi.

## Aşama 3 — Gameplay Quality (Oyun Motoru ve Kuralların Sağlamlaştırılması) ✅ Tamamlandı
- `docs/GAME_RULES.md` kuralları korunarak aynı zar turunda son indirme pulundan hemen sonra ikinci zarla toplama aşamasına geçiş (`GameEngine.ResolveRoll`) düzeltildi ve hem domain hem UI testleriyle doğrulandı.

## Aşama 4 — Premium UI/UX (Ceviz Ahşap Tavla Masası & Mobil Deneyim) ✅ Tamamlandı
- Gerçekçi ceviz ahşabı, bordo ve krem pullar, altın vurgular, 3D zar derinliği ve çift zar altın çerçevesi uygulandı.
- Hane bazlı okunabilir pul sayaçları, aşama rozetleri (`İndirme · X/9`, `Toplama · X/15`) ve kalan hamle hakkı göstergeleri eklendi.
- 375px mobil görünümde yatay taşmasızlık ve minimum 44px dokunma alanları E2E testiyle doğrulandı.

## Aşama 5 — Product Features (Ürün Özellikleri) ✅ Tamamlandı
- Zenginleştirilmiş canlı oyun olay geçmişi.
- Maç sonu istatistik ve özet ekranı (el sayısı, toplam tur, nihai skor, mars bilgisi).
- Animasyon hızı tercihi (`fastMode`: Normal / Hızlı) ve zenginleştirilmiş Web Audio ses sentezleri (`playDoubleSound`, çok katmanlı ahşap/pul/zar sesleri).
- Çevrim dışı rakip bilgilendirme bandı ve ana sayfada 3 adımlı hızlı başlangıç rehberi.

## Aşama 6 — Production Readiness & Final QA ✅ Tamamlandı
- Frontend production paketi `src/KizTavlasi.Api/wwwroot` altına derlendi.
- Tüm backend (Domain: 49, Application: 32, Integration: 19) ve frontend (Vitest: 21, TypeScript, Oxlint, Playwright E2E: 3) testleri koşularak sıfır hata ile doğrulandı.
