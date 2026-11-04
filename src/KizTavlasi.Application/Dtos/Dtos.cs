using KizTavlasi.Domain;

namespace KizTavlasi.Application.Dtos;

public sealed record CreateRoomRequest(string DisplayName, int BestOf, int? TurnTimeLimitSeconds = null);

/// <param name="Difficulty">"Easy" (Kolay) veya "Master" (Usta).</param>
public sealed record CreateBotRoomRequest(string DisplayName, int BestOf, string Difficulty, int? TurnTimeLimitSeconds = null);

public sealed record JoinRoomRequest(string DisplayName);

public sealed record PlayerDto(
    Guid Id,
    string DisplayName,
    int Seat,
    bool IsConnected,
    bool IsHost,
    bool IsBot = false);

public sealed record PointStateDto(int PointNumber, int BackCount, int FrontCount);

public sealed record PlayerBoardDto(
    Guid PlayerId,
    int Seat,
    IReadOnlyList<PointStateDto> Points,
    int CollectedCount,
    bool IsCollecting);

public sealed record RoundDto(
    Guid Id,
    int RoundNumber,
    string Status,
    Guid? StartingPlayerId,
    Guid? CurrentPlayerId,
    Guid? WinnerPlayerId,
    int TurnNumber,
    IReadOnlyList<int> PendingDice,
    int PendingBonusPicks,
    IReadOnlyList<PlayerBoardDto> Boards,
    DateTime? TurnDeadlineUtc = null);

public sealed record MatchDto(
    Guid Id,
    int MatchNumber,
    int BestOf,
    int RequiredWins,
    string Status,
    int Player1Score,
    int Player2Score,
    Guid? WinnerPlayerId,
    RoundDto? CurrentRound);

public sealed record RoomSnapshotDto(
    string RoomCode,
    string Status,
    int BestOf,
    Guid? HostPlayerId,
    IReadOnlyList<PlayerDto> Players,
    MatchDto? Match,
    Guid? RematchRequestedByPlayerId,
    long StateVersion,
    DateTime ServerTimeUtc,
    int? TurnTimeLimitSeconds = null);

public sealed record CreateRoomResult(
    string RoomCode,
    string SharePath,
    string PlayerToken,
    PlayerDto Player,
    RoomSnapshotDto RoomState);

/// <summary>İzleyici girişi: salt okunur token ve anlık durum.</summary>
public sealed record WatchRoomResult(
    string RoomCode,
    string SpectatorToken,
    RoomSnapshotDto RoomState);

public sealed record JoinRoomResult(
    string RoomCode,
    string PlayerToken,
    PlayerDto Player,
    RoomSnapshotDto RoomState);

public sealed record StartingRollAttemptDto(int Player1Die, int Player2Die, bool IsTie);

public sealed record StartingRollDto(
    IReadOnlyList<StartingRollAttemptDto> Attempts,
    Guid StartingPlayerId,
    int StartingSeat);

public sealed record DiceStepDto(
    int Die,
    int? SourcePoint,
    string Action,
    int CollectedPieces,
    PointSnapshotDto Before,
    PointSnapshotDto After);

public sealed record PointSnapshotDto(int Back, int Front, int Collected);

public sealed record DiceRollResultDto(
    Guid PlayerId,
    int Die1,
    int Die2,
    bool IsDouble,
    IReadOnlyList<DiceStepDto> WastedSteps,
    IReadOnlyList<int> PlayableDice,
    int BonusPicksGranted,
    bool TurnWasted,
    long StateVersion);

public sealed record MovePlayedDto(
    Guid PlayerId,
    int PointNumber,
    string Action,
    IReadOnlyList<int> RemainingDice,
    int RemainingBonusPicks,
    IReadOnlyList<int> WastedDice,
    bool RoundCompleted,
    long StateVersion);

public sealed record RoundEndedDto(
    Guid WinnerPlayerId,
    int RoundNumber,
    int Player1Score,
    int Player2Score,
    int PointsAwarded,
    bool IsMars,
    bool MatchCompleted);

public sealed record MatchEndedDto(
    Guid WinnerPlayerId,
    int Player1Score,
    int Player2Score,
    bool IsMars);

public sealed record StartMatchResult(StartingRollDto StartingRoll, RoomSnapshotDto Snapshot);

public sealed record RollDiceResult(DiceRollResultDto Roll, RoomSnapshotDto Snapshot, bool WasAlreadyProcessed);

public sealed record PublicConfigDto(
    string ProductName,
    IReadOnlyList<int> SupportedBestOf,
    IReadOnlyList<string> AllowedReactions,
    IReadOnlyList<int> SupportedTurnTimeLimits);

public static class DtoExtensions
{
    public static DiceStepDto ToDto(this DiceStep step) => new(
        step.Die,
        step.SourcePoint,
        step.Action.ToString(),
        step.CollectedPieces,
        new PointSnapshotDto(step.Before.Back, step.Before.Front, step.Before.Collected),
        new PointSnapshotDto(step.After.Back, step.After.Front, step.After.Collected));
}
