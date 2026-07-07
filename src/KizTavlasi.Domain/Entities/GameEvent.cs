namespace KizTavlasi.Domain.Entities;

/// <summary>Append-only audit kaydı; gerçek state yerine geçmez.</summary>
public class GameEvent
{
    public long Id { get; set; }
    public Guid RoomId { get; set; }
    public Guid? MatchId { get; set; }
    public Guid? RoundId { get; set; }
    public long SequenceNumber { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string PayloadJson { get; set; } = string.Empty;
    public DateTime OccurredAtUtc { get; set; }
}
