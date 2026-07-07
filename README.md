# Kız Tavlası Online

İki oyuncunun özel oda bağlantısı paylaşarak gerçek zamanlı **Kız Tavlası** oynayabildiği,
mobil uyumlu, sunucu otoriteli web uygulaması. Üyelik yoktur; oyuncular misafir olarak
link üzerinden katılır.

- **Backend:** .NET 10, ASP.NET Core Web API, SignalR, EF Core 10, SQL Server
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, TanStack Query, Framer Motion
- **Test:** xUnit, FluentAssertions, Testcontainers, Vitest, React Testing Library, Playwright

Ayrıntılı dokümantasyon `docs/` klasöründedir: [oyun kuralları](docs/GAME_RULES.md),
[mimari](docs/ARCHITECTURE.md), [veritabanı](docs/DATABASE.md),
[SignalR protokolü](docs/SIGNALR_PROTOCOL.md), [güvenlik](docs/SECURITY.md),
[dağıtım](docs/DEPLOYMENT.md), [teknik kararlar](docs/DECISIONS.md).

## Hızlı Başlangıç (Docker Compose)

Gereksinim: Docker.

```bash
cp .env.example .env
# .env içindeki MSSQL_SA_PASSWORD ve JWT_SIGNING_KEY değerlerini değiştirin
docker compose up --build
```

Uygulama <http://localhost:8080> adresinde açılır. Migration otomatik uygulanır.

## Geliştirme Ortamı

Gereksinimler: .NET SDK 10, Node.js 24+, SQL Server (LocalDB, Docker veya tam kurulum).

### Backend

```bash
dotnet restore
dotnet build
dotnet test                # tüm testler (integration testler SQL Server ister)
```

Bağlantı dizesi `src/KizTavlasi.Api/appsettings.Development.json` içinde LocalDB'ye ayarlıdır.
Farklı bir SQL Server için `ConnectionStrings__DefaultConnection` environment değişkenini kullanın.

Migration'lar uygulama açılışında otomatik uygulanır; elle uygulamak için:

```bash
dotnet ef database update --project src/KizTavlasi.Infrastructure --startup-project src/KizTavlasi.Api
```

API'yi çalıştırma (http://localhost:5210):

```bash
dotnet run --project src/KizTavlasi.Api --launch-profile http
```

### Frontend

```bash
cd src/KizTavlasi.Web
npm install
npm run dev        # Vite dev server: http://localhost:5173 (API'ye proxy yapar)
npm run build      # üretim çıktısı src/KizTavlasi.Api/wwwroot içine yazılır
npm run test       # Vitest birim/bileşen testleri
npm run typecheck  # TypeScript strict kontrol
npm run lint       # oxlint
npm run e2e        # Playwright (API'yi kendisi başlatır; ilk sefer: npx playwright install chromium)
```

## Testler

| Katman | Komut | Kapsam |
|--------|-------|--------|
| Domain | `dotnet test tests/KizTavlasi.Domain.Tests` | Oyun motoru: dizilim, zar çözümleme, çift kuralı, alt kapı fallback, maç formatları |
| Application | `dotnet test tests/KizTavlasi.Application.Tests` | Oda/oturum, sıra, idempotency, stale state, rövanş (gerçek SQL) |
| Integration | `dotnet test tests/KizTavlasi.IntegrationTests` | REST + JWT + SignalR + rejoin + restart senaryoları (WebApplicationFactory) |
| Frontend | `npm run test` | Form doğrulama, store stateVersion koruması, zar butonu durumları |
| E2E | `npm run e2e` | İki tarayıcı bağlamıyla tam maç + yenileme + rövanş |

Integration/Application testleri sırasıyla şunları dener: `TEST_SQL_CONNECTION` ortam değişkeni →
Docker (Testcontainers) → SQL LocalDB.

## Ortam Değişkenleri

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `ConnectionStrings__DefaultConnection` | SQL Server bağlantısı | — (zorunlu) |
| `Jwt__SigningKey` | JWT imza anahtarı (min 32 karakter) | — (zorunlu, repo'da yok) |
| `Jwt__Issuer` / `Jwt__Audience` | JWT kimliği | KizTavlasiOnline |
| `Jwt__ExpirationHours` | Token ömrü | 24 |
| `Game__RoomExpirationHours` | Oda ömrü | 24 |
| `Game__DisconnectedPlayerGraceMinutes` | Kopan oyuncu bekleme süresi | 5 |
| `Game__CleanupIntervalMinutes` | Temizlik periyodu | 10 |
| `AllowedOrigins__0` | Ayrı origin CORS izni (opsiyonel) | — |
| `ASPNETCORE_ENVIRONMENT` | Ortam | Production |

Ürün adı `Branding__ProductName` (backend) ve `src/KizTavlasi.Web/src/config/branding.ts`
(frontend) üzerinden tek noktadan değiştirilir.

## Mimari Özeti

- Oyunun tek otoritesi sunucudur: zarlar `RandomNumberGenerator` ile üretilir, hamleler
  `GameEngine` içinde çözülür; istemci yalnızca sonucu animasyonla gösterir.
- Gerçek durum SQL Server'dadır; SignalR grupları yalnızca yayın içindir. Sunucu yeniden
  başlasa bile oyun `RejoinRoom` ile kaldığı yerden devam eder.
- Her komut idempotenttir (`CommandId` unique) ve `StateVersion` + `rowversion` ile
  eşzamanlılık korunur.
- Sağlık uçları: `/health/live`, `/health/ready`. Hatalar RFC 7807 ProblemDetails formatındadır.
