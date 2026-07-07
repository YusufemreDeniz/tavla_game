namespace KizTavlasi.Api.Realtime;

/// <summary>Server → Client SignalR event adları (magic string kullanılmaz).</summary>
public static class GameHubEvents
{
    public const string RoomSnapshotReceived = "RoomSnapshotReceived";
    public const string PlayerJoined = "PlayerJoined";
    public const string PlayerLeft = "PlayerLeft";
    public const string PlayerConnectionChanged = "PlayerConnectionChanged";
    public const string MatchStarted = "MatchStarted";
    public const string StartingRollStarted = "StartingRollStarted";
    public const string StartingRollResolved = "StartingRollResolved";
    public const string TurnStarted = "TurnStarted";
    public const string DiceRollStarted = "DiceRollStarted";
    public const string DiceRollResolved = "DiceRollResolved";
    public const string MovePlayed = "MovePlayed";
    public const string GameStateUpdated = "GameStateUpdated";
    public const string RoundEnded = "RoundEnded";
    public const string MatchEnded = "MatchEnded";
    public const string RematchRequested = "RematchRequested";
    public const string RematchAccepted = "RematchAccepted";
    public const string RematchDeclined = "RematchDeclined";
    public const string ReactionReceived = "ReactionReceived";
    public const string ServerError = "ServerError";
}
