namespace KizTavlasi.Domain.Entities;

public class GameRoom
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public RoomStatus Status { get; set; }
    public int BestOf { get; set; }
    public Guid? HostPlayerId { get; set; }
    public Guid? CurrentMatchId { get; set; }
    public Guid? RematchRequestedByPlayerId { get; set; }
    public long StateVersion { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public List<Player> Players { get; set; } = [];
    public List<Match> Matches { get; set; } = [];
}
