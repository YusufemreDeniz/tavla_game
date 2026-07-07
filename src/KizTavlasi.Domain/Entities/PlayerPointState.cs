namespace KizTavlasi.Domain.Entities;

public class PlayerPointState
{
    public Guid Id { get; set; }
    public Guid PlayerRoundStateId { get; set; }
    public int PointNumber { get; set; }
    public int BackCount { get; set; }
    public int FrontCount { get; set; }

    public PlayerRoundState PlayerRoundState { get; set; } = null!;
}
