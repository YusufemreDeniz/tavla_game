namespace KizTavlasi.Domain;

/// <summary>
/// Oyun kuralları veya durum geçişleri ihlal edildiğinde fırlatılır.
/// <see cref="Code"/> API tarafından ProblemDetails hata koduna eşlenir.
/// </summary>
public class GameDomainException : Exception
{
    public string Code { get; }

    public GameDomainException(string code, string message) : base(message)
    {
        Code = code;
    }
}

public static class DomainErrorCodes
{
    public const string RoomNotFound = "ROOM_NOT_FOUND";
    public const string RoomFull = "ROOM_FULL";
    public const string RoomExpired = "ROOM_EXPIRED";
    public const string PlayerNotInRoom = "PLAYER_NOT_IN_ROOM";
    public const string InvalidSession = "INVALID_SESSION";
    public const string MatchAlreadyStarted = "MATCH_ALREADY_STARTED";
    public const string MatchNotActive = "MATCH_NOT_ACTIVE";
    public const string NotYourTurn = "NOT_YOUR_TURN";
    public const string RollAlreadyInProgress = "ROLL_ALREADY_IN_PROGRESS";
    public const string StaleState = "STALE_STATE";
    public const string InvalidCommand = "INVALID_COMMAND";
    public const string RematchNotAvailable = "REMATCH_NOT_AVAILABLE";
    public const string RoundAlreadyCompleted = "ROUND_ALREADY_COMPLETED";
    public const string NotHost = "NOT_HOST";
    public const string SpectatorReadOnly = "SPECTATOR_READ_ONLY";
}
