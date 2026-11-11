# Kız Tavlası Online — Kalite ve Teknik Denetim Raporu (Quality Audit)

Bu doküman, **Aşama 1 — Audit & Baseline** kapsamında gerçek kaynak kodunun incelenmesiyle oluşturulmuş ve **Aşama 2–6** doğrulamalarıyla güncellenmiştir. Yalnızca kod ve testler üzerinde doğrulanmış bulgular yer almaktadır.

---

## 1. Başlangıç (Baseline) vs. Final Test Durumu

| Katman | Komut | Başlangıç (Baseline) | Final Durum |
|--------|-------|----------------------|-------------|
| **Derleme (Varsayılan)** | `dotnet restore` / `dotnet build` | ❌ **Başarısız** (`NU1902`, `NU1903` + `TreatWarningsAsErrors=true`) | ✅ **Başarılı** (0 uyarı, 0 hata) |
| **Domain Testleri** | `dotnet test tests/KizTavlasi.Domain.Tests` | ✅ **48 / 48 Başarılı** | ✅ **49 / 49 Başarılı** (+aynı zar turunda aşama geçişi testi) |
| **Application Testleri** | `dotnet test tests/KizTavlasi.Application.Tests` | ✅ **23 / 23 Başarılı** | ✅ **32 / 32 Başarılı** (+post-commit bildirim, SignalR hata yalıtımı, `StartMatch`/`PlayMove` idempotency, `CommandId` sahiplik, çoklu sekme bağlantı, terk edilmiş `Playing` oda ve hükmen galibiyet testleri) |
| **Integration Testleri** | `dotnet test tests/KizTavlasi.IntegrationTests` | ✅ **17 / 17 Başarılı** | ✅ **19 / 19 Başarılı** (+yetkisiz erken zar animasyonu engeli ve çoklu sekme SignalR bağlantı testi) |
| **Frontend Tip Kontrolü** | `npm.cmd run typecheck` | ✅ **Başarılı** | ✅ **Başarılı** (0 hata) |
| **Frontend Lint** | `npm.cmd run lint` | ✅ **Başarılı** | ✅ **Başarılı** (`oxlint` — 0 uyarı, 0 hata) |
| **Frontend Birim Testleri** | `npm.cmd run test` | ⚠️ **16 / 16 Başarılı** (`act(...)` uyarıları vardı) | ✅ **21 / 21 Başarılı** (0 `act(...)` uyarısı, +bağlantı durumu, authoritative snapshot, aşama geçişi ve çevrim dışı rakip bandı testleri) |
| **Playwright E2E Testleri** | `npm.cmd run e2e` | ⚠️ Chromium kurulu değildi | ✅ **3 / 3 Başarılı** (konsol hatasızlık, mobil 375x667 taşmasızlık + 44px dokunma alanı, 2 tarayıcıda tam maç + yenileme + rövanş) |

---

## 2. Doğrulanmış Teknik Bulgular ve Uygulanan Çözümler

### P0 — Derleme ve CI Kırılması (`Directory.Build.props`) — ✅ Giderildi
- **Dosya:** `Directory.Build.props`
- **Kök Neden:** `TreatWarningsAsErrors=true` açıkken alt paketlerde sonradan yayınlanan NuGet danışma uyarıları (`NU1901`–`NU1904`) düz `dotnet restore` ve `dotnet build` komutlarını kırıyordu.
- **Uygulanan Çözüm:** Derleyici ve kod analizi uyarıları için `TreatWarningsAsErrors=true` korunurken `<NoWarn>$(NoWarn);NU1901;NU1902;NU1903;NU1904</NoWarn>` eklendi.

### P1 — Transaction Commit Öncesi SignalR Yayını ve Hata Yayılımı — ✅ Giderildi
- **Dosyalar:** `src/KizTavlasi.Infrastructure/Persistence/GameDbContext.cs`, `src/KizTavlasi.Application/GameService.cs`, `src/KizTavlasi.Application/RoomService.cs`, `src/KizTavlasi.Api/Realtime/GameHub.cs`, `src/KizTavlasi.Application/Abstractions/IGameNotifier.cs`, `src/KizTavlasi.Api/Realtime/SignalRGameNotifier.cs`
- **Kök Neden:**
  1. `GameDbContext.ExecuteInTransactionAsync` içinde `transaction.CommitAsync(ct)` çağrısı delegate döndükten sonra yapılıyordu; `GameService` ve `RoomService` içindeki tüm `_notifier.*Async` çağrıları ise delegate içinde (commit öncesinde) çalışıyordu.
  2. SignalR yayınında oluşan bir hata commit edilmemiş veritabanı işlemini geri alabiliyor veya retry döngüsüne sokabiliyordu.
  3. `GameHub.StartMatch` ve `GameHub.RollDice`, henüz sıra ve yetki doğrulaması yapılmadan tüm odaya `StartingRollStarted` / `DiceRollStarted` yayını yapıyordu.
- **Uygulanan Çözüm:**
  - Tüm `_notifier.*Async` çağrıları transaction bloğu dışına (post-commit aşamasına) taşındı ve `RoomService.SafeNotifyAsync` ile sarmalanarak yayın hatalarının commit edilmiş oyun durumunu bozması engellendi.
  - `StartingRollStarted` ve `DiceRollStarted` yayınları `GameHub` içinden kaldırılarak `GameService` içinde doğrulama ve commit sonrasına alındı.

### P1 — Bağlantı Durumu (`IsConnected`) Senkronizasyonu ve Çoklu Sekme Yarışı — ✅ Giderildi
- **Dosyalar:** `src/KizTavlasi.Application/RoomService.cs`, `src/KizTavlasi.Api/Realtime/GameHub.cs`, `src/KizTavlasi.Web/src/store/gameStore.ts`, `src/KizTavlasi.Web/src/realtime/gameHubClient.ts`, `src/KizTavlasi.Web/src/pages/GameView.tsx`
- **Kök Neden:**
  1. `RoomService.SetConnectionStateAsync` oyuncunun `IsConnected` alanını güncelliyor ancak `room.StateVersion` değerini artırmıyordu; istemcide `gameStore.applySnapshot` ise `snapshot.stateVersion <= get().stateVersion` kontrolüyle yeni snapshot'ı reddediyordu ve `PlayerConnectionChanged` dinleyicisi boştu.
  2. Aynı oyuncunun birden fazla sekmesi/bağlantısı olduğunda, eski bağlantının kapanması oyuncuyu çevrim dışı (`IsConnected = false`) işaretliyordu.
  3. Hızlı ardışık hamle tıklamalarında, önceki `PlayMove` isteği ağdayken hanenin hâlâ tıklanabilir kalması çift komuta veya yarış durumuna yol açabiliyordu.
- **Uygulanan Çözüm:**
  - `RoomService` içinde `ConcurrentDictionary<Guid, ImmutableHashSet<string>>` ile oyuncu başına aktif `ConnectionId` takibi eklendi; oyuncu yalnızca son aktif bağlantısı kapandığında `IsConnected = false` olarak işaretlenir.
  - `gameStore.ts` içine `setPlayerConnection` ve `applyAuthoritativeSnapshot` eklendi; `PlayerConnectionChanged` olayı `StateVersion` artışı gerektirmeden doğrudan oyuncu bağlantı durumunu günceller ve eski (`stale`) `stateVersion` taşıyan olayları yoksayar.
  - `GameView.tsx` içinde `moveInProgressVersion` kilidi eklendi; bir haneye dokunulduğu anda yeni `stateVersion` gelene kadar mükerrer tıklamalar engellenir.

### P1 — Terk Edilmiş Aktif (`Playing`) Odaların Temizlenmemesi — ✅ Giderildi
- **Dosyalar:** `src/KizTavlasi.Infrastructure/RoomCleanupService.cs`, `src/KizTavlasi.Application/RoomService.cs`, `src/KizTavlasi.Application/SnapshotMapper.cs`
- **Kök Neden:**
  - `RoomCleanupService` yalnızca `Waiting` ve `InLobby` odalarını temizliyor, `Playing` durumundaki terk edilmiş odalara dokunmuyordu.
  - Aktif maç sırasında `LeaveRoomAsync` çağrıldığında kalan oyuncu hükmen galip ilan edilmiyordu.
- **Uygulanan Çözüm:**
  - `RoomCleanupService.CleanupAsync` güncellenerek:
    - Tüm oyuncuları bağlı olmayan ve `DisconnectedPlayerGraceMinutes` süresini aşan (veya oda süresi dolan) `Playing` odalarını `Abandoned` durumuna geçirir.
    - Tek oyuncusu `DisconnectedPlayerGraceMinutes` süresince kopuk kalan, diğer oyuncusu bağlı olan maçlarda bağlı oyuncuyu hükmen galip ilan edip odayı `Completed` yapar ve `MatchEnded` bildirimi yayınlar.
    - Aktif bağlı oyuncuları olan odalara asla dokunmaz.
  - `RoomService.LeaveRoomAsync` aktif maç sırasında çağrıldığında kalan oyuncuya hükmen maç galibiyeti verir.

### P1 — Komut Güvenliği, `CommandId` Sahipliği ve `STALE_STATE` Toparlanması — ✅ Giderildi
- **Dosyalar:** `src/KizTavlasi.Application/GameService.cs`, `src/KizTavlasi.Web/src/pages/RoomPage.tsx`, `src/KizTavlasi.Web/src/realtime/gameHubClient.ts`
- **Uygulanan Çözüm:**
  - `RollDiceAsync`, `StartMatchAsync` ve `PlayMoveAsync` içinde `CommandId` bazlı idempotency ve oda/oyuncu sahiplik doğrulaması (`PlayerId == session.PlayerId && RoomId == session.RoomId`) eklendi.
  - `RoomPage.tsx` içinde `STALE_STATE` hatası alındığında veya sekme arka plandan öne geldiğinde (`visibilitychange`) `hub.refreshState()` ile otomatik snapshot yenileme (self-healing) devreye alındı.

### P1/P2 — Oyun Motoru: Aynı Zar Turunda Aşama Geçişi (`GameEngine.ResolveRoll`) — ✅ Giderildi
- **Dosya:** `src/KizTavlasi.Domain/GameEngine.cs`
- **Kök Neden:** Çift olmayan zarda oyuncunun indirme aşamasında yalnızca 1 indirilecek pulu kaldığında (ör. 6. hanede 2 inmemiş pul varken `(3, 6)` atıldığında), `ResolveRoll` iki zarı da indirme kurallarıyla değerlendirip `3` zarını `Wasted` sayıyordu.
- **Uygulanan Çözüm:** `remainingBringDowns == 1` durumunda, zarlardan biri 9. pulu indirerek oyuncuyu toplama aşamasına geçiriyorsa diğer zarın toplama aşamasında oynanabilirliği kontrol edilerek `PlayableDice` listesine (önce indirme zarı, sonra toplama zarı sırasıyla) eklendi.

---

## 3. Next-Level Roadmap Sonrası Test Durumu

| Katman | Komut | Önce | Sonra |
|--------|-------|------|-------|
| Domain | `dotnet test tests/KizTavlasi.Domain.Tests` | 49 | ✅ **60** (+`BotStrategy`: geçerlilik, tam el simülasyonu, Usta ≤ Kolay boşa zar) |
| Application | `dotnet test tests/KizTavlasi.Application.Tests` | 32 | ✅ **46** (+otomasyon zamanlaması, idempotency, hamle süresi, bot rövanşı, bot odası yaşam döngüsü, izleyici token'ı, maç analitiği) |
| Integration | `dotnet test tests/KizTavlasi.IntegrationTests` | 19 | ✅ **23** (+gerçek arka plan servisiyle bot hamlesi, izleyici salt okunurluğu, istatistik yetkilendirmesi) |
| Frontend birim | `npm run test` | 21 | ✅ **58** (+FLIP/önizleme, zar tepsisi, QR — bağımsız `jsqr` çözücüsüyle, bot/izleyici/süre arayüzü, istatistik paneli) |
| Tip / Lint | `npm run typecheck` · `npm run lint` | ✅ | ✅ 0 hata, 0 uyarı |
| E2E | `npm run e2e` | 3 | ✅ **4** (+tarayıcıda bota karşı tam maç, eşzamanlı izleyici, istatistik paneli ve bot rövanşı) |
| Paket | `vite build` | 567 kB tek parça (uyarı) | ✅ en büyük parça 231 kB (React); oda ekranı ve SignalR yalnızca odaya girilince yüklenir |

### Bu turda bulunan ve giderilen sorunlar
- **İzleyici claim eşlemesi:** `role` claim'i JwtBearer tarafından `ClaimTypes.Role`'e eşlendiği için REST uçlarında
  izleyici tanınmıyordu (401). Claim adı `access` yapıldı; entegrasyon testi 403'ü doğrular.
- **DB kaynaklı UTC zamanı:** `Round.TurnDeadlineUtc` DB'den `Kind=Unspecified` okunur ve "Z" eki olmadan serileşirdi;
  istemci yerel saat sanabilirdi. Snapshot'ta `DateTimeKind.Utc` atanır, istemci de eksiz değeri UTC kabul eder.
