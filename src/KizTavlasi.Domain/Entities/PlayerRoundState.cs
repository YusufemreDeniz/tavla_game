namespace KizTavlasi.Domain.Entities;

public class PlayerRoundState
{
    public Guid Id { get; set; }
    public Guid RoundId { get; set; }
    public Guid PlayerId { get; set; }
    public int CollectedCount { get; set; }

    public Round Round { get; set; } = null!;
    public List<PlayerPointState> PointStates { get; set; } = [];

    /// <summary>Kalıcı durumdan domain tahta modelini oluşturur.</summary>
    public PlayerBoard ToBoard()
    {
        var points = PointStates
            .OrderBy(p => p.PointNumber)
            .Select(p => new PointState(p.PointNumber, p.BackCount, p.FrontCount))
            .ToList();
        return new PlayerBoard(points, CollectedCount);
    }

    /// <summary>Domain tahta modelindeki değişiklikleri kalıcı duruma yansıtır.</summary>
    public void ApplyBoard(PlayerBoard board)
    {
        CollectedCount = board.CollectedCount;
        foreach (var pointState in PointStates)
        {
            var point = board.GetPoint(pointState.PointNumber);
            pointState.BackCount = point.BackCount;
            pointState.FrontCount = point.FrontCount;
        }
    }

    public static PlayerRoundState CreateInitial(Guid roundId, Guid playerId)
    {
        var board = new PlayerBoard();
        var state = new PlayerRoundState
        {
            Id = Guid.CreateVersion7(),
            RoundId = roundId,
            PlayerId = playerId,
            CollectedCount = 0
        };
        state.PointStates = board.Points
            .Select(p => new PlayerPointState
            {
                Id = Guid.CreateVersion7(),
                PlayerRoundStateId = state.Id,
                PointNumber = p.PointNumber,
                BackCount = p.BackCount,
                FrontCount = p.FrontCount
            })
            .ToList();
        return state;
    }
}
