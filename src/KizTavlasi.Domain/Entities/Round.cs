namespace KizTavlasi.Domain.Entities;

public class Round
{
    public Guid Id { get; set; }
    public Guid MatchId { get; set; }
    public int RoundNumber { get; set; }
    public RoundStatus Status { get; set; }
    public Guid? StartingPlayerId { get; set; }
    public Guid? CurrentPlayerId { get; set; }
    public Guid? WinnerPlayerId { get; set; }
    public int TurnNumber { get; set; }

    /// <summary>Sıradaki oyuncunun oynaması gereken zarlar (virgülle ayrılmış, örn. "5,3").</summary>
    public string PendingDice { get; set; } = string.Empty;

    /// <summary>Çift bonusuyla kazanılan, istenen haneden harcanabilen serbest hamle hakkı.</summary>
    public int PendingBonusPicks { get; set; }

    /// <summary>
    /// Sunucunun sıradaki oyuncu adına otomatik hareket edeceği an: bot için kısa
    /// "düşünme" gecikmesi, süreli odada insan oyuncu için hamle süresinin sonu.
    /// <c>null</c> = otomatik eylem yok (süresiz oda, insan oyuncu).
    /// </summary>
    public DateTime? TurnDeadlineUtc { get; set; }
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public long StateVersion { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public Match Match { get; set; } = null!;
    public List<PlayerRoundState> PlayerStates { get; set; } = [];
    public List<DiceRoll> DiceRolls { get; set; } = [];
}
