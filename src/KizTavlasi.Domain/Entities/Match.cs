namespace KizTavlasi.Domain.Entities;

public class Match
{
    public Guid Id { get; set; }
    public Guid RoomId { get; set; }
    public int MatchNumber { get; set; }
    public int BestOf { get; set; }
    public int RequiredWins { get; set; }
    public MatchStatus Status { get; set; }
    public int Player1Score { get; set; }
    public int Player2Score { get; set; }
    public Guid? CurrentRoundId { get; set; }
    public Guid? WinnerPlayerId { get; set; }
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public long StateVersion { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public GameRoom Room { get; set; } = null!;
    public List<Round> Rounds { get; set; } = [];
}
