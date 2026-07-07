using KizTavlasi.Application;
using KizTavlasi.Application.Abstractions;
using KizTavlasi.Application.Dtos;
using KizTavlasi.Domain;
using KizTavlasi.Infrastructure.Persistence;
using KizTavlasi.Infrastructure.Security;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace KizTavlasi.Application.Tests.TestInfrastructure;

/// <summary>Uygulama servislerini gerçek veritabanı + sahte zar/bildirimlerle kurar.</summary>
public sealed class TestHarness : IDisposable
{
    public GameDbContext Db { get; }
    public RoomService RoomService { get; }
    public GameService GameService { get; }
    public QueueDiceService Dice { get; } = new();
    public RecordingNotifier Notifier { get; } = new();
    public FakeTimeProvider Time { get; } = new(new DateTimeOffset(2026, 7, 6, 12, 0, 0, TimeSpan.Zero));

    public TestHarness(SqlTestDatabase database)
    {
        Db = database.CreateContext();

        var gameOptions = Options.Create(new GameOptions());
        var jwtOptions = Options.Create(new JwtOptions
        {
            SigningKey = "test-signing-key-for-unit-tests-0123456789abcdef",
            Issuer = "test",
            Audience = "test",
            ExpirationHours = 24
        });

        var tokenService = new PlayerTokenService(jwtOptions, Time);

        RoomService = new RoomService(
            Db,
            new RoomCodeGenerator(),
            tokenService,
            Notifier,
            Time,
            gameOptions,
            NullLogger<RoomService>.Instance);

        GameService = new GameService(
            Db,
            RoomService,
            Dice,
            Notifier,
            new GameEngine(GameRulesOptions.Default),
            Time,
            NullLogger<GameService>.Instance);
    }

    public PlayerSession SessionFor(string token)
    {
        var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);
        string Claim(string type) => jwt.Claims.First(c => c.Type == type).Value;

        return new PlayerSession(
            Guid.Parse(Claim(GameClaimTypes.PlayerId)),
            Guid.Parse(Claim(GameClaimTypes.RoomId)),
            Claim(GameClaimTypes.RoomCode),
            int.Parse(Claim(GameClaimTypes.Seat)),
            Guid.Parse(Claim(GameClaimTypes.SessionId)),
            Claim("jti"));
    }

    public void Dispose() => Db.Dispose();
}

/// <summary>Testlerde sıradaki zar değerlerini kuyruğa yazarak deterministik oyun sağlar.</summary>
public sealed class QueueDiceService : IDiceService
{
    private readonly Queue<int> _values = new();

    public void Enqueue(params int[] values)
    {
        foreach (var value in values)
        {
            _values.Enqueue(value);
        }
    }

    public DiceResult Roll() => DiceResult.Create(RollSingle(), RollSingle());

    public int RollSingle() => _values.Count > 0 ? _values.Dequeue() : 1;
}

/// <summary>Yayınlanan olayları kaydeder; SignalR gerektirmez.</summary>
public sealed class RecordingNotifier : IGameNotifier
{
    public List<string> Events { get; } = [];
    public RoomSnapshotDto? LastSnapshot { get; private set; }
    public RoundEndedDto? LastRoundEnded { get; private set; }
    public MatchEndedDto? LastMatchEnded { get; private set; }

    private Task Record(string name, RoomSnapshotDto snapshot)
    {
        Events.Add(name);
        LastSnapshot = snapshot;
        return Task.CompletedTask;
    }

    public Task PlayerJoinedAsync(string roomCode, PlayerDto player, RoomSnapshotDto snapshot, CancellationToken ct = default) => Record("PlayerJoined", snapshot);
    public Task PlayerLeftAsync(string roomCode, Guid playerId, RoomSnapshotDto snapshot, CancellationToken ct = default) => Record("PlayerLeft", snapshot);
    public Task PlayerConnectionChangedAsync(string roomCode, Guid playerId, bool isConnected, RoomSnapshotDto snapshot, CancellationToken ct = default) => Record("PlayerConnectionChanged", snapshot);
    public Task MatchStartedAsync(string roomCode, RoomSnapshotDto snapshot, CancellationToken ct = default) => Record("MatchStarted", snapshot);
    public Task StartingRollResolvedAsync(string roomCode, StartingRollDto startingRoll, RoomSnapshotDto snapshot, CancellationToken ct = default) => Record("StartingRollResolved", snapshot);
    public Task TurnStartedAsync(string roomCode, Guid currentPlayerId, int turnNumber, RoomSnapshotDto snapshot, CancellationToken ct = default) => Record("TurnStarted", snapshot);
    public Task DiceRollResolvedAsync(string roomCode, DiceRollResultDto result, RoomSnapshotDto snapshot, CancellationToken ct = default) => Record("DiceRollResolved", snapshot);
    public Task MovePlayedAsync(string roomCode, MovePlayedDto movePlayed, RoomSnapshotDto snapshot, CancellationToken ct = default) => Record("MovePlayed", snapshot);
    public Task RoundEndedAsync(string roomCode, RoundEndedDto roundEnded, RoomSnapshotDto snapshot, CancellationToken ct = default)
    {
        LastRoundEnded = roundEnded;
        return Record("RoundEnded", snapshot);
    }

    public Task MatchEndedAsync(string roomCode, MatchEndedDto matchEnded, RoomSnapshotDto snapshot, CancellationToken ct = default)
    {
        LastMatchEnded = matchEnded;
        return Record("MatchEnded", snapshot);
    }
    public Task RematchRequestedAsync(string roomCode, Guid requestedByPlayerId, RoomSnapshotDto snapshot, CancellationToken ct = default) => Record("RematchRequested", snapshot);
    public Task RematchAcceptedAsync(string roomCode, RoomSnapshotDto snapshot, CancellationToken ct = default) => Record("RematchAccepted", snapshot);
    public Task RematchDeclinedAsync(string roomCode, Guid declinedByPlayerId, RoomSnapshotDto snapshot, CancellationToken ct = default) => Record("RematchDeclined", snapshot);
}
