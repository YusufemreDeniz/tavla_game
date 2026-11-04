using System.Security.Cryptography;
using System.Text;
using KizTavlasi.Domain;
using KizTavlasi.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using KizTavlasi.Application.Abstractions;

namespace KizTavlasi.Application;

/// <summary>Otomasyon çalıştırmasının sonucu (log ve testler için).</summary>
public enum AutomationOutcome
{
    NothingDue,
    Rolled,
    Moved,
    RematchAccepted,
    Skipped
}

/// <summary>
/// Sunucunun bir oyuncu adına yaptığı otomatik eylem: bot hamlesi, süresi dolan insan
/// oyuncu için otomatik zar/hamle, botun rövanş kabulü.
///
/// Güvenlik ve tutarlılık: istemci komutlarıyla AYNI <see cref="GameService"/> yolu kullanılır
/// (sıra, state version, idempotency). CommandId (round, stateVersion)'dan deterministik
/// türetilir; aynı an için iki çalıştırma (zamanlayıcı + tarama, çoklu instance) ikinci kez
/// uygulanamaz, eski durum STALE_STATE ile reddedilir.
/// </summary>
public sealed class TurnAutomationRunner
{
    private readonly IGameDbContext _db;
    private readonly RoomService _roomService;
    private readonly GameService _gameService;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<TurnAutomationRunner> _logger;

    public TurnAutomationRunner(
        IGameDbContext db,
        RoomService roomService,
        GameService gameService,
        TimeProvider timeProvider,
        ILogger<TurnAutomationRunner> logger)
    {
        _db = db;
        _roomService = roomService;
        _gameService = gameService;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    /// <summary>Odada zamanı gelmiş otomatik eylem varsa tek bir adım uygular.</summary>
    public async Task<AutomationOutcome> RunDueAsync(Guid roomId, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        GameRoom room;
        Match? match;
        Round? round;
        try
        {
            (room, match, round) = await _roomService.LoadRoomGraphAsync(roomId, tracking: false, ct);
        }
        catch (GameDomainException ex) when (ex.Code == DomainErrorCodes.RoomNotFound)
        {
            return AutomationOutcome.NothingDue;
        }

        try
        {
            if (IsBotRematchPending(room, match))
            {
                var bot = room.Players.First(p => p.IsBot);
                await _gameService.AcceptRematchAsync(SessionFor(room, bot), ct);
                _logger.LogInformation("Bot rövanşı kabul etti. RoomCode: {RoomCode}", room.Code);
                return AutomationOutcome.RematchAccepted;
            }

            if (match is null || match.Status != MatchStatus.InProgress
                || round is null || round.Status != RoundStatus.InProgress
                || round.CurrentPlayerId is null
                || round.TurnDeadlineUtc is null || round.TurnDeadlineUtc > now)
            {
                return AutomationOutcome.NothingDue;
            }

            var player = room.Players.FirstOrDefault(p => p.Id == round.CurrentPlayerId);
            if (player is null)
            {
                return AutomationOutcome.NothingDue;
            }

            var session = SessionFor(room, player);
            var commandId = DeterministicCommandId(round.Id, room.StateVersion);
            var pendingDice = string.IsNullOrEmpty(round.PendingDice)
                ? new List<int>()
                : round.PendingDice.Split(',').Select(int.Parse).ToList();

            if (pendingDice.Count == 0 && round.PendingBonusPicks == 0)
            {
                await _gameService.RollDiceAsync(session, commandId, room.StateVersion, ct);
                LogAction("zar attı", room, player);
                return AutomationOutcome.Rolled;
            }

            var board = round.PlayerStates.First(s => s.PlayerId == player.Id).ToBoard();
            // Süresi dolan insan oyuncu için "rastgele geçerli hamle" (Kolay strateji) oynanır.
            var difficulty = player.BotDifficulty ?? BotDifficulty.Easy;
            var random = new Random(SeedFrom(commandId));
            var point = BotStrategy.ChooseMove(board, pendingDice, round.PendingBonusPicks, difficulty, random);
            if (point is null)
            {
                return AutomationOutcome.Skipped;
            }

            await _gameService.PlayMoveAsync(session, point.Value, room.StateVersion, ct, commandId);
            LogAction($"{point}. haneyi oynadı", room, player);
            return AutomationOutcome.Moved;
        }
        catch (GameDomainException ex) when (ex.Code is DomainErrorCodes.StaleState
                                             or DomainErrorCodes.NotYourTurn
                                             or DomainErrorCodes.MatchNotActive
                                             or DomainErrorCodes.RoundAlreadyCompleted
                                             or DomainErrorCodes.RematchNotAvailable
                                             or DomainErrorCodes.InvalidCommand)
        {
            // Bu arada oyuncu kendisi oynadı ya da başka bir çalıştırma önce davrandı.
            _logger.LogDebug("Otomatik eylem atlandı. RoomCode: {RoomCode}, Code: {Code}", room.Code, ex.Code);
            return AutomationOutcome.Skipped;
        }
    }

    /// <summary>Zamanı gelmiş (veya kaçırılmış) otomatik eylemi olan odalar: sunucu yeniden başlatıldığında da çalışır.</summary>
    public async Task<IReadOnlyList<(Guid RoomId, DateTime DueUtc)>> FindPendingAsync(CancellationToken ct = default)
    {
        var dueRounds = await _db.Rounds
            .AsNoTracking()
            .Where(r => r.Status == RoundStatus.InProgress && r.TurnDeadlineUtc != null)
            .Join(_db.Matches.AsNoTracking(), r => r.MatchId, m => m.Id, (r, m) => new { m.RoomId, Due = r.TurnDeadlineUtc!.Value, MatchCurrentRound = m.CurrentRoundId, RoundId = r.Id })
            .Where(x => x.MatchCurrentRound == x.RoundId)
            .Select(x => new { x.RoomId, x.Due })
            .ToListAsync(ct);

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var rematchRooms = await _db.GameRooms
            .AsNoTracking()
            .Where(r => r.Status == RoomStatus.Completed
                        && r.RematchRequestedByPlayerId != null
                        && r.Players.Any(p => p.BotDifficulty != null))
            .Select(r => r.Id)
            .ToListAsync(ct);

        return dueRounds.Select(x => (x.RoomId, x.Due))
            .Concat(rematchRooms.Select(id => (id, now)))
            .ToList();
    }

    private static bool IsBotRematchPending(GameRoom room, Match? match) =>
        room.Status == RoomStatus.Completed
        && match is { Status: MatchStatus.Completed }
        && room.RematchRequestedByPlayerId is Guid requester
        && room.Players.Any(p => p.Id == requester && !p.IsBot)
        && room.Players.Any(p => p.IsBot);

    /// <summary>Sunucu içi oturum: JWT yoktur, yalnızca GameService'in oyuncu/oda eşleşmesi için.</summary>
    private static PlayerSession SessionFor(GameRoom room, Player player) =>
        new(player.Id, room.Id, room.Code, player.Seat, player.SessionId, Jti: "server-automation");

    internal static Guid DeterministicCommandId(Guid roundId, long stateVersion)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"auto:{roundId:N}:{stateVersion}"));
        return new Guid(bytes.AsSpan(0, 16));
    }

    private static int SeedFrom(Guid commandId) => BitConverter.ToInt32(commandId.ToByteArray(), 0);

    private void LogAction(string action, GameRoom room, Player player)
    {
        _logger.LogInformation(
            "Otomatik eylem: {Who} {Action}. RoomCode: {RoomCode}, PlayerId: {PlayerId}, StateVersion: {StateVersion}",
            player.IsBot ? "bot" : "süresi dolan oyuncu", action, room.Code, player.Id, room.StateVersion);
    }
}
