using KizTavlasi.Application.Dtos;

namespace KizTavlasi.Application.Abstractions;

/// <summary>
/// Oyun olaylarını gerçek zamanlı olarak yayınlar. Implementasyon SignalR kullanır;
/// uygulama servisleri SignalR'a doğrudan bağımlı olmaz.
/// </summary>
public interface IGameNotifier
{
    Task PlayerJoinedAsync(string roomCode, PlayerDto player, RoomSnapshotDto snapshot, CancellationToken ct = default);
    Task PlayerLeftAsync(string roomCode, Guid playerId, RoomSnapshotDto snapshot, CancellationToken ct = default);
    Task PlayerConnectionChangedAsync(string roomCode, Guid playerId, bool isConnected, RoomSnapshotDto snapshot, CancellationToken ct = default);
    Task StartingRollStartedAsync(string roomCode, DateTime serverTimeUtc, CancellationToken ct = default) => Task.CompletedTask;
    Task MatchStartedAsync(string roomCode, RoomSnapshotDto snapshot, CancellationToken ct = default);
    Task StartingRollResolvedAsync(string roomCode, StartingRollDto startingRoll, RoomSnapshotDto snapshot, CancellationToken ct = default);
    Task TurnStartedAsync(string roomCode, Guid currentPlayerId, int turnNumber, RoomSnapshotDto snapshot, CancellationToken ct = default);
    Task DiceRollStartedAsync(string roomCode, Guid playerId, DateTime serverTimeUtc, CancellationToken ct = default) => Task.CompletedTask;
    Task DiceRollResolvedAsync(string roomCode, DiceRollResultDto result, RoomSnapshotDto snapshot, CancellationToken ct = default);
    Task MovePlayedAsync(string roomCode, MovePlayedDto movePlayed, RoomSnapshotDto snapshot, CancellationToken ct = default);
    Task RoundEndedAsync(string roomCode, RoundEndedDto roundEnded, RoomSnapshotDto snapshot, CancellationToken ct = default);
    Task MatchEndedAsync(string roomCode, MatchEndedDto matchEnded, RoomSnapshotDto snapshot, CancellationToken ct = default);
    Task RematchRequestedAsync(string roomCode, Guid requestedByPlayerId, RoomSnapshotDto snapshot, CancellationToken ct = default);
    Task RematchAcceptedAsync(string roomCode, RoomSnapshotDto snapshot, CancellationToken ct = default);
    Task RematchDeclinedAsync(string roomCode, Guid declinedByPlayerId, RoomSnapshotDto snapshot, CancellationToken ct = default);
}
