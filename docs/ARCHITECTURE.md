# Mimari

Pragmatik Clean Architecture. Katmanlar arasında tek yönlü bağımlılık:

```
Api ──► Application ──► Domain
 │            ▲
 └──► Infrastructure ──┘ (Application interface'lerini uygular, Domain'i kullanır)
Web (React) ──HTTP/SignalR──► Api
```

## Projeler

| Proje | Sorumluluk | Bağımlılık |
|-------|------------|------------|
| `KizTavlasi.Domain` | Entity/value object modelleri, enumlar, `GameEngine`, zar çözümleme, durum geçişleri, domain exception'ları | Yok (saf .NET) |
| `KizTavlasi.Application` | Use case servisleri (oda, maç, zar), DTO'lar, interface'ler (`IDiceService`, `IGameRoomRepository`, `IGameNotifier`...), doğrulama, transaction sınırları | Domain |
| `KizTavlasi.Infrastructure` | EF Core `GameDbContext`, entity configuration, repository, JWT üretimi, kriptografik zar servisi, token hashing, cleanup `BackgroundService`, Serilog | Application, Domain |
| `KizTavlasi.Api` | Minimal API endpointleri, `GameHub` (SignalR), auth, ProblemDetails, rate limiting, health check, static frontend serving | Application, Infrastructure |
| `KizTavlasi.Web` | React SPA: sayfalar, tahta, animasyonlar, SignalR client, store | — (ayrı npm projesi) |

MediatR kullanılmadı: use case sayısı az, doğrudan application service çağrısı daha okunur.

## Sunucu Otoritesi

- Zar üretimi: `RandomNumberGenerator.GetInt32(1, 7)` (`CryptoDiceService`). Testlerde `FakeDiceService`.
- Tüm kural hesaplamaları `GameEngine` içinde; Hub ve controller ince.
- İstemci yalnızca komut gönderir (`RollDice { commandId, expectedStateVersion }`), sonuç sunucudan gelir.
- Her komutta doğrulanır: oda üyeliği, oturum geçerliliği, maç durumu, sıra, idempotency (CommandId), state version.

## Gerçek Zamanlı Akış

- Hub route: `/hubs/game`. Hub yalnızca auth, basit doğrulama, application service çağrısı ve yayın yapar.
- SignalR grupları yalnızca mesaj yayını içindir; **gerçek durum MSSQL'de** tutulur.
- Her mutasyon sonrası authoritative `GameStateUpdated` snapshot'ı yayınlanır; payloadlarda
  `roomCode`, `stateVersion`, `serverTimeUtc` bulunur.
- İstemci `incomingStateVersion <= currentStateVersion` olan eventleri reddeder.

## Concurrency

- `rowversion` (optimistic concurrency) + `StateVersion` + `CommandId` unique index.
- Zar üretimi, hamle çözümü, sıra değişimi ve event kaydı tek EF Core transaction'ında.
- Concurrency çakışmasında kısa retry; idempotent komutlar ikinci kez işlenmez.
- Process içi kilit yerine veritabanı garantilerine güvenilir; tek instance'ta ve
  çoklu instance'ta veri bütünlüğü korunur.

## Gelecek Geliştirme: SignalR Backplane

MVP tek backend instance hedefler. Birden fazla instance çalıştırılacaksa SignalR mesajlarının
tüm instance'lara ulaşması için Redis backplane (`Microsoft.AspNetCore.SignalR.StackExchangeRedis`)
eklenmelidir. Veri bütünlüğü zaten MSSQL + rowversion ile korunduğundan yalnızca yayın katmanı etkilenir.
Ayrıca sticky session veya Azure SignalR Service alternatiftir.

## Dağıtım

Production'da frontend build çıktısı (`KizTavlasi.Web/dist`) ASP.NET Core `wwwroot` üzerinden sunulur;
`/`, `/api`, `/hubs/game`, `/health` aynı origin'de çalışır. Development'ta Vite dev server
(`localhost:5173`) API'ye proxy yapar.
