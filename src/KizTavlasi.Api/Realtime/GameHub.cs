using KizTavlasi.Application;
using KizTavlasi.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace KizTavlasi.Api.Realtime;

public sealed record StartMatchHubRequest(Guid CommandId);
public sealed record RollDiceHubRequest(Guid CommandId, long ExpectedStateVersion);
public sealed record PlayMoveHubRequest(int PointNumber, long ExpectedStateVersion);
public sealed record ReactionHubRequest(string Emoji);

/// <summary>
/// Oyun kuralları içermez: yalnızca kimlik doğrulama, oturum doğrulama,
/// application service çağrısı ve grup yönetimi yapar.
/// </summary>
[Authorize]
public sealed class GameHub : Hub
{
    private readonly RoomService _roomService;
    private readonly GameService _gameService;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<GameHub> _logger;

    public GameHub(RoomService roomService, GameService gameService, TimeProvider timeProvider, ILogger<GameHub> logger)
    {
        _roomService = roomService;
        _gameService = gameService;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    private static string GroupName(string roomCode) => $"room:{roomCode}";

    private async Task<PlayerSession> GetValidatedSessionAsync()
    {
        var session = PlayerSessionResolver.Resolve(Context.User!);
        await _roomService.ValidateSessionAsync(session, Context.ConnectionAborted);
        return session;
    }

    public override async Task OnConnectedAsync()
    {
        var session = await GetValidatedSessionAsync();
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(session.RoomCode));
        await _roomService.SetConnectionStateAsync(session, isConnected: true, Context.ConnectionAborted);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        try
        {
            var session = PlayerSessionResolver.Resolve(Context.User!);
            await _roomService.SetConnectionStateAsync(session, isConnected: false);
        }
        catch (GameDomainException)
        {
            // Oda silinmiş veya oturum geçersiz; kopma bildirimi gerekli değil.
        }
        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinRoom()
    {
        var session = await GetValidatedSessionAsync();
        var snapshot = await _roomService.GetRoomStateAsync(session, Context.ConnectionAborted);
        await Clients.Caller.SendAsync(GameHubEvents.RoomSnapshotReceived, snapshot, Context.ConnectionAborted);
    }

    public async Task RejoinRoom()
    {
        var session = await GetValidatedSessionAsync();
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(session.RoomCode));
        await _roomService.SetConnectionStateAsync(session, isConnected: true, Context.ConnectionAborted);
        var snapshot = await _roomService.GetRoomStateAsync(session, Context.ConnectionAborted);
        await Clients.Caller.SendAsync(GameHubEvents.RoomSnapshotReceived, snapshot, Context.ConnectionAborted);
    }

    public async Task StartMatch(StartMatchHubRequest request)
    {
        var session = await GetValidatedSessionAsync();
        await Clients.Group(GroupName(session.RoomCode))
            .SendAsync(GameHubEvents.StartingRollStarted, new { roomCode = session.RoomCode, serverTimeUtc = _timeProvider.GetUtcNow().UtcDateTime });
        await _gameService.StartMatchAsync(session, request.CommandId, Context.ConnectionAborted);
    }

    public async Task RollDice(RollDiceHubRequest request)
    {
        var session = await GetValidatedSessionAsync();
        if (request.CommandId == Guid.Empty)
        {
            throw new GameDomainException(DomainErrorCodes.InvalidCommand, "CommandId zorunludur.");
        }

        await Clients.Group(GroupName(session.RoomCode))
            .SendAsync(GameHubEvents.DiceRollStarted, new
            {
                roomCode = session.RoomCode,
                playerId = session.PlayerId,
                serverTimeUtc = _timeProvider.GetUtcNow().UtcDateTime
            });

        await _gameService.RollDiceAsync(session, request.CommandId, request.ExpectedStateVersion, Context.ConnectionAborted);
    }

    public async Task PlayMove(PlayMoveHubRequest request)
    {
        var session = await GetValidatedSessionAsync();
        if (request.PointNumber is < 1 or > 6)
        {
            throw new GameDomainException(DomainErrorCodes.InvalidCommand, "Geçersiz hane numarası.");
        }

        await _gameService.PlayMoveAsync(session, request.PointNumber, request.ExpectedStateVersion, Context.ConnectionAborted);
    }

    public async Task RequestRematch()
    {
        var session = await GetValidatedSessionAsync();
        await _gameService.RequestRematchAsync(session, Context.ConnectionAborted);
    }

    public async Task AcceptRematch()
    {
        var session = await GetValidatedSessionAsync();
        await _gameService.AcceptRematchAsync(session, Context.ConnectionAborted);
    }

    public async Task DeclineRematch()
    {
        var session = await GetValidatedSessionAsync();
        await _gameService.DeclineRematchAsync(session, Context.ConnectionAborted);
    }

    public async Task SendReaction(ReactionHubRequest request)
    {
        var session = await GetValidatedSessionAsync();
        if (!GameConstants.AllowedReactions.Contains(request.Emoji))
        {
            throw new GameDomainException(DomainErrorCodes.InvalidCommand, "Bu tepki desteklenmiyor.");
        }

        await Clients.Group(GroupName(session.RoomCode)).SendAsync(GameHubEvents.ReactionReceived, new
        {
            roomCode = session.RoomCode,
            fromPlayerId = session.PlayerId,
            emoji = request.Emoji,
            serverTimeUtc = _timeProvider.GetUtcNow().UtcDateTime
        }, Context.ConnectionAborted);
    }

    public async Task ReportClientReady()
    {
        var session = await GetValidatedSessionAsync();
        _logger.LogDebug("İstemci hazır. RoomCode: {RoomCode}, PlayerId: {PlayerId}", session.RoomCode, session.PlayerId);
    }
}
