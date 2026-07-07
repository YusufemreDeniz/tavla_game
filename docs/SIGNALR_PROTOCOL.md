# SignalR Protokolü

Hub route: `/hubs/game` — JWT ile korunur (`accessTokenFactory`).

Hub kural içermez; yalnızca auth, doğrulama, application service çağrısı, group yönetimi ve yayın yapar.

## Client → Server

| Metod | Parametre | Açıklama |
|-------|-----------|----------|
| `JoinRoom` | — | Claim'lerdeki odaya SignalR grubuna katılır, snapshot alır |
| `RejoinRoom` | — | Reconnect sonrası; snapshot yeniden gönderilir, rakip bilgilendirilir |
| `StartMatch` | `{ commandId }` | Yalnızca host; başlangıç zarları atılır |
| `RollDice` | `{ commandId, expectedStateVersion }` | Sıra kontrolü + idempotency + stale state kontrolü |
| `RequestRematch` | `{ commandId }` | Maç bitmişse rövanş isteği |
| `AcceptRematch` | `{ commandId }` | Yeni maç başlatılır |
| `DeclineRematch` | — | İstek reddedilir |
| `SendReaction` | `{ emoji }` | Yalnızca izinli 6 emoji |
| `ReportClientReady` | — | Animasyon senkronizasyonu için hazır sinyali |

## Server → Client

| Event | Payload özeti |
|-------|---------------|
| `RoomSnapshotReceived` | Tam authoritative snapshot (oda, oyuncular, maç, round, tahta, skor) |
| `PlayerJoined` / `PlayerLeft` | Oyuncu bilgisi |
| `PlayerConnectionChanged` | `{ playerId, isConnected }` |
| `MatchStarted` | Maç bilgisi |
| `StartingRollStarted` / `StartingRollResolved` | Başlangıç zarları (`rolls: [{seat, die}]`, `startingSeat`, eşitlik tekrarları dahil) |
| `TurnStarted` | `{ currentPlayerId, turnNumber }` |
| `DiceRollStarted` | Zar animasyonu başlatma |
| `DiceRollResolved` | Aşağıdaki çözümleme payload'ı |
| `GameStateUpdated` | Authoritative snapshot |
| `RoundEnded` | `{ winnerPlayerId, scores }` |
| `MatchEnded` | `{ winnerPlayerId, finalScore }` |
| `RematchRequested` / `RematchAccepted` / `RematchDeclined` | |
| `ReactionReceived` | `{ fromPlayerId, emoji }` |
| `ServerError` | `{ code, message }` |

Tüm event payload'larında ortak zarf: `roomCode`, `stateVersion`, `serverTimeUtc`.

## DiceRollResolved Payload

```json
{
  "roomCode": "7K9M2X",
  "stateVersion": 15,
  "serverTimeUtc": "2026-07-06T11:00:00Z",
  "playerId": "...",
  "die1": 3,
  "die2": 5,
  "isDouble": false,
  "steps": [
    {
      "die": 3,
      "sourcePoint": 3,
      "action": "Advance",
      "collectedPieces": 1,
      "before": { "back": 2, "front": 0, "collected": 0 },
      "after":  { "back": 1, "front": 1, "collected": 0 }
    },
    {
      "die": 5,
      "sourcePoint": 5,
      "action": "Collect",
      "collectedPieces": 1,
      "before": { "back": 0, "front": 1, "collected": 4 },
      "after":  { "back": 0, "front": 0, "collected": 5 }
    }
  ]
}
```

`action` değerleri: `Advance`, `Collect`, `CollectAll` (çift kuralı), `Wasted`.

İstemci kuralı yeniden hesaplamaz; adımları sırasıyla animasyonla oynatır ve ardından
`GameStateUpdated` snapshot'ını uygular. `incomingStateVersion <= currentStateVersion`
olan eventler atılır.
