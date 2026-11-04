# Güvenlik

## Kimlik ve Oturum

- Üyelik yok; oda oluşturma/katılma anında kısa ömürlü misafir JWT üretilir.
- Claim'ler: `playerId`, `roomId`, `roomCode`, `seat`, `sessionId`, `jti`.
- Signing key yalnızca environment variable / user-secrets'tan gelir; repo'da gerçek secret yok.
- Token süresi oda ömrüyle uyumlu (24 saat). `jti` hash'i DB'de saklanır, rejoin'de doğrulanır.
- SignalR: `accessTokenFactory`; her Hub metodunda claim ↔ oda/oyuncu eşleşmesi doğrulanır.

## Sunucu Otoritesi

- Zar: `RandomNumberGenerator.GetInt32(1,7)`; istemci zar/sıra/skor/kazanan belirleyemez.
- Her komutta: oda üyeliği, oturum, maç aktifliği, sıra, idempotency (`CommandId` unique), state version kontrolü.
- Deterministik test zarları yalnızca `Development` ortamında etkinleşebilir.

## HTTP Güvenliği

- HTTPS yönlendirme; production'da HSTS.
- Güvenli headerlar: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, CSP.
- Rate limiting: oda oluşturma/katılma uçlarında sıkı limit (room code enumeration engeli), global limit.
- Maksimum request body boyutu sınırlı.
- Global exception handler → RFC 7807 ProblemDetails; production yanıtlarında stack trace yok.

## Girdi Doğrulama

- FluentValidation: DisplayName 2–30 karakter, kontrol karakterleri temizlenir (sanitization).
- BestOf yalnızca 1/3/5. Oda kodu normalize edilir (case-insensitive, güvenli alfabe).
- EF Core parametreli sorgular (SQL injection koruması); mass assignment yok (request DTO'ları dar).

## XSS / Frontend

- `dangerouslySetInnerHTML` kullanılmaz; React'in varsayılan escape'i yeterli.
- Serbest metin sohbet yok; yalnızca sabit 6 emoji tepkisi: ❤️ 😂 🎲 👏 😮 🔥.
- Token yalnızca `sessionStorage`'da (odaya özgü anahtar ile); log'lanmaz.

## Loglama

- JWT, signing key, session token, connection string ve hassas headerlar asla log'lanmaz.
- Structured log alanları: CorrelationId, RoomId, RoomCode, PlayerId, MatchId, RoundId, CommandId, StateVersion.

## Bot ve İzleyici Oturumları

- **Bot** oyuncusu için hiçbir zaman token üretilmez. `SessionTokenHash` 32 baytlık kriptografik rastgele
  değerdir; hiçbir `jti`'nin hash'i ile eşleşemez, dolayısıyla kimse bot adına Hub'a bağlanamaz.
  Bot hamleleri sunucu içinde `TurnAutomationRunner` → `GameService` yoluyla, istemci komutlarıyla aynı
  sıra / state version / idempotency doğrulamalarından geçerek uygulanır.
- **Otomatik eylem CommandId**'si `(roundId, stateVersion)`'dan SHA-256 ile türetilir; aynı an için iki çalıştırma
  (zamanlayıcı + tarama, çoklu instance) ikinci kez uygulanamaz.
- **İzleyici** token'ı `access=spectator` claim'i taşır (`role` kullanılmaz: JwtBearer onu `ClaimTypes.Role`'e eşler)
  ve oyuncu kimliği içermez. `PlayerSessionResolver.Resolve` izleyici token'ını `SPECTATOR_READ_ONLY` ile reddeder.
  İzleme ucu `room-join` hız sınırına tabidir.
