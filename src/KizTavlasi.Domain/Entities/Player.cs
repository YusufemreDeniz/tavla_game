namespace KizTavlasi.Domain.Entities;

public class Player
{
    public Guid Id { get; set; }
    public Guid RoomId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public int Seat { get; set; }
    public Guid SessionId { get; set; }
    public string SessionTokenHash { get; set; } = string.Empty;
    public bool IsConnected { get; set; }
    public DateTime JoinedAtUtc { get; set; }
    public DateTime LastSeenAtUtc { get; set; }
    public DateTime? DisconnectedAtUtc { get; set; }

    /// <summary>Yapay zekâ oyuncusuysa zorluk seviyesi; insan oyuncularda <c>null</c>.</summary>
    public BotDifficulty? BotDifficulty { get; set; }

    public bool IsBot => BotDifficulty is not null;

    public GameRoom Room { get; set; } = null!;
}
