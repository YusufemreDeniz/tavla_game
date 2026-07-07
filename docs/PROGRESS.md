# İlerleme

| Aşama | Durum | Not |
|-------|-------|-----|
| 0 — Analiz ve dokümantasyon | ✅ Tamamlandı | Tüm dokümanlar oluşturuldu |
| 1 — Solution ve temel yapı | ✅ Tamamlandı | .NET solution + Vite projesi derleniyor |
| 2 — Domain oyun motoru | ✅ Tamamlandı | 40 domain testi yeşil |
| 3 — MSSQL ve EF Core | ✅ Tamamlandı | InitialCreate migration LocalDB'ye uygulandı |
| 4 — Oda ve oturum sistemi | ✅ Tamamlandı | 20 application testi yeşil |
| 5 — Maç ve SignalR | ✅ Tamamlandı | 17 integration testi yeşil (REST + SignalR + rejoin + idempotency) |
| 6 — React temel ekranları | ✅ Tamamlandı | Ana sayfa, katılma, lobi, bağlantı yönetimi |
| 7 — Oyun tahtası ve animasyonlar | ✅ Tamamlandı | Responsive tahta, zar/pul animasyonları, Web Audio sesleri, emoji tepkileri |
| 8 — Reconnect ve hata durumları | ✅ Tamamlandı | Otomatik reconnect + RejoinRoom + stale state reddi + hata kodu eşlemeleri |
| 9 — Test ve kalite | ✅ Tamamlandı | 14 Vitest testi + Playwright E2E ana senaryosu yeşil |
| 10 — Docker, CI ve final | ✅ Tamamlandı | Dockerfile, docker-compose, GitHub Actions, README |

## Kural Revizyonu (2. iterasyon)

Kullanıcı geri bildirimiyle oyun kuralları yenilendi: iki aşamalı akış (indirme → toplama),
alt hane fallback kaldırıldı, toplarken çift = 2×zar pul (ilki sabit haneden, kalanı serbest
seçim — `CollectPiece`), MARS = 2 puan + büyük ekran animasyonu. UI gerçekçi ahşap tavla
tahtasına dönüştürüldü. Migration: `AddPendingBonusPicksAndMarsScoring`.

## Son Test Durumu (final koşu)

- `dotnet build`: 0 uyarı, 0 hata (TreatWarningsAsErrors açık)
- `dotnet test`: 87/87 yeşil (Domain 48, Application 22, Integration 17)
- `npm run typecheck`: temiz (TS strict)
- `npm run lint` (oxlint): temiz
- `npm run test` (Vitest): 15/15 yeşil
- `npm run e2e` (Playwright): 2/2 yeşil — iki tarayıcı bağlamıyla tam maç (bonus seçimleri dahil), sayfa yenileme, rövanş + konsol hata kontrolü

## Ortam Notları

- Geliştirme makinesinde Docker yok; testler SQL LocalDB fallback ile koştu.
- CI'da (GitHub Actions) SQL Server service container kullanılır (`TEST_SQL_CONNECTION`).
- Docker Compose lokal olarak doğrulanamadı (Docker kurulu değil); imaj tanımı CI'da build edilir.

## Bilinen Sınırlamalar

- Tek backend instance hedeflenir; çoklu instance için Redis backplane gerekir (ARCHITECTURE.md).
- PWA ikonu SVG'dir; bazı eski tarayıcılar PNG ikon isteyebilir.
- Kopan oyuncunun koltuğu korunur ancak `DisconnectedPlayerGraceMinutes` sonunda otomatik
  hükmen galibiyet verilmez; rakip isterse odadan çıkarak maçı sonlandırabilir.
