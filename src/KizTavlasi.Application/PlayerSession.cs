namespace KizTavlasi.Application;

/// <summary>JWT claim'lerinden çözülen oyuncu oturumu.</summary>
public sealed record PlayerSession(
    Guid PlayerId,
    Guid RoomId,
    string RoomCode,
    int Seat,
    Guid SessionId,
    string Jti);
