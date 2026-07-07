# Dağıtım

## Docker Compose (önerilen)

```bash
cp .env.example .env   # değerleri düzenleyin (SA parolası, JWT signing key)
docker compose up --build
```

Servisler:

- `sqlserver` — SQL Server 2022, kalıcı volume, health check.
- `app` — API + SignalR + build edilmiş React frontend'i aynı origin'den sunar.
  - `http://localhost:8080` → SPA
  - `/api`, `/hubs/game`, `/health` aynı domain.

Migration, uygulama açılışında otomatik uygulanır (`Database.Migrate`).

## Ortam Değişkenleri

| Değişken | Açıklama |
|----------|----------|
| `ConnectionStrings__DefaultConnection` | SQL Server bağlantısı |
| `Jwt__SigningKey` | En az 64 karakter rastgele secret (repo'da bulunmaz) |
| `Jwt__Issuer`, `Jwt__Audience`, `Jwt__ExpirationHours` | JWT ayarları |
| `Game__RoomExpirationHours` | Varsayılan 24 |
| `Game__DisconnectedPlayerGraceMinutes` | Varsayılan 5 |
| `Game__CleanupIntervalMinutes` | Varsayılan 10 |
| `AllowedOrigins__0` | Yalnızca ayrı origin'de frontend sunuluyorsa gerekli |
| `ASPNETCORE_ENVIRONMENT` | `Production` |

Zorunlu ayar eksikse uygulama options validation ile açılışta anlaşılır hata verir.

## Elle Dağıtım

```bash
# Frontend
cd src/KizTavlasi.Web && npm ci && npm run build
# Çıktı: src/KizTavlasi.Api/wwwroot (vite build oraya yazar)

# Backend
dotnet publish src/KizTavlasi.Api -c Release -o publish
ASPNETCORE_ENVIRONMENT=Production dotnet publish/KizTavlasi.Api.dll
# (Windows PowerShell: $env:ASPNETCORE_ENVIRONMENT="Production"; dotnet .\publish\KizTavlasi.Api.dll)
```

Ters proxy (nginx/caddy) arkasında WebSocket'lerin (`/hubs/game`) iletildiğinden emin olun.

## Sağlık Kontrolleri

- `GET /health/live` — süreç canlı mı.
- `GET /health/ready` — SQL Server erişilebilir mi.
