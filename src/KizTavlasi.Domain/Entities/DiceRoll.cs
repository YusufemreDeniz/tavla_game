namespace KizTavlasi.Domain.Entities;

public class DiceRoll
{
    public Guid Id { get; set; }
    public Guid RoundId { get; set; }
    public Guid PlayerId { get; set; }
    public int TurnNumber { get; set; }
    public int Die1 { get; set; }
    public int Die2 { get; set; }
    public bool IsDouble { get; set; }
    public Guid CommandId { get; set; }
    public string ResolutionJson { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }

    public Round Round { get; set; } = null!;
}
