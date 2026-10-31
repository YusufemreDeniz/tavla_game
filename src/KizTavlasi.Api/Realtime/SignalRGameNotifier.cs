using KizTavlasi.Application.Abstractions;
using KizTavlasi.Application.Dtos;
using Microsoft.AspNetCore.SignalR;

namespace KizTavlasi.Api.Realtime;

/// <summary>
/// Uygulama servislerinin ürettiği olayları SignalR grubuna yayınlar.
/// Her olayın ardından authoritative snapshot (GameStateUpdated) gönderilir.
/// </summary>
public sealed class SignalRGameNotifier : IGameNotifier
{
    private readonly IHubContext<GameHub> _hubContext;

    public SignalRGameNotifier(IHubContext<GameHub> hubContext)
    {
        _hubContext = hubContext;
    }

    private static string GroupName(string roomCode) => $"room:{roomCode}";

    private async Task SendWithSnapshotAsync(string roomCode, string eventName, object payload, RoomSnapshotDto snapshot, CancellationToken ct)
    {
        var group = _hubContext.Clients.Group(GroupName(roomCode));
        await group.SendAsync(eventName, payload, ct);
        await group.SendAsync(GameHubEvents.GameStateUpdated, snapshot, ct);
    }

    public Task PlayerJoinedAsync(string roomCode, PlayerDto player, RoomSnapshotDto snapshot, CancellationToken ct = default) =>
        SendWithSnapshotAsync(roomCode, GameHubEvents.PlayerJoined,
            new { roomCode, player, stateVersion = snapshot.StateVersion, serverTimeUtc = snapshot.ServerTimeUtc }, snapshot, ct);

    public Task PlayerLeftAsync(string roomCode, Guid playerId, RoomSnapshotDto snapshot, CancellationToken ct = default) =>
        SendWithSnapshotAsync(roomCode, GameHubEvents.PlayerLeft,
            new { roomCode, playerId, stateVersion = snapshot.StateVersion, serverTimeUtc = snapshot.ServerTimeUtc }, snapshot, ct);

    public Task PlayerConnectionChangedAsync(string roomCode, Guid playerId, bool isConnected, RoomSnapshotDto snapshot, CancellationToken ct = default) =>
        SendWithSnapshotAsync(roomCode, GameHubEvents.PlayerConnectionChanged,
            new { roomCode, playerId, isConnected, stateVersion = snapshot.StateVersion, serverTimeUtc = snapshot.ServerTimeUtc }, snapshot, ct);

    public Task StartingRollStartedAsync(string roomCode, DateTime serverTimeUtc, CancellationToken ct = default) =>
        _hubContext.Clients.Group(GroupName(roomCode))
            .SendAsync(GameHubEvents.StartingRollStarted, new { roomCode, serverTimeUtc }, ct);

    public Task MatchStartedAsync(string roomCode, RoomSnapshotDto snapshot, CancellationToken ct = default) =>
        SendWithSnapshotAsync(roomCode, GameHubEvents.MatchStarted,
            new { roomCode, match = snapshot.Match, stateVersion = snapshot.StateVersion, serverTimeUtc = snapshot.ServerTimeUtc }, snapshot, ct);

    public Task StartingRollResolvedAsync(string roomCode, StartingRollDto startingRoll, RoomSnapshotDto snapshot, CancellationToken ct = default) =>
        SendWithSnapshotAsync(roomCode, GameHubEvents.StartingRollResolved,
            new { roomCode, startingRoll, stateVersion = snapshot.StateVersion, serverTimeUtc = snapshot.ServerTimeUtc }, snapshot, ct);

    public Task TurnStartedAsync(string roomCode, Guid currentPlayerId, int turnNumber, RoomSnapshotDto snapshot, CancellationToken ct = default) =>
        SendWithSnapshotAsync(roomCode, GameHubEvents.TurnStarted,
            new { roomCode, currentPlayerId, turnNumber, stateVersion = snapshot.StateVersion, serverTimeUtc = snapshot.ServerTimeUtc }, snapshot, ct);

    public Task DiceRollStartedAsync(string roomCode, Guid playerId, DateTime serverTimeUtc, CancellationToken ct = default) =>
        _hubContext.Clients.Group(GroupName(roomCode))
            .SendAsync(GameHubEvents.DiceRollStarted, new { roomCode, playerId, serverTimeUtc }, ct);

    public Task DiceRollResolvedAsync(string roomCode, DiceRollResultDto result, RoomSnapshotDto snapshot, CancellationToken ct = default) =>
        SendWithSnapshotAsync(roomCode, GameHubEvents.DiceRollResolved,
            new { roomCode, roll = result, stateVersion = snapshot.StateVersion, serverTimeUtc = snapshot.ServerTimeUtc }, snapshot, ct);

    public Task MovePlayedAsync(string roomCode, MovePlayedDto movePlayed, RoomSnapshotDto snapshot, CancellationToken ct = default) =>
        SendWithSnapshotAsync(roomCode, GameHubEvents.MovePlayed,
            new { roomCode, movePlayed, stateVersion = snapshot.StateVersion, serverTimeUtc = snapshot.ServerTimeUtc }, snapshot, ct);

    public Task RoundEndedAsync(string roomCode, RoundEndedDto roundEnded, RoomSnapshotDto snapshot, CancellationToken ct = default) =>
        SendWithSnapshotAsync(roomCode, GameHubEvents.RoundEnded,
            new { roomCode, roundEnded, stateVersion = snapshot.StateVersion, serverTimeUtc = snapshot.ServerTimeUtc }, snapshot, ct);

    public Task MatchEndedAsync(string roomCode, MatchEndedDto matchEnded, RoomSnapshotDto snapshot, CancellationToken ct = default) =>
        SendWithSnapshotAsync(roomCode, GameHubEvents.MatchEnded,
            new { roomCode, matchEnded, stateVersion = snapshot.StateVersion, serverTimeUtc = snapshot.ServerTimeUtc }, snapshot, ct);

    public Task RematchRequestedAsync(string roomCode, Guid requestedByPlayerId, RoomSnapshotDto snapshot, CancellationToken ct = default) =>
        SendWithSnapshotAsync(roomCode, GameHubEvents.RematchRequested,
            new { roomCode, requestedByPlayerId, stateVersion = snapshot.StateVersion, serverTimeUtc = snapshot.ServerTimeUtc }, snapshot, ct);

    public Task RematchAcceptedAsync(string roomCode, RoomSnapshotDto snapshot, CancellationToken ct = default) =>
        SendWithSnapshotAsync(roomCode, GameHubEvents.RematchAccepted,
            new { roomCode, stateVersion = snapshot.StateVersion, serverTimeUtc = snapshot.ServerTimeUtc }, snapshot, ct);

    public Task RematchDeclinedAsync(string roomCode, Guid declinedByPlayerId, RoomSnapshotDto snapshot, CancellationToken ct = default) =>
        SendWithSnapshotAsync(roomCode, GameHubEvents.RematchDeclined,
            new { roomCode, declinedByPlayerId, stateVersion = snapshot.StateVersion, serverTimeUtc = snapshot.ServerTimeUtc }, snapshot, ct);
}
