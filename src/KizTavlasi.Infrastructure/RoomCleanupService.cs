using KizTavlasi.Application;
using KizTavlasi.Application.Abstractions;
using KizTavlasi.Application.Dtos;
using KizTavlasi.Domain;
using KizTavlasi.Domain.Entities;
using KizTavlasi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace KizTavlasi.Infrastructure;

/// <summary>
/// Süresi dolan bekleyen odaları işaretler, terk edilmiş aktif (Playing) odaları
/// sonlandırır ve tamamlanmış eski odaları siler.
/// Gerçekten bağlı oyuncuları olan aktif maçlara dokunmaz.
/// </summary>
public sealed class RoomCleanupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeProvider _timeProvider;
    private readonly GameOptions _options;
    private readonly ILogger<RoomCleanupService> _logger;

    public RoomCleanupService(
        IServiceScopeFactory scopeFactory,
        TimeProvider timeProvider,
        IOptions<GameOptions> options,
        ILogger<RoomCleanupService> logger)
    {
        _scopeFactory = scopeFactory;
        _timeProvider = timeProvider;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(_options.CleanupIntervalMinutes);
        using var timer = new PeriodicTimer(interval, _timeProvider);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CleanupAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Oda temizleme sırasında hata oluştu.");
            }

            if (!await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
            {
                break;
            }
        }
    }

    public async Task CleanupAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var notifier = scope.ServiceProvider.GetService<IGameNotifier>();
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        // 1. Bekleyen/lobide kalan ve süresi dolan odalar sona erdirilir.
        var expired = await db.GameRooms
            .Where(r => (r.Status == RoomStatus.Waiting || r.Status == RoomStatus.InLobby) && r.ExpiresAtUtc < now)
            .ExecuteUpdateAsync(s => s
                .SetProperty(r => r.Status, RoomStatus.Expired)
                .SetProperty(r => r.CompletedAtUtc, now), ct);

        // 2. Aktif (Playing) ancak oyuncuların bağlantısı kopmuş ve grace süresini aşmış odaları değerlendir.
        var graceCutoff = now.AddMinutes(-_options.DisconnectedPlayerGraceMinutes);
        var candidatePlayingRooms = await db.GameRooms
            .Include(r => r.Players)
            .Where(r => r.Status == RoomStatus.Playing
                        && (r.ExpiresAtUtc < now || r.Players.Any(p => !p.IsConnected)))
            .ToListAsync(ct);

        var abandonedPlaying = 0;
        var forfeitedPlaying = 0;
        var pendingForfeitNotifications = new List<(string RoomCode, MatchEndedDto MatchEnded, RoomSnapshotDto Snapshot)>();

        foreach (var room in candidatePlayingRooms)
        {
            bool IsPlayerTimedOut(Player p) =>
                !p.IsConnected && (p.DisconnectedAtUtc ?? p.LastSeenAtUtc) <= graceCutoff;

            if (room.Players.Any(p => p.IsBot))
            {
                // Bot odası: bot her zaman "bağlı"dır; insan oyuncu dönmezse bota galibiyet
                // verilmez, oda sahipsiz olarak kapanır.
                var humans = room.Players.Where(p => !p.IsBot).ToList();
                if (humans.All(IsPlayerTimedOut) || (room.ExpiresAtUtc < now && humans.All(p => !p.IsConnected)))
                {
                    await TerminateMatchAndRoundAsync(db, room, winner: null, now, ct);
                    room.Status = RoomStatus.Abandoned;
                    room.CompletedAtUtc = now;
                    room.StateVersion++;
                    abandonedPlaying++;
                }
                continue;
            }

            var connectedPlayers = room.Players.Where(p => p.IsConnected).ToList();
            var timedOutPlayers = room.Players.Where(IsPlayerTimedOut).ToList();

            var allTimedOutOrExpiredOffline =
                room.Players.Count == 0
                || timedOutPlayers.Count == room.Players.Count
                || (room.ExpiresAtUtc < now && connectedPlayers.Count == 0);

            if (allTimedOutOrExpiredOffline)
            {
                await TerminateMatchAndRoundAsync(db, room, winner: null, now, ct);
                room.Status = RoomStatus.Abandoned;
                room.CompletedAtUtc = now;
                room.StateVersion++;
                abandonedPlaying++;
            }
            else if (connectedPlayers.Count == 1 && timedOutPlayers.Count == 1)
            {
                // Bir oyuncu grace süresi boyunca dönmedi, diğeri hâlâ bağlı: bağlı oyuncu hükmen kazanır.
                var winner = connectedPlayers[0];
                room.StateVersion++;
                var (match, round, matchEnded) = await TerminateMatchAndRoundAsync(db, room, winner, now, ct);
                room.Status = RoomStatus.Completed;
                room.CompletedAtUtc = now;
                forfeitedPlaying++;

                if (matchEnded is not null)
                {
                    var snapshot = SnapshotMapper.ToSnapshot(room, match, round, now);
                    pendingForfeitNotifications.Add((room.Code, matchEnded, snapshot));
                }
            }
        }

        if (abandonedPlaying > 0 || forfeitedPlaying > 0)
        {
            await db.SaveChangesAsync(ct);
        }

        if (notifier is not null && pendingForfeitNotifications.Count > 0)
        {
            foreach (var item in pendingForfeitNotifications)
            {
                try
                {
                    await notifier.MatchEndedAsync(item.RoomCode, item.MatchEnded, item.Snapshot, ct);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogError(ex, "Hükmen bitiş bildirimi gönderilemedi. RoomCode: {RoomCode}", item.RoomCode);
                }
            }
        }

        // 3. Tamamlanan/terk edilen/süresi dolan odalar, oda ömrü kadar süre geçtikten sonra silinir.
        var deleteBefore = now.AddHours(-_options.RoomExpirationHours);
        var deleted = await db.GameRooms
            .Where(r => (r.Status == RoomStatus.Completed || r.Status == RoomStatus.Abandoned || r.Status == RoomStatus.Expired)
                        && r.CompletedAtUtc != null && r.CompletedAtUtc < deleteBefore)
            .ExecuteDeleteAsync(ct);

        if (expired > 0 || abandonedPlaying > 0 || forfeitedPlaying > 0 || deleted > 0)
        {
            _logger.LogInformation(
                "Oda temizliği: {Expired} oda sona erdirildi, {Abandoned} sahipsiz aktif oda kapatıldı, {Forfeited} maç hükmen tamamlandı, {Deleted} oda silindi.",
                expired, abandonedPlaying, forfeitedPlaying, deleted);
        }
    }

    private static async Task<(Match? Match, Round? Round, MatchEndedDto? MatchEnded)> TerminateMatchAndRoundAsync(
        GameDbContext db,
        GameRoom room,
        Player? winner,
        DateTime now,
        CancellationToken ct)
    {
        if (room.CurrentMatchId is null)
        {
            return (null, null, null);
        }

        var match = await db.Matches.FirstOrDefaultAsync(m => m.Id == room.CurrentMatchId, ct);
        Round? round = null;

        if (match?.CurrentRoundId is not null)
        {
            round = await db.Rounds
                .Include(r => r.PlayerStates)
                .ThenInclude(s => s.PointStates)
                .FirstOrDefaultAsync(r => r.Id == match.CurrentRoundId, ct);
        }

        MatchEndedDto? matchEnded = null;

        if (match is not null && match.Status != MatchStatus.Completed)
        {
            if (winner is not null)
            {
                if (winner.Seat == 1 && match.Player1Score < match.RequiredWins)
                {
                    match.Player1Score = match.RequiredWins;
                }
                else if (winner.Seat == 2 && match.Player2Score < match.RequiredWins)
                {
                    match.Player2Score = match.RequiredWins;
                }
                match.WinnerPlayerId = winner.Id;
                matchEnded = new MatchEndedDto(winner.Id, match.Player1Score, match.Player2Score, IsMars: false);
            }

            match.Status = MatchStatus.Completed;
            match.CompletedAtUtc = now;
            match.StateVersion = room.StateVersion;
        }

        if (round is not null && round.Status != RoundStatus.Completed)
        {
            round.Status = RoundStatus.Completed;
            round.WinnerPlayerId = winner?.Id;
            round.CurrentPlayerId = null;
            round.PendingDice = string.Empty;
            round.PendingBonusPicks = 0;
            round.TurnDeadlineUtc = null;
            round.CompletedAtUtc = now;
            round.StateVersion = room.StateVersion;
        }

        return (match, round, matchEnded);
    }
}
