# Kız Tavlası Online — Proje Planı

## Amaç

İki oyuncunun link paylaşarak özel bir odada gerçek zamanlı "Kız Tavlası" oynayabildiği,
mobil uyumlu, sunucu otoriteli, üretime alınabilir bir web uygulaması.

## Teknoloji Özeti

| Katman     | Teknoloji |
|------------|-----------|
| Backend    | .NET 10, ASP.NET Core Web API, SignalR, EF Core 10, SQL Server |
| Frontend   | React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, TanStack Query, Framer Motion |
| Gerçek zamanlı | SignalR (WebSocket) |
| Kimlik     | Misafir JWT (üyelik yok) |
| Test       | xUnit, FluentAssertions, Testcontainers/LocalDB, Vitest, Playwright |
| Dağıtım    | Docker Compose, GitHub Actions |

## Aşamalar

| # | Aşama | Çıktı |
|---|-------|-------|
| 0 | Analiz ve dokümantasyon | docs/ altındaki tüm dokümanlar |
| 1 | Solution ve temel yapı | Derlenen boş solution + Vite projesi |
| 2 | Domain oyun motoru | GameEngine + tüm domain unit testleri yeşil |
| 3 | MSSQL ve EF Core | DbContext, migration, integration test altyapısı |
| 4 | Oda ve oturum sistemi | REST create/join, JWT, cleanup, rate limiting |
| 5 | Maç ve SignalR | Hub, StartMatch, RollDice, idempotency, rejoin, rematch |
| 6 | React temel ekranları | Ana sayfa, lobi, bağlantı yönetimi |
| 7 | Oyun tahtası ve animasyonlar | Responsive tahta, zar/pul animasyonları, ses |
| 8 | Reconnect ve hata durumları | Resync, stale state, kullanıcı dostu hatalar |
| 9 | Test ve kalite | Frontend + integration + E2E testleri |
| 10| Docker, CI ve final | Dockerfile, compose, GitHub Actions, README |

## Temel Akış

1. Oyuncu 1 ana sayfada adını ve formatı (tek el / 3 el / 5 el) seçer, oda oluşturur.
2. Sistem 6 karakterlik tahmin edilmesi zor oda kodu ve paylaşılabilir link üretir.
3. Oyuncu 2 linke girer, adını yazar, odaya katılır.
4. Host maçı başlatır; başlangıç oyuncusu sunucuda atılan birer zarla belirlenir.
5. Sırası gelen oyuncu "Zar At" der; zarlar sunucuda üretilir, hamleler sunucuda çözülür.
6. Her mutasyon sonrası authoritative state SignalR ile iki oyuncuya yayınlanır.
7. 15 pulu ilk toplayan eli kazanır; format gereği yeterli eli kazanan maçı kazanır.
8. Maç sonunda rövanş istenebilir. Sayfa yenileme / kopma durumunda oyuncu aynı koltuğa döner.

## Kabul Kriterleri

Kullanıcı isteminde listelenen 35 kabul kriteri geçerlidir; ilerleme `PROGRESS.md` içinde takip edilir.
