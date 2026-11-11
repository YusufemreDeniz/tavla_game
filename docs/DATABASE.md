# Veritabanı Tasarımı

SQL Server 2022, EF Core 10 Code First, tüm tarihler UTC, PK'lar `Guid` (Version 7 — sıralanabilir).

## Tablolar

### GameRooms
| Alan | Tip | Not |
|------|-----|-----|
| Id | uniqueidentifier PK | Guid v7 |
| Code | nvarchar(8) | **Unique index**, büyük harf+rakam, karışan karakterler yok |
| Status | int | Waiting=0, InLobby=1, Playing=2, Completed=3, Expired=4, Abandoned=5 |
| BestOf | int | 1, 3, 5 (check constraint) |
| HostPlayerId | uniqueidentifier null | |
| CurrentMatchId | uniqueidentifier null | |
| CreatedAtUtc / ExpiresAtUtc / CompletedAtUtc | datetime2 | Index: Status, ExpiresAtUtc |
| RowVersion | rowversion | optimistic concurrency |
| TurnTimeLimitSeconds | int null | Hamle süresi: NULL (süresiz), 15 veya 30 (check) |

### Players
| Alan | Tip | Not |
|------|-----|-----|
| Id | uniqueidentifier PK | |
| RoomId | FK → GameRooms | cascade |
| DisplayName | nvarchar(30) | uzunluk 2–30 (check) |
| Seat | int | 1=Host, 2=Guest (check 1–2), **unique (RoomId, Seat)** |
| SessionId | uniqueidentifier | |
| SessionTokenHash | nvarchar(88) | SHA-256 base64; ham token DB'de yok |
| IsConnected | bit | |
| JoinedAtUtc / LastSeenAtUtc / DisconnectedAtUtc | datetime2 | |
| BotDifficulty | int null | NULL = insan; 1 = Kolay, 2 = Usta (check) |

### Matches
Id, RoomId FK, MatchNumber, BestOf, RequiredWins, Status (NotStarted/StartingRoll/InProgress/Completed),
Player1Score, Player2Score, CurrentRoundId, WinnerPlayerId, StartedAtUtc, CompletedAtUtc,
**StateVersion (long)**, RowVersion. Unique (RoomId, MatchNumber).

### Rounds
Id, MatchId FK, RoundNumber, Status, StartingPlayerId, CurrentPlayerId, WinnerPlayerId,
TurnNumber, PendingDice, PendingBonusPicks, **TurnDeadlineUtc** (otomatik eylem zamanı; filtreli index),
StartedAtUtc, CompletedAtUtc, StateVersion, RowVersion. Unique (MatchId, RoundNumber).

### PlayerRoundStates
Id, RoundId FK, PlayerId, CollectedCount (check 0–15). **Unique (RoundId, PlayerId)**.

### PlayerPointStates
Id, PlayerRoundStateId FK, PointNumber (check 1–6), BackCount (check >=0), FrontCount (check >=0).
**Unique (PlayerRoundStateId, PointNumber)**.

### DiceRolls
Id, RoundId FK, PlayerId, TurnNumber, Die1 (check 1–6), Die2 (check 1–6), IsDouble,
**CommandId (unique index — idempotency)**, ResolutionJson (nvarchar(max)), CreatedAtUtc.
Unique (RoundId, TurnNumber) — aynı tur için mükerrer kayıt engeli.

### GameEvents (append-only audit)
Id (bigint identity), RoomId, MatchId?, RoundId?, SequenceNumber, EventType (nvarchar(64)),
PayloadJson, OccurredAtUtc. Index (RoomId, SequenceNumber). Gerçek state yerine geçmez.

## Kurallar

- API asla entity döndürmez; DTO döndürür.
- Navigation property'lerde döngüsel serileştirme yok (DTO mapping elle).
- Migration adları anlamlı (`InitialCreate`, ...).
- Seed verisi yok (zorunlu sistem verisi bulunmuyor).
- Kritik aggregate'lerde `rowversion`; `StateVersion` istemci senkronizasyonu için ayrı tutulur.
