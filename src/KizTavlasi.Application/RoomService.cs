using System.Collections.Concurrent;
using System.Collections.Immutable;
using System.Security.Cryptography;
using System.Text.Json;
using KizTavlasi.Application.Abstractions;
using KizTavlasi.Application.Dtos;
using KizTavlasi.Domain;
using KizTavlasi.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace KizTavlasi.Application;

/// <summary>Oda yaşam döngüsü: oluşturma, katılma, ayrılma, durum sorgulama.</summary>
public sealed class RoomService
{
    private const int MaxCodeGenerationAttempts = 5;

    /// <summary>
    /// Oyuncu başına aktif SignalR bağlantı kimliklerini takip eder.
    /// Çoklu sekme veya sayfa yenileme sırasında eski bağlantının kapanışı,
    /// hâlâ açık başka bir bağlantı varsa oyuncuyu çevrim dışı düşürmez.
    /// </summary>
    private static readonly ConcurrentDictionary<Guid, ImmutableHashSet<string>> ActiveConnections = new();

    private readonly IGameDbContext _db;
    private readonly IRoomCodeGenerator _codeGenerator;
    private readonly IPlayerTokenService _tokenService;
    private readonly IGameNotifier _notifier;
    private readonly TimeProvider _timeProvider;
    private readonly GameOptions _options;
    private readonly ILogger<RoomService> _logger;

    public RoomService(
        IGameDbContext db,
        IRoomCodeGenerator codeGenerator,
        IPlayerTokenService tokenService,
        IGameNotifier notifier,
        TimeProvider timeProvider,
        IOptions<GameOptions> options,
        ILogger<RoomService> logger)
    {
        _db = db;
        _codeGenerator = codeGenerator;
        _tokenService = tokenService;
        _notifier = notifier;
        _timeProvider = timeProvider;
        _options = options.Value;
        _logger = logger;
    }

    public Task<CreateRoomResult> CreateRoomAsync(CreateRoomRequest request, CancellationToken ct = default) =>
        CreateRoomCoreAsync(request.DisplayName, request.BestOf, request.TurnTimeLimitSeconds, botDifficulty: null, ct);

    /// <summary>
    /// Yapay zekâya karşı oda: misafir koltuğuna sunucu tarafında oynayan bir bot oturur.
    /// Bot için hiçbir zaman token üretilmez; oturum hash'i tahmin edilemez rastgele bir değerdir.
    /// </summary>
    public Task<CreateRoomResult> CreateBotRoomAsync(CreateBotRoomRequest request, CancellationToken ct = default)
    {
        if (!CreateBotRoomRequestValidator.TryParseDifficulty(request.Difficulty, out var difficulty))
        {
            throw new GameDomainException(DomainErrorCodes.InvalidCommand, "Geçersiz zorluk seviyesi.");
        }
        return CreateRoomCoreAsync(request.DisplayName, request.BestOf, request.TurnTimeLimitSeconds, difficulty, ct);
    }

    private async Task<CreateRoomResult> CreateRoomCoreAsync(
        string rawDisplayName,
        int bestOf,
        int? turnTimeLimitSeconds,
        BotDifficulty? botDifficulty,
        CancellationToken ct)
    {
        var displayName = DisplayNameSanitizer.Sanitize(rawDisplayName);
        GameEngine.RequiredWinsFor(bestOf);
        var timeLimit = turnTimeLimitSeconds is > 0 ? turnTimeLimitSeconds : null;
        if (timeLimit is not null && !GameConstants.SupportedTurnTimeLimits.Contains(timeLimit.Value))
        {
            throw new GameDomainException(DomainErrorCodes.InvalidCommand, "Geçersiz hamle süresi.");
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;

        for (var attempt = 1; attempt <= MaxCodeGenerationAttempts; attempt++)
        {
            var code = _codeGenerator.Generate();
            var roomId = Guid.CreateVersion7();
            var playerId = Guid.CreateVersion7();
            var token = _tokenService.CreateToken(playerId, roomId, code, GameConstants.HostSeat);

            var room = new GameRoom
            {
                Id = roomId,
                Code = code,
                Status = botDifficulty is null ? RoomStatus.Waiting : RoomStatus.InLobby,
                BestOf = bestOf,
                TurnTimeLimitSeconds = timeLimit,
                HostPlayerId = playerId,
                CreatedAtUtc = now,
                ExpiresAtUtc = now.AddHours(_options.RoomExpirationHours),
                StateVersion = 1
            };

            var player = new Player
            {
                Id = playerId,
                RoomId = roomId,
                DisplayName = displayName,
                Seat = GameConstants.HostSeat,
                SessionId = token.SessionId,
                SessionTokenHash = token.SessionTokenHash,
                IsConnected = false,
                JoinedAtUtc = now,
                LastSeenAtUtc = now
            };

            room.Players.Add(player);
            if (botDifficulty is BotDifficulty difficulty)
            {
                room.Players.Add(new Player
                {
                    Id = Guid.CreateVersion7(),
                    RoomId = roomId,
                    DisplayName = GameConstants.BotDisplayName(difficulty),
                    Seat = GameConstants.GuestSeat,
                    SessionId = Guid.CreateVersion7(),
                    SessionTokenHash = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)),
                    IsConnected = true,
                    JoinedAtUtc = now,
                    LastSeenAtUtc = now,
                    BotDifficulty = difficulty
                });
            }
            _db.GameRooms.Add(room);
            AddEvent(room.Id, null, null, 1, "RoomCreated",
                new { room.Code, room.BestOf, playerId, room.TurnTimeLimitSeconds, BotDifficulty = botDifficulty?.ToString() }, now);

            try
            {
                await _db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException) when (attempt < MaxCodeGenerationAttempts)
            {
                // Oda kodu çakışması (unique index) — yeni kodla tekrar dene.
                _db.ClearChangeTracker();
                _logger.LogWarning("Oda kodu çakışması, yeniden deneniyor. Deneme: {Attempt}", attempt);
                continue;
            }

            _logger.LogInformation("Oda oluşturuldu. RoomId: {RoomId}, RoomCode: {RoomCode}, PlayerId: {PlayerId}", roomId, code, playerId);

            var snapshot = SnapshotMapper.ToSnapshot(room, null, null, now);
            var playerDto = new PlayerDto(playerId, displayName, GameConstants.HostSeat, false, true);
            return new CreateRoomResult(code, $"/oda/{code}", token.Token, playerDto, snapshot);
        }

        throw new GameDomainException(DomainErrorCodes.InvalidCommand, "Oda kodu üretilemedi, lütfen tekrar deneyin.");
    }

    public async Task<JoinRoomResult> JoinRoomAsync(string roomCode, JoinRoomRequest request, CancellationToken ct = default)
    {
        var displayName = DisplayNameSanitizer.Sanitize(request.DisplayName);
        var normalizedCode = NormalizeCode(roomCode);
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        var txResult = await _db.ExecuteInTransactionAsync(async innerCt =>
        {
            var room = await _db.GameRooms
                .Include(r => r.Players)
                .FirstOrDefaultAsync(r => r.Code == normalizedCode, innerCt)
                ?? throw new GameDomainException(DomainErrorCodes.RoomNotFound, "Oda bulunamadı.");

            EnsureNotExpired(room, now);

            if (room.Players.Count >= 2)
            {
                throw new GameDomainException(DomainErrorCodes.RoomFull, "Oda dolu; en fazla iki oyuncu katılabilir.");
            }

            var playerId = Guid.CreateVersion7();
            var token = _tokenService.CreateToken(playerId, room.Id, room.Code, GameConstants.GuestSeat);

            var player = new Player
            {
                Id = playerId,
                RoomId = room.Id,
                DisplayName = displayName,
                Seat = GameConstants.GuestSeat,
                SessionId = token.SessionId,
                SessionTokenHash = token.SessionTokenHash,
                IsConnected = false,
                JoinedAtUtc = now,
                LastSeenAtUtc = now
            };

            room.Players.Add(player);
            room.Status = RoomStatus.InLobby;
            room.StateVersion++;
            AddEvent(room.Id, null, null, room.StateVersion, "PlayerJoined", new { playerId, displayName }, now);

            await _db.SaveChangesAsync(innerCt);

            _logger.LogInformation("Oyuncu odaya katıldı. RoomCode: {RoomCode}, PlayerId: {PlayerId}", room.Code, playerId);

            var snapshot = SnapshotMapper.ToSnapshot(room, null, null, now);
            var playerDto = new PlayerDto(playerId, displayName, GameConstants.GuestSeat, false, false);

            return new JoinRoomResult(room.Code, token.Token, playerDto, snapshot);
        }, ct);

        await SafeNotifyAsync(
            c => _notifier.PlayerJoinedAsync(txResult.RoomCode, txResult.Player, txResult.RoomState, c),
            txResult.RoomCode,
            "PlayerJoined",
            ct);

        return txResult;
    }

    /// <summary>Odaya katılmadan önce görülen genel bilgi (auth gerektirmez).</summary>
    public async Task<RoomSnapshotDto> GetPublicRoomInfoAsync(string roomCode, CancellationToken ct = default)
    {
        var normalizedCode = NormalizeCode(roomCode);
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        var room = await _db.GameRooms
            .AsNoTracking()
            .Include(r => r.Players)
            .FirstOrDefaultAsync(r => r.Code == normalizedCode, ct)
            ?? throw new GameDomainException(DomainErrorCodes.RoomNotFound, "Oda bulunamadı.");

        EnsureNotExpired(room, now);

        return SnapshotMapper.ToSnapshot(room, null, null, now);
    }

    /// <summary>Oturum sahibi oyuncu için tam authoritative snapshot.</summary>
    public async Task<RoomSnapshotDto> GetRoomStateAsync(PlayerSession session, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var (room, match, round) = await LoadRoomGraphAsync(session, tracking: false, ct);
        EnsureNotExpired(room, now);
        return SnapshotMapper.ToSnapshot(room, match, round, now);
    }

    /// <summary>
    /// İzleyici girişi: salt okunur izleyici token'ı üretir. İzleyiciler veritabanına yazılmaz;
    /// token yalnızca bu odanın snapshot'larını almaya yetkilidir, komut gönderemez.
    /// </summary>
    public async Task<WatchRoomResult> WatchRoomAsync(string roomCode, CancellationToken ct = default)
    {
        var normalizedCode = NormalizeCode(roomCode);
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        var room = await _db.GameRooms
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Code == normalizedCode, ct)
            ?? throw new GameDomainException(DomainErrorCodes.RoomNotFound, "Oda bulunamadı.");

        EnsureNotExpired(room, now);

        var token = _tokenService.CreateSpectatorToken(room.Id, room.Code);
        var snapshot = await GetSpectatorStateAsync(room.Id, ct);
        _logger.LogInformation("İzleyici token'ı üretildi. RoomCode: {RoomCode}", room.Code);
        return new WatchRoomResult(room.Code, token, snapshot);
    }

    /// <summary>İzleyici için authoritative snapshot (oyuncu oturumu gerektirmez).</summary>
    public async Task<RoomSnapshotDto> GetSpectatorStateAsync(Guid roomId, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var (room, match, round) = await LoadRoomGraphAsync(roomId, tracking: false, ct);
        EnsureNotExpired(room, now);
        return SnapshotMapper.ToSnapshot(room, match, round, now);
    }

    public async Task LeaveRoomAsync(PlayerSession session, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        ActiveConnections.TryRemove(session.PlayerId, out _);

        var txResult = await _db.ExecuteInTransactionAsync(async innerCt =>
        {
            var (room, match, round) = await LoadRoomGraphAsync(session, tracking: true, innerCt);
            var player = GetValidatedPlayer(room, session);

            room.Players.Remove(player);
            _db.Players.Remove(player);
            room.StateVersion++;

            MatchEndedDto? forfeitMatchEnded = null;

            if (room.Players.Count == 0 || room.Players.All(p => p.IsBot))
            {
                // Yalnızca bot kaldıysa oda kapanır; bota hükmen galibiyet verilmez.
                room.Status = RoomStatus.Abandoned;
                room.CompletedAtUtc = now;
                if (match is not null && match.Status != MatchStatus.Completed)
                {
                    match.Status = MatchStatus.Completed;
                    match.CompletedAtUtc = now;
                    match.StateVersion = room.StateVersion;
                }
                if (round is not null && round.Status == RoundStatus.InProgress)
                {
                    round.Status = RoundStatus.Completed;
                    round.CurrentPlayerId = null;
                    round.PendingDice = string.Empty;
                    round.PendingBonusPicks = 0;
                    round.TurnDeadlineUtc = null;
                    round.CompletedAtUtc = now;
                    round.StateVersion = room.StateVersion;
                }
            }
            else if (room.Status is RoomStatus.Playing)
            {
                // Aktif maçta rakip ayrılırsa kalan oyuncu kazanır ve oda tamamlanır.
                var remaining = room.Players[0];
                if (match is not null)
                {
                    if (remaining.Seat == 1 && match.Player1Score < match.RequiredWins)
                    {
                        match.Player1Score = match.RequiredWins;
                    }
                    else if (remaining.Seat == 2 && match.Player2Score < match.RequiredWins)
                    {
                        match.Player2Score = match.RequiredWins;
                    }

                    match.Status = MatchStatus.Completed;
                    match.WinnerPlayerId = remaining.Id;
                    match.CompletedAtUtc = now;
                    match.StateVersion = room.StateVersion;
                    forfeitMatchEnded = new MatchEndedDto(remaining.Id, match.Player1Score, match.Player2Score, IsMars: false);
                }
                if (round is not null && round.Status == RoundStatus.InProgress)
                {
                    round.Status = RoundStatus.Completed;
                    round.WinnerPlayerId = remaining.Id;
                    round.CurrentPlayerId = null;
                    round.PendingDice = string.Empty;
                    round.PendingBonusPicks = 0;
                    round.TurnDeadlineUtc = null;
                    round.CompletedAtUtc = now;
                    round.StateVersion = room.StateVersion;
                }
                room.Status = RoomStatus.Completed;
                room.CompletedAtUtc = now;
                if (room.HostPlayerId == player.Id)
                {
                    room.HostPlayerId = remaining.Id;
                }
            }
            else
            {
                room.Status = RoomStatus.Waiting;
                room.RematchRequestedByPlayerId = null;
                if (room.HostPlayerId == player.Id)
                {
                    room.HostPlayerId = room.Players[0].Id;
                }
            }

            AddEvent(room.Id, match?.Id, round?.Id, room.StateVersion, "PlayerLeft", new { session.PlayerId }, now);
            await _db.SaveChangesAsync(innerCt);

            _logger.LogInformation("Oyuncu odadan ayrıldı. RoomCode: {RoomCode}, PlayerId: {PlayerId}", room.Code, session.PlayerId);

            RoomSnapshotDto? snapshot = null;
            if (room.Players.Any(p => !p.IsBot))
            {
                // Ayrılan oyuncunun tahta durumunu referans hatası olmadan map'leyebilmek için
                // tamamlanan round bilgisini güvenli şekilde snapshot'a dönüştür.
                snapshot = SnapshotMapper.ToSnapshot(room, match, round, now);
            }

            return (RoomCode: room.Code, Snapshot: snapshot, ForfeitMatchEnded: forfeitMatchEnded);
        }, ct);

        if (txResult.Snapshot is not null)
        {
            await SafeNotifyAsync(
                async c =>
                {
                    await _notifier.PlayerLeftAsync(txResult.RoomCode, session.PlayerId, txResult.Snapshot, c);
                    if (txResult.ForfeitMatchEnded is not null)
                    {
                        await _notifier.MatchEndedAsync(txResult.RoomCode, txResult.ForfeitMatchEnded, txResult.Snapshot, c);
                    }
                },
                txResult.RoomCode,
                "PlayerLeft",
                ct);
        }
    }

    /// <summary>SignalR bağlantı/kopma bildirimi. Çoklu sekme/bağlantı durumunu güvenli yönetir.</summary>
    public async Task SetConnectionStateAsync(
        PlayerSession session,
        bool isConnected,
        CancellationToken ct = default,
        string? connectionId = null)
    {
        var effectiveConnected = isConnected;

        if (!string.IsNullOrWhiteSpace(connectionId))
        {
            if (isConnected)
            {
                ActiveConnections.AddOrUpdate(
                    session.PlayerId,
                    _ => [connectionId],
                    (_, existing) => existing.Add(connectionId));
                effectiveConnected = true;
            }
            else
            {
                if (ActiveConnections.TryGetValue(session.PlayerId, out var existing))
                {
                    var updated = existing.Remove(connectionId);
                    if (updated.IsEmpty)
                    {
                        ActiveConnections.TryRemove(session.PlayerId, out _);
                        effectiveConnected = false;
                    }
                    else
                    {
                        ActiveConnections[session.PlayerId] = updated;
                        // Oyuncunun başka bir sekmesi/bağlantısı hâlâ açık; çevrim dışı yapma.
                        return;
                    }
                }
            }
        }
        else if (!isConnected)
        {
            ActiveConnections.TryRemove(session.PlayerId, out _);
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;

        var player = await _db.Players
            .Include(p => p.Room)
            .FirstOrDefaultAsync(p => p.Id == session.PlayerId && p.RoomId == session.RoomId, ct);

        if (player is null)
        {
            return;
        }

        player.IsConnected = effectiveConnected;
        player.LastSeenAtUtc = now;
        player.DisconnectedAtUtc = effectiveConnected ? null : now;
        await _db.SaveChangesAsync(ct);

        var (room, match, round) = await LoadRoomGraphAsync(session, tracking: false, ct);
        var snapshot = SnapshotMapper.ToSnapshot(room, match, round, now);

        await SafeNotifyAsync(
            c => _notifier.PlayerConnectionChangedAsync(session.RoomCode, session.PlayerId, effectiveConnected, snapshot, c),
            session.RoomCode,
            "PlayerConnectionChanged",
            ct);
    }

    /// <summary>Oturumu doğrular; oda/oyuncu eşleşmezse veya token hash tutmazsa reddeder.</summary>
    public async Task ValidateSessionAsync(PlayerSession session, CancellationToken ct = default)
    {
        var player = await _db.Players
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == session.PlayerId && p.RoomId == session.RoomId, ct)
            ?? throw new GameDomainException(DomainErrorCodes.PlayerNotInRoom, "Oyuncu bu odada bulunamadı.");

        var expectedHash = _tokenService.HashTokenId(session.Jti);
        if (player.SessionTokenHash != expectedHash || player.SessionId != session.SessionId)
        {
            throw new GameDomainException(DomainErrorCodes.InvalidSession, "Oturum geçersiz.");
        }
    }

    internal Task<(GameRoom Room, Match? Match, Round? Round)> LoadRoomGraphAsync(
        PlayerSession session, bool tracking, CancellationToken ct) =>
        LoadRoomGraphAsync(session.RoomId, tracking, ct);

    internal async Task<(GameRoom Room, Match? Match, Round? Round)> LoadRoomGraphAsync(
        Guid roomId, bool tracking, CancellationToken ct)
    {
        var query = _db.GameRooms.AsQueryable();
        if (!tracking)
        {
            query = query.AsNoTracking();
        }

        var room = await query
            .Include(r => r.Players)
            .FirstOrDefaultAsync(r => r.Id == roomId, ct)
            ?? throw new GameDomainException(DomainErrorCodes.RoomNotFound, "Oda bulunamadı.");

        Match? match = null;
        Round? round = null;

        if (room.CurrentMatchId is not null)
        {
            var matchQuery = _db.Matches.AsQueryable();
            if (!tracking)
            {
                matchQuery = matchQuery.AsNoTracking();
            }
            match = await matchQuery.FirstOrDefaultAsync(m => m.Id == room.CurrentMatchId, ct);

            if (match?.CurrentRoundId is not null)
            {
                var roundQuery = _db.Rounds.AsQueryable();
                if (!tracking)
                {
                    roundQuery = roundQuery.AsNoTracking();
                }
                round = await roundQuery
                    .Include(r => r.PlayerStates)
                    .ThenInclude(s => s.PointStates)
                    .FirstOrDefaultAsync(r => r.Id == match.CurrentRoundId, ct);
            }
        }

        return (room, match, round);
    }

    internal static Player GetValidatedPlayer(GameRoom room, PlayerSession session)
    {
        return room.Players.FirstOrDefault(p => p.Id == session.PlayerId)
            ?? throw new GameDomainException(DomainErrorCodes.PlayerNotInRoom, "Oyuncu bu odada bulunamadı.");
    }

    internal static void EnsureNotExpired(GameRoom room, DateTime now)
    {
        if (room.Status is RoomStatus.Expired or RoomStatus.Abandoned
            || (room.Status is RoomStatus.Waiting or RoomStatus.InLobby && room.ExpiresAtUtc < now))
        {
            throw new GameDomainException(DomainErrorCodes.RoomExpired, "Odanın süresi doldu.");
        }
    }

    internal void AddEvent(Guid roomId, Guid? matchId, Guid? roundId, long sequence, string eventType, object payload, DateTime now)
    {
        _db.GameEvents.Add(new GameEvent
        {
            RoomId = roomId,
            MatchId = matchId,
            RoundId = roundId,
            SequenceNumber = sequence,
            EventType = eventType,
            PayloadJson = JsonSerializer.Serialize(payload),
            OccurredAtUtc = now
        });
    }

    internal async Task SafeNotifyAsync(
        Func<CancellationToken, Task> notifyAction,
        string roomCode,
        string eventName,
        CancellationToken ct)
    {
        try
        {
            await notifyAction(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(
                ex,
                "SignalR yayını sırasında hata oluştu (veritabanı işlemi korundu). RoomCode: {RoomCode}, Event: {EventName}",
                roomCode,
                eventName);
        }
    }

    internal static string NormalizeCode(string roomCode) => roomCode.Trim().ToUpperInvariant();
}
