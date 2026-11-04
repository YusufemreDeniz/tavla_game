using System.Text.Json;
using KizTavlasi.Application.Abstractions;
using KizTavlasi.Application.Dtos;
using KizTavlasi.Domain;
using KizTavlasi.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace KizTavlasi.Application;

/// <summary>
/// Maç orkestrasyonu: başlatma, zar atma, bonus pul seçimi, rövanş.
/// Tüm kural hesaplamaları <see cref="GameEngine"/> içinde; burada yalnızca
/// doğrulama, transaction ve post-commit yayın vardır.
/// </summary>
public sealed class GameService
{
    private const int MaxConcurrencyRetries = 3;

    private readonly IGameDbContext _db;
    private readonly RoomService _roomService;
    private readonly IDiceService _diceService;
    private readonly IGameNotifier _notifier;
    private readonly GameEngine _engine;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<GameService> _logger;
    private readonly ITurnAutomationScheduler _automation;
    private readonly GameOptions _options;

    public GameService(
        IGameDbContext db,
        RoomService roomService,
        IDiceService diceService,
        IGameNotifier notifier,
        GameEngine engine,
        TimeProvider timeProvider,
        ILogger<GameService> logger,
        ITurnAutomationScheduler? automation = null,
        IOptions<GameOptions>? options = null)
    {
        _db = db;
        _roomService = roomService;
        _diceService = diceService;
        _notifier = notifier;
        _engine = engine;
        _timeProvider = timeProvider;
        _logger = logger;
        _automation = automation ?? NullTurnAutomationScheduler.Instance;
        _options = options?.Value ?? new GameOptions();
    }

    /// <summary>Commit sonrası: aktif elin otomatik eylem zamanını (bot / süre) zamanlayıcıya bildirir.</summary>
    private void ScheduleAutomation(Guid roomId, RoomSnapshotDto snapshot)
    {
        _automation.Schedule(roomId, snapshot.Match?.CurrentRound?.TurnDeadlineUtc);
    }

    private sealed record MatchStartedEventPayload(
        Guid Id,
        Guid CommandId,
        Guid StartingPlayerId,
        int StartingSeat,
        List<StartingRollAttemptDto> Attempts);

    public async Task<StartMatchResult> StartMatchAsync(PlayerSession session, Guid commandId, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        var txResult = await ExecuteWithRetryAsync(async innerCt =>
        {
            var (room, existingMatch, existingRound) = await _roomService.LoadRoomGraphAsync(session, tracking: true, innerCt);
            var player = RoomService.GetValidatedPlayer(room, session);
            RoomService.EnsureNotExpired(room, now);

            if (room.HostPlayerId != session.PlayerId)
            {
                throw new GameDomainException(DomainErrorCodes.NotHost, "Maçı yalnızca oda sahibi başlatabilir.");
            }

            // Idempotency: aynı CommandId ile maç zaten başlatıldıysa kayıtlı sonucu döndür.
            if (commandId != Guid.Empty && existingMatch is not null)
            {
                var existingEvent = await _db.GameEvents
                    .AsNoTracking()
                    .Where(e => e.RoomId == room.Id && e.MatchId == existingMatch.Id && e.EventType == "MatchStarted")
                    .OrderByDescending(e => e.Id)
                    .FirstOrDefaultAsync(innerCt);

                if (existingEvent is not null)
                {
                    var payload = JsonSerializer.Deserialize<MatchStartedEventPayload>(existingEvent.PayloadJson);
                    if (payload is not null && payload.CommandId == commandId)
                    {
                        var replaySnapshot = SnapshotMapper.ToSnapshot(room, existingMatch, existingRound, now);
                        var replayRoll = new StartingRollDto(payload.Attempts, payload.StartingPlayerId, payload.StartingSeat);
                        return (Result: new StartMatchResult(replayRoll, replaySnapshot), RoomCode: room.Code, WasReplay: true);
                    }
                }
            }

            if (room.Players.Count != 2)
            {
                throw new GameDomainException(DomainErrorCodes.InvalidCommand, "Maç için iki oyuncu gereklidir.");
            }
            if (room.Status == RoomStatus.Playing || (existingMatch is not null && existingMatch.Status != MatchStatus.Completed))
            {
                throw new GameDomainException(DomainErrorCodes.MatchAlreadyStarted, "Maç zaten başladı.");
            }
            if (room.Status == RoomStatus.Completed)
            {
                throw new GameDomainException(DomainErrorCodes.RematchNotAvailable, "Bu odada yeni maç yalnızca rövanş ile başlatılabilir.");
            }

            player.LastSeenAtUtc = now;
            var result = await CreateMatchWithStartingRollAsync(room, commandId, now, innerCt);

            _logger.LogInformation(
                "Maç başlatıldı. RoomCode: {RoomCode}, MatchId: {MatchId}, StateVersion: {StateVersion}, CommandId: {CommandId}",
                room.Code, result.Snapshot.Match?.Id, room.StateVersion, commandId);

            return (Result: result, RoomCode: room.Code, WasReplay: false);
        }, ct);

        if (!txResult.WasReplay)
        {
            await _roomService.SafeNotifyAsync(
                async c =>
                {
                    await _notifier.StartingRollStartedAsync(txResult.RoomCode, now, c);
                    await _notifier.MatchStartedAsync(txResult.RoomCode, txResult.Result.Snapshot, c);
                    await _notifier.StartingRollResolvedAsync(txResult.RoomCode, txResult.Result.StartingRoll, txResult.Result.Snapshot, c);
                },
                txResult.RoomCode,
                "MatchStarted",
                ct);
            ScheduleAutomation(session.RoomId, txResult.Result.Snapshot);
        }

        return txResult.Result;
    }

    private async Task<StartMatchResult> CreateMatchWithStartingRollAsync(
        GameRoom room, Guid commandId, DateTime now, CancellationToken ct)
    {
        var matchNumber = await _db.Matches.CountAsync(m => m.RoomId == room.Id, ct) + 1;
        var players = room.Players.OrderBy(p => p.Seat).ToList();

        var startingRoll = _engine.ResolveStartingRoll(_diceService);
        var startingPlayer = players[startingRoll.StartingSeat - 1];

        var match = new Match
        {
            Id = Guid.CreateVersion7(),
            RoomId = room.Id,
            MatchNumber = matchNumber,
            BestOf = room.BestOf,
            RequiredWins = GameEngine.RequiredWinsFor(room.BestOf),
            Status = MatchStatus.InProgress,
            StartedAtUtc = now
        };

        var round = CreateRound(match.Id, 1, startingPlayer.Id, players, now);
        match.CurrentRoundId = round.Id;

        room.Status = RoomStatus.Playing;
        room.CurrentMatchId = match.Id;
        room.RematchRequestedByPlayerId = null;
        room.StateVersion++;
        match.StateVersion = room.StateVersion;
        round.StateVersion = room.StateVersion;
        round.TurnDeadlineUtc = TurnDeadlines.Compute(room, round, now, _options);

        _db.Matches.Add(match);
        _db.Rounds.Add(round);

        var attemptsDto = startingRoll.Attempts
            .Select(a => new StartingRollAttemptDto(a.Player1Die, a.Player2Die, a.IsTie))
            .ToList();

        var startingRollDto = new StartingRollDto(
            attemptsDto,
            startingPlayer.Id,
            startingRoll.StartingSeat);

        _roomService.AddEvent(
            room.Id,
            match.Id,
            round.Id,
            room.StateVersion,
            "MatchStarted",
            new MatchStartedEventPayload(match.Id, commandId, startingRollDto.StartingPlayerId, startingRollDto.StartingSeat, attemptsDto),
            now);

        await _db.SaveChangesAsync(ct);

        var snapshot = SnapshotMapper.ToSnapshot(room, match, round, now);
        return new StartMatchResult(startingRollDto, snapshot);
    }

    private static Round CreateRound(Guid matchId, int roundNumber, Guid startingPlayerId, IReadOnlyList<Player> players, DateTime now)
    {
        var round = new Round
        {
            Id = Guid.CreateVersion7(),
            MatchId = matchId,
            RoundNumber = roundNumber,
            Status = RoundStatus.InProgress,
            StartingPlayerId = startingPlayerId,
            CurrentPlayerId = startingPlayerId,
            TurnNumber = 1,
            StartedAtUtc = now
        };

        foreach (var player in players)
        {
            round.PlayerStates.Add(PlayerRoundState.CreateInitial(round.Id, player.Id));
        }

        return round;
    }

    public async Task<RollDiceResult> RollDiceAsync(
        PlayerSession session, Guid commandId, long expectedStateVersion, CancellationToken ct = default)
    {
        if (commandId == Guid.Empty)
        {
            throw new GameDomainException(DomainErrorCodes.InvalidCommand, "CommandId zorunludur.");
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;

        var txResult = await ExecuteWithRetryAsync(async innerCt =>
        {
            // Idempotency: aynı komut daha önce işlendiyse sahipliğini doğrula ve kayıtlı sonucu döndür.
            var existingRoll = await _db.DiceRolls
                .AsNoTracking()
                .Include(d => d.Round)
                .ThenInclude(r => r.Match)
                .FirstOrDefaultAsync(d => d.CommandId == commandId, innerCt);

            if (existingRoll is not null)
            {
                if (existingRoll.PlayerId != session.PlayerId || existingRoll.Round.Match.RoomId != session.RoomId)
                {
                    throw new GameDomainException(
                        DomainErrorCodes.InvalidCommand,
                        "Bu komut kimliği başka bir oyuncu veya odaya ait.");
                }

                var (roomForReplay, matchForReplay, roundForReplay) =
                    await _roomService.LoadRoomGraphAsync(session, tracking: false, innerCt);
                var replaySnapshot = SnapshotMapper.ToSnapshot(roomForReplay, matchForReplay, roundForReplay, now);
                var storedResult = JsonSerializer.Deserialize<DiceRollResultDto>(existingRoll.ResolutionJson)
                    ?? throw new GameDomainException(DomainErrorCodes.InvalidCommand, "Kayıtlı zar sonucu okunamadı.");

                return (
                    Result: new RollDiceResult(storedResult, replaySnapshot, WasAlreadyProcessed: true),
                    RoomCode: roomForReplay.Code,
                    OpponentId: Guid.Empty,
                    TurnNumber: 0);
            }

            var (room, match, round) = await _roomService.LoadRoomGraphAsync(session, tracking: true, innerCt);
            var player = RoomService.GetValidatedPlayer(room, session);

            ValidateActiveTurn(room, match, round, player, expectedStateVersion);

            if (round!.PendingBonusPicks > 0 || !string.IsNullOrEmpty(round.PendingDice))
            {
                throw new GameDomainException(
                    DomainErrorCodes.InvalidCommand,
                    "Önce mevcut hamlelerinizi oynamalısınız.");
            }

            player.LastSeenAtUtc = now;
            var playerState = round.PlayerStates.First(s => s.PlayerId == player.Id);
            var board = playerState.ToBoard();

            var dice = _diceService.Roll();
            var outcome = _engine.ResolveRoll(board, dice);

            var opponent = room.Players.First(p => p.Id != player.Id);
            var turnNumber = round.TurnNumber;
            round.TurnNumber++;
            room.StateVersion++;
            round.StateVersion = room.StateVersion;
            match!.StateVersion = room.StateVersion;

            if (outcome.TurnWasted)
            {
                round.CurrentPlayerId = opponent.Id;
            }
            else
            {
                // Hamleleri oyuncu haneye dokunarak yapar; sıra onda kalır.
                round.PendingDice = string.Join(',', outcome.PlayableDice);
                round.PendingBonusPicks = outcome.FreePicksGranted;
            }
            round.TurnDeadlineUtc = TurnDeadlines.Compute(room, round, now, _options);

            var rollResult = new DiceRollResultDto(
                player.Id,
                dice.Die1,
                dice.Die2,
                dice.IsDouble,
                outcome.WastedSteps.Select(s => s.ToDto()).ToList(),
                outcome.PlayableDice.ToList(),
                outcome.FreePicksGranted,
                outcome.TurnWasted,
                room.StateVersion);

            _db.DiceRolls.Add(new DiceRoll
            {
                Id = Guid.CreateVersion7(),
                RoundId = round.Id,
                PlayerId = player.Id,
                TurnNumber = turnNumber,
                Die1 = dice.Die1,
                Die2 = dice.Die2,
                IsDouble = dice.IsDouble,
                CommandId = commandId,
                ResolutionJson = JsonSerializer.Serialize(rollResult),
                CreatedAtUtc = now
            });

            _roomService.AddEvent(room.Id, match.Id, round.Id, room.StateVersion, "DiceRolled",
                new { player.Id, dice.Die1, dice.Die2, dice.IsDouble, turnNumber, outcome.FreePicksGranted, outcome.TurnWasted }, now);

            await _db.SaveChangesAsync(innerCt);

            _logger.LogInformation(
                "Zar atıldı. RoomCode: {RoomCode}, PlayerId: {PlayerId}, Dice: {Die1}-{Die2}, StateVersion: {StateVersion}, CommandId: {CommandId}",
                room.Code, player.Id, dice.Die1, dice.Die2, room.StateVersion, commandId);

            var (freshRoom, freshMatch, freshRound) = await _roomService.LoadRoomGraphAsync(session, tracking: false, innerCt);
            var snapshot = SnapshotMapper.ToSnapshot(freshRoom, freshMatch, freshRound, now);

            return (
                Result: new RollDiceResult(rollResult, snapshot, WasAlreadyProcessed: false),
                RoomCode: room.Code,
                OpponentId: opponent.Id,
                TurnNumber: round.TurnNumber);
        }, ct);

        if (!txResult.Result.WasAlreadyProcessed)
        {
            await _roomService.SafeNotifyAsync(
                async c =>
                {
                    await _notifier.DiceRollStartedAsync(txResult.RoomCode, session.PlayerId, now, c);
                    await _notifier.DiceRollResolvedAsync(txResult.RoomCode, txResult.Result.Roll, txResult.Result.Snapshot, c);

                    if (txResult.Result.Roll.TurnWasted)
                    {
                        await _notifier.TurnStartedAsync(txResult.RoomCode, txResult.OpponentId, txResult.TurnNumber, txResult.Result.Snapshot, c);
                    }
                },
                txResult.RoomCode,
                "DiceRollResolved",
                ct);
            ScheduleAutomation(session.RoomId, txResult.Result.Snapshot);
        }

        return txResult.Result;
    }

    /// <summary>
    /// Oyuncunun haneye dokunarak yaptığı hamle: zar hamlesi veya çift bonusu hakkı.
    /// </summary>
    public async Task<RoomSnapshotDto> PlayMoveAsync(
        PlayerSession session,
        int pointNumber,
        long expectedStateVersion,
        CancellationToken ct = default,
        Guid? commandId = null)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        var txResult = await ExecuteWithRetryAsync(async innerCt =>
        {
            if (commandId is Guid cid && cid != Guid.Empty)
            {
                var recentMoves = await _db.GameEvents
                    .AsNoTracking()
                    .Where(e => e.EventType == "MovePlayed" && e.PayloadJson.Contains(cid.ToString()))
                    .OrderByDescending(e => e.Id)
                    .Take(5)
                    .ToListAsync(innerCt);

                foreach (var evt in recentMoves)
                {
                    var payload = JsonSerializer.Deserialize<MovePlayedEventPayload>(evt.PayloadJson);
                    if (payload?.CommandId == cid)
                    {
                        if (evt.RoomId != session.RoomId || payload.PlayerId != session.PlayerId)
                        {
                            throw new GameDomainException(
                                DomainErrorCodes.InvalidCommand,
                                "Bu komut kimliği başka bir oyuncu veya odaya ait.");
                        }

                        var (replayRoom, replayMatch, replayRound) =
                            await _roomService.LoadRoomGraphAsync(session, tracking: false, innerCt);
                        var replaySnapshot = SnapshotMapper.ToSnapshot(replayRoom, replayMatch, replayRound, now);
                        return (
                            Snapshot: replaySnapshot,
                            RoomCode: replayRoom.Code,
                            MovePlayed: (MovePlayedDto?)null,
                            RoundEnded: (RoundEndedDto?)null,
                            MatchEnded: (MatchEndedDto?)null,
                            NextTurnPlayerId: (Guid?)null,
                            NextTurnNumber: 0);
                    }
                }
            }

            var (room, match, round) = await _roomService.LoadRoomGraphAsync(session, tracking: true, innerCt);
            var player = RoomService.GetValidatedPlayer(room, session);

            ValidateActiveTurn(room, match, round, player, expectedStateVersion);

            var pendingDice = string.IsNullOrEmpty(round!.PendingDice)
                ? new List<int>()
                : round.PendingDice.Split(',').Select(int.Parse).ToList();

            var usedBonusPick = false;
            if (pendingDice.Contains(pointNumber))
            {
                pendingDice.Remove(pointNumber);
            }
            else if (pendingDice.Count > 0)
            {
                throw new GameDomainException(
                    DomainErrorCodes.InvalidCommand,
                    $"Önce zarını oynamalısın: {string.Join(" ve ", pendingDice)}.");
            }
            else if (round.PendingBonusPicks > 0)
            {
                usedBonusPick = true;
            }
            else
            {
                throw new GameDomainException(DomainErrorCodes.InvalidCommand, "Oynanacak hamlen yok; zar at.");
            }

            player.LastSeenAtUtc = now;
            var playerState = round.PlayerStates.First(s => s.PlayerId == player.Id);
            var board = playerState.ToBoard();
            var wasCollecting = board.IsCollecting;

            var step = _engine.PlayMove(board, pointNumber);
            playerState.ApplyBoard(board);

            if (usedBonusPick)
            {
                round.PendingBonusPicks--;
            }

            // Kalan zarlardan artık oynanamayanlar boşa gider.
            var wastedDice = new List<int>();
            if (!board.IsCompleted)
            {
                foreach (var die in pendingDice.Where(d => !GameEngine.CanPlay(board, d)).ToList())
                {
                    pendingDice.Remove(die);
                    wastedDice.Add(die);
                }
                if (round.PendingBonusPicks > 0 && !GameEngine.AnyMoveAvailable(board))
                {
                    round.PendingBonusPicks = 0;
                }
            }

            round.PendingDice = string.Join(',', pendingDice);
            room.StateVersion++;
            round.StateVersion = room.StateVersion;
            match!.StateVersion = room.StateVersion;

            var opponent = room.Players.First(p => p.Id != player.Id);
            RoundEndedDto? roundEnded = null;
            MatchEndedDto? matchEnded = null;

            if (board.IsCompleted)
            {
                round.PendingDice = string.Empty;
                round.PendingBonusPicks = 0;
                (roundEnded, matchEnded) = CompleteRound(room, match, round, player, now);
            }
            else if (pendingDice.Count == 0 && round.PendingBonusPicks == 0)
            {
                round.CurrentPlayerId = opponent.Id;
            }
            round.TurnDeadlineUtc = TurnDeadlines.Compute(room, round, now, _options);

            var movePlayed = new MovePlayedDto(
                player.Id,
                pointNumber,
                step.Action.ToString(),
                pendingDice,
                round.PendingBonusPicks,
                wastedDice,
                board.IsCompleted,
                room.StateVersion);

            _roomService.AddEvent(
                room.Id,
                match.Id,
                round.Id,
                room.StateVersion,
                "MovePlayed",
                new MovePlayedEventPayload(
                    player.Id,
                    commandId,
                    pointNumber,
                    step.Action.ToString(),
                    round.PendingDice,
                    round.PendingBonusPicks,
                    WastedDiceCount: wastedDice.Count,
                    BringDownCompleted: !wasCollecting && board.IsCollecting,
                    // Zar atışı TurnNumber'ı artırır; hamle, bir önceki tur numarasındaki atışa aittir.
                    RollTurnNumber: Math.Max(0, round.TurnNumber - 1)),
                now);

            await _db.SaveChangesAsync(innerCt);

            var (freshRoom, freshMatch, freshRound) = await _roomService.LoadRoomGraphAsync(session, tracking: false, innerCt);
            var snapshot = SnapshotMapper.ToSnapshot(freshRoom, freshMatch, freshRound, now);

            Guid? nextTurnPlayerId = null;
            var nextTurnNumber = 0;
            if (roundEnded is null && matchEnded is null && pendingDice.Count == 0 && round.PendingBonusPicks == 0)
            {
                nextTurnPlayerId = opponent.Id;
                nextTurnNumber = round.TurnNumber;
            }
            else if (roundEnded is not null && matchEnded is null && freshRound?.CurrentPlayerId is not null)
            {
                nextTurnPlayerId = freshRound.CurrentPlayerId.Value;
                nextTurnNumber = freshRound.TurnNumber;
            }

            return (
                Snapshot: snapshot,
                RoomCode: room.Code,
                MovePlayed: (MovePlayedDto?)movePlayed,
                RoundEnded: roundEnded,
                MatchEnded: matchEnded,
                NextTurnPlayerId: nextTurnPlayerId,
                NextTurnNumber: nextTurnNumber);
        }, ct);

        if (txResult.MovePlayed is not null)
        {
            await _roomService.SafeNotifyAsync(
                async c =>
                {
                    await _notifier.MovePlayedAsync(txResult.RoomCode, txResult.MovePlayed, txResult.Snapshot, c);
                    if (txResult.RoundEnded is not null)
                    {
                        await _notifier.RoundEndedAsync(txResult.RoomCode, txResult.RoundEnded, txResult.Snapshot, c);
                    }
                    if (txResult.MatchEnded is not null)
                    {
                        await _notifier.MatchEndedAsync(txResult.RoomCode, txResult.MatchEnded, txResult.Snapshot, c);
                    }
                    if (txResult.NextTurnPlayerId is Guid nextPlayerId)
                    {
                        await _notifier.TurnStartedAsync(txResult.RoomCode, nextPlayerId, txResult.NextTurnNumber, txResult.Snapshot, c);
                    }
                },
                txResult.RoomCode,
                "MovePlayed",
                ct);
            ScheduleAutomation(session.RoomId, txResult.Snapshot);
        }

        return txResult.Snapshot;
    }

    private static void ValidateActiveTurn(GameRoom room, Match? match, Round? round, Player player, long expectedStateVersion)
    {
        if (match is null || match.Status != MatchStatus.InProgress)
        {
            throw new GameDomainException(DomainErrorCodes.MatchNotActive, "Aktif bir maç yok.");
        }
        if (round is null || round.Status != RoundStatus.InProgress)
        {
            throw new GameDomainException(DomainErrorCodes.RoundAlreadyCompleted, "Aktif bir el yok.");
        }
        if (round.CurrentPlayerId != player.Id)
        {
            throw new GameDomainException(DomainErrorCodes.NotYourTurn, "Sıra sizde değil.");
        }
        if (expectedStateVersion != room.StateVersion)
        {
            throw new GameDomainException(DomainErrorCodes.StaleState, "Oyun durumunuz güncel değil; lütfen bekleyin.");
        }
    }

    /// <summary>
    /// El bitişini işler: mars kontrolü, puanlar, maç bitişi veya yeni el.
    /// </summary>
    private (RoundEndedDto RoundEnded, MatchEndedDto? MatchEnded) CompleteRound(
        GameRoom room, Match match, Round round, Player winner, DateTime now)
    {
        // MARS: rakip hâlâ indirme aşamasındaysa 2 puan.
        var opponentState = round.PlayerStates.First(s => s.PlayerId != winner.Id);
        var isMars = !opponentState.ToBoard().IsCollecting;

        round.Status = RoundStatus.Completed;
        round.WinnerPlayerId = winner.Id;
        round.CurrentPlayerId = null;
        round.CompletedAtUtc = now;

        var progress = _engine.EvaluateRoundEnd(winner.Seat, isMars, match.Player1Score, match.Player2Score, match.RequiredWins);
        match.Player1Score = progress.Player1Score;
        match.Player2Score = progress.Player2Score;

        // Maç analitiği için el sonucu (mars bilgisi round tablosunda tutulmaz).
        _roomService.AddEvent(room.Id, match.Id, round.Id, room.StateVersion, GameEventTypes.RoundCompleted,
            new RoundCompletedEventPayload(winner.Id, round.RoundNumber, isMars, progress.PointsAwarded), now);

        MatchEndedDto? matchEnded = null;

        if (progress.MatchWinnerSeat is not null)
        {
            match.Status = MatchStatus.Completed;
            match.WinnerPlayerId = winner.Id;
            match.CompletedAtUtc = now;
            match.CurrentRoundId = null;
            room.Status = RoomStatus.Completed;
            room.CompletedAtUtc = now;
            matchEnded = new MatchEndedDto(winner.Id, match.Player1Score, match.Player2Score, isMars);
        }
        else
        {
            var starterSeat = progress.NextRoundStarterSeat!.Value;
            var starter = room.Players.First(p => p.Seat == starterSeat);
            var nextRound = CreateRound(match.Id, round.RoundNumber + 1, starter.Id, room.Players.OrderBy(p => p.Seat).ToList(), now);
            nextRound.StateVersion = room.StateVersion;
            nextRound.TurnDeadlineUtc = TurnDeadlines.Compute(room, nextRound, now, _options);
            match.CurrentRoundId = nextRound.Id;
            _db.Rounds.Add(nextRound);
        }

        var roundEnded = new RoundEndedDto(
            winner.Id,
            round.RoundNumber,
            match.Player1Score,
            match.Player2Score,
            progress.PointsAwarded,
            isMars,
            matchEnded is not null);

        return (roundEnded, matchEnded);
    }

    public async Task<RoomSnapshotDto> RequestRematchAsync(PlayerSession session, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        var txResult = await ExecuteWithRetryAsync(async innerCt =>
        {
            var (room, match, round) = await _roomService.LoadRoomGraphAsync(session, tracking: true, innerCt);
            var player = RoomService.GetValidatedPlayer(room, session);

            if (room.Status != RoomStatus.Completed || match is null || match.Status != MatchStatus.Completed)
            {
                throw new GameDomainException(DomainErrorCodes.RematchNotAvailable, "Rövanş yalnızca maç bittikten sonra istenebilir.");
            }
            if (room.Players.Count != 2)
            {
                throw new GameDomainException(DomainErrorCodes.RematchNotAvailable, "Rövanş için iki oyuncu gereklidir.");
            }
            if (room.RematchRequestedByPlayerId is not null)
            {
                throw new GameDomainException(DomainErrorCodes.RematchNotAvailable, "Rövanş isteği zaten gönderildi.");
            }

            player.LastSeenAtUtc = now;
            room.RematchRequestedByPlayerId = session.PlayerId;
            room.StateVersion++;
            _roomService.AddEvent(room.Id, match.Id, null, room.StateVersion, "RematchRequested", new { session.PlayerId }, now);
            await _db.SaveChangesAsync(innerCt);

            var snapshot = SnapshotMapper.ToSnapshot(room, match, round, now);
            var opponentIsBot = room.Players.Any(p => p.Id != session.PlayerId && p.IsBot);
            return (Snapshot: snapshot, RoomCode: room.Code, OpponentIsBot: opponentIsBot);
        }, ct);

        await _roomService.SafeNotifyAsync(
            c => _notifier.RematchRequestedAsync(txResult.RoomCode, session.PlayerId, txResult.Snapshot, c),
            txResult.RoomCode,
            "RematchRequested",
            ct);

        if (txResult.OpponentIsBot)
        {
            // Bot rövanşı kısa bir "düşünme" sonrası kabul eder (TurnAutomationRunner).
            _automation.Schedule(session.RoomId, now.AddMilliseconds(TurnDeadlines.BotThinkMs(txResult.Snapshot.StateVersion, _options)));
        }

        return txResult.Snapshot;
    }

    public async Task<StartMatchResult> AcceptRematchAsync(PlayerSession session, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        var txResult = await ExecuteWithRetryAsync(async innerCt =>
        {
            var (room, match, _) = await _roomService.LoadRoomGraphAsync(session, tracking: true, innerCt);
            var player = RoomService.GetValidatedPlayer(room, session);

            if (room.RematchRequestedByPlayerId is null || match is null || match.Status != MatchStatus.Completed)
            {
                throw new GameDomainException(DomainErrorCodes.RematchNotAvailable, "Bekleyen bir rövanş isteği yok.");
            }
            if (room.RematchRequestedByPlayerId == session.PlayerId)
            {
                throw new GameDomainException(DomainErrorCodes.RematchNotAvailable, "Kendi rövanş isteğinizi kabul edemezsiniz.");
            }

            player.LastSeenAtUtc = now;
            var result = await CreateMatchWithStartingRollAsync(room, Guid.Empty, now, innerCt);

            _logger.LogInformation("Rövanş kabul edildi. RoomCode: {RoomCode}, PlayerId: {PlayerId}", room.Code, session.PlayerId);
            return (Result: result, RoomCode: room.Code);
        }, ct);

        await _roomService.SafeNotifyAsync(
            async c =>
            {
                await _notifier.RematchAcceptedAsync(txResult.RoomCode, txResult.Result.Snapshot, c);
                await _notifier.StartingRollStartedAsync(txResult.RoomCode, now, c);
                await _notifier.MatchStartedAsync(txResult.RoomCode, txResult.Result.Snapshot, c);
                await _notifier.StartingRollResolvedAsync(txResult.RoomCode, txResult.Result.StartingRoll, txResult.Result.Snapshot, c);
            },
            txResult.RoomCode,
            "RematchAccepted",
            ct);
        ScheduleAutomation(session.RoomId, txResult.Result.Snapshot);

        return txResult.Result;
    }

    public async Task<RoomSnapshotDto> DeclineRematchAsync(PlayerSession session, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        var txResult = await ExecuteWithRetryAsync(async innerCt =>
        {
            var (room, match, round) = await _roomService.LoadRoomGraphAsync(session, tracking: true, innerCt);
            var player = RoomService.GetValidatedPlayer(room, session);

            if (room.RematchRequestedByPlayerId is null)
            {
                throw new GameDomainException(DomainErrorCodes.RematchNotAvailable, "Bekleyen bir rövanş isteği yok.");
            }
            if (room.RematchRequestedByPlayerId == session.PlayerId)
            {
                throw new GameDomainException(DomainErrorCodes.RematchNotAvailable, "Kendi rövanş isteğinizi reddedemezsiniz.");
            }

            player.LastSeenAtUtc = now;
            room.RematchRequestedByPlayerId = null;
            room.StateVersion++;
            _roomService.AddEvent(room.Id, match?.Id, null, room.StateVersion, "RematchDeclined", new { session.PlayerId }, now);
            await _db.SaveChangesAsync(innerCt);

            var snapshot = SnapshotMapper.ToSnapshot(room, match, round, now);
            return (Snapshot: snapshot, RoomCode: room.Code);
        }, ct);

        await _roomService.SafeNotifyAsync(
            c => _notifier.RematchDeclinedAsync(txResult.RoomCode, session.PlayerId, txResult.Snapshot, c),
            txResult.RoomCode,
            "RematchDeclined",
            ct);

        return txResult.Snapshot;
    }

    /// <summary>
    /// Transaction + optimistic concurrency retry. Rowversion çakışmasında
    /// change tracker temizlenir ve işlem en baştan (idempotency kontrolü dahil) tekrarlanır.
    /// </summary>
    private async Task<TResult> ExecuteWithRetryAsync<TResult>(
        Func<CancellationToken, Task<TResult>> action, CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await _db.ExecuteInTransactionAsync(action, ct);
            }
            catch (DbUpdateConcurrencyException) when (attempt <= MaxConcurrencyRetries)
            {
                _db.ClearChangeTracker();
                _logger.LogWarning("Concurrency çakışması, yeniden deneniyor. Deneme: {Attempt}", attempt);
            }
            catch (DbUpdateException ex) when (attempt <= MaxConcurrencyRetries && IsUniqueConstraintViolation(ex))
            {
                // Aynı komut/tur eşzamanlı iki kez yazılmaya çalışıldı; idempotency kontrolü
                // bir sonraki denemede kayıtlı sonucu döndürür.
                _db.ClearChangeTracker();
                _logger.LogWarning("Unique constraint çakışması, yeniden deneniyor. Deneme: {Attempt}", attempt);
            }
        }
    }

    private static bool IsUniqueConstraintViolation(DbUpdateException ex)
    {
        return ex.InnerException?.Message.Contains("duplicate", StringComparison.OrdinalIgnoreCase) == true
            || ex.InnerException?.Message.Contains("UNIQUE", StringComparison.OrdinalIgnoreCase) == true
            || ex.InnerException?.Message.Contains("Cannot insert duplicate key", StringComparison.OrdinalIgnoreCase) == true;
    }
}
