using System.Text.Json;
using KizTavlasi.Application.Abstractions;
using KizTavlasi.Application.Dtos;
using KizTavlasi.Domain;
using KizTavlasi.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace KizTavlasi.Application;

/// <summary>
/// Maç orkestrasyonu: başlatma, zar atma, bonus pul seçimi, rövanş.
/// Tüm kural hesaplamaları <see cref="GameEngine"/> içinde; burada yalnızca
/// doğrulama, transaction ve yayın vardır.
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

    public GameService(
        IGameDbContext db,
        RoomService roomService,
        IDiceService diceService,
        IGameNotifier notifier,
        GameEngine engine,
        TimeProvider timeProvider,
        ILogger<GameService> logger)
    {
        _db = db;
        _roomService = roomService;
        _diceService = diceService;
        _notifier = notifier;
        _engine = engine;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task<StartMatchResult> StartMatchAsync(PlayerSession session, Guid commandId, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        return await ExecuteWithRetryAsync(async innerCt =>
        {
            var (room, existingMatch, _) = await _roomService.LoadRoomGraphAsync(session, tracking: true, innerCt);
            RoomService.GetValidatedPlayer(room, session);
            RoomService.EnsureNotExpired(room, now);

            if (room.HostPlayerId != session.PlayerId)
            {
                throw new GameDomainException(DomainErrorCodes.NotHost, "Maçı yalnızca oda sahibi başlatabilir.");
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

            var result = await CreateMatchWithStartingRollAsync(room, now, innerCt);

            _logger.LogInformation(
                "Maç başlatıldı. RoomCode: {RoomCode}, MatchId: {MatchId}, StateVersion: {StateVersion}, CommandId: {CommandId}",
                room.Code, result.Snapshot.Match?.Id, room.StateVersion, commandId);

            return result;
        }, ct);
    }

    private async Task<StartMatchResult> CreateMatchWithStartingRollAsync(GameRoom room, DateTime now, CancellationToken ct)
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

        _db.Matches.Add(match);
        _db.Rounds.Add(round);

        var startingRollDto = new StartingRollDto(
            startingRoll.Attempts.Select(a => new StartingRollAttemptDto(a.Player1Die, a.Player2Die, a.IsTie)).ToList(),
            startingPlayer.Id,
            startingRoll.StartingSeat);

        _roomService.AddEvent(room.Id, match.Id, round.Id, room.StateVersion, "MatchStarted",
            new { match.Id, startingRollDto.StartingPlayerId, Attempts = startingRollDto.Attempts }, now);

        await _db.SaveChangesAsync(ct);

        var snapshot = SnapshotMapper.ToSnapshot(room, match, round, now);
        await _notifier.MatchStartedAsync(room.Code, snapshot, ct);
        await _notifier.StartingRollResolvedAsync(room.Code, startingRollDto, snapshot, ct);

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
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        return await ExecuteWithRetryAsync(async innerCt =>
        {
            // Idempotency: aynı komut daha önce işlendiyse kayıtlı sonucu döndür.
            var existingRoll = await _db.DiceRolls.AsNoTracking()
                .FirstOrDefaultAsync(d => d.CommandId == commandId, innerCt);
            if (existingRoll is not null)
            {
                var (roomForReplay, matchForReplay, roundForReplay) =
                    await _roomService.LoadRoomGraphAsync(session, tracking: false, innerCt);
                var replaySnapshot = SnapshotMapper.ToSnapshot(roomForReplay, matchForReplay, roundForReplay, now);
                var storedResult = JsonSerializer.Deserialize<DiceRollResultDto>(existingRoll.ResolutionJson)
                    ?? throw new GameDomainException(DomainErrorCodes.InvalidCommand, "Kayıtlı zar sonucu okunamadı.");
                return new RollDiceResult(storedResult, replaySnapshot, WasAlreadyProcessed: true);
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

            await _notifier.DiceRollResolvedAsync(room.Code, rollResult, snapshot, innerCt);

            if (outcome.TurnWasted)
            {
                await _notifier.TurnStartedAsync(room.Code, opponent.Id, round.TurnNumber, snapshot, innerCt);
            }

            return new RollDiceResult(rollResult, snapshot, WasAlreadyProcessed: false);
        }, ct);
    }

    /// <summary>
    /// Oyuncunun haneye dokunarak yaptığı hamle: zar hamlesi veya çift bonusu hakkı.
    /// </summary>
    public async Task<RoomSnapshotDto> PlayMoveAsync(
        PlayerSession session, int pointNumber, long expectedStateVersion, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        return await ExecuteWithRetryAsync(async innerCt =>
        {
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

            var playerState = round.PlayerStates.First(s => s.PlayerId == player.Id);
            var board = playerState.ToBoard();

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

            var movePlayed = new MovePlayedDto(
                player.Id,
                pointNumber,
                step.Action.ToString(),
                pendingDice,
                round.PendingBonusPicks,
                wastedDice,
                board.IsCompleted,
                room.StateVersion);

            _roomService.AddEvent(room.Id, match.Id, round.Id, room.StateVersion, "MovePlayed",
                new { player.Id, pointNumber, action = step.Action.ToString(), remaining = round.PendingDice, round.PendingBonusPicks }, now);

            await _db.SaveChangesAsync(innerCt);

            var (freshRoom, freshMatch, freshRound) = await _roomService.LoadRoomGraphAsync(session, tracking: false, innerCt);
            var snapshot = SnapshotMapper.ToSnapshot(freshRoom, freshMatch, freshRound, now);

            await _notifier.MovePlayedAsync(room.Code, movePlayed, snapshot, innerCt);
            await NotifyRoundOutcomeAsync(room.Code, roundEnded, matchEnded, freshRound, snapshot, innerCt);

            if (roundEnded is null && matchEnded is null && pendingDice.Count == 0 && round.PendingBonusPicks == 0)
            {
                await _notifier.TurnStartedAsync(room.Code, opponent.Id, round.TurnNumber, snapshot, innerCt);
            }

            return snapshot;
        }, ct);
    }

    private void ValidateActiveTurn(GameRoom room, Match? match, Round? round, Player player, long expectedStateVersion)
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

    private async Task NotifyRoundOutcomeAsync(
        string roomCode,
        RoundEndedDto? roundEnded,
        MatchEndedDto? matchEnded,
        Round? freshRound,
        RoomSnapshotDto snapshot,
        CancellationToken ct)
    {
        if (roundEnded is not null)
        {
            await _notifier.RoundEndedAsync(roomCode, roundEnded, snapshot, ct);
        }
        if (matchEnded is not null)
        {
            await _notifier.MatchEndedAsync(roomCode, matchEnded, snapshot, ct);
        }
        else if (roundEnded is not null && freshRound is not null && freshRound.CurrentPlayerId is not null)
        {
            await _notifier.TurnStartedAsync(roomCode, freshRound.CurrentPlayerId.Value, freshRound.TurnNumber, snapshot, ct);
        }
    }

    public async Task<RoomSnapshotDto> RequestRematchAsync(PlayerSession session, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        return await ExecuteWithRetryAsync(async innerCt =>
        {
            var (room, match, round) = await _roomService.LoadRoomGraphAsync(session, tracking: true, innerCt);
            RoomService.GetValidatedPlayer(room, session);

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

            room.RematchRequestedByPlayerId = session.PlayerId;
            room.StateVersion++;
            _roomService.AddEvent(room.Id, match.Id, null, room.StateVersion, "RematchRequested", new { session.PlayerId }, now);
            await _db.SaveChangesAsync(innerCt);

            var snapshot = SnapshotMapper.ToSnapshot(room, match, round, now);
            await _notifier.RematchRequestedAsync(room.Code, session.PlayerId, snapshot, innerCt);
            return snapshot;
        }, ct);
    }

    public async Task<StartMatchResult> AcceptRematchAsync(PlayerSession session, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        return await ExecuteWithRetryAsync(async innerCt =>
        {
            var (room, match, _) = await _roomService.LoadRoomGraphAsync(session, tracking: true, innerCt);
            RoomService.GetValidatedPlayer(room, session);

            if (room.RematchRequestedByPlayerId is null || match is null || match.Status != MatchStatus.Completed)
            {
                throw new GameDomainException(DomainErrorCodes.RematchNotAvailable, "Bekleyen bir rövanş isteği yok.");
            }
            if (room.RematchRequestedByPlayerId == session.PlayerId)
            {
                throw new GameDomainException(DomainErrorCodes.RematchNotAvailable, "Kendi rövanş isteğinizi kabul edemezsiniz.");
            }

            var result = await CreateMatchWithStartingRollAsync(room, now, innerCt);
            await _notifier.RematchAcceptedAsync(room.Code, result.Snapshot, innerCt);

            _logger.LogInformation("Rövanş kabul edildi. RoomCode: {RoomCode}, PlayerId: {PlayerId}", room.Code, session.PlayerId);
            return result;
        }, ct);
    }

    public async Task<RoomSnapshotDto> DeclineRematchAsync(PlayerSession session, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        return await ExecuteWithRetryAsync(async innerCt =>
        {
            var (room, match, round) = await _roomService.LoadRoomGraphAsync(session, tracking: true, innerCt);
            RoomService.GetValidatedPlayer(room, session);

            if (room.RematchRequestedByPlayerId is null)
            {
                throw new GameDomainException(DomainErrorCodes.RematchNotAvailable, "Bekleyen bir rövanş isteği yok.");
            }
            if (room.RematchRequestedByPlayerId == session.PlayerId)
            {
                throw new GameDomainException(DomainErrorCodes.RematchNotAvailable, "Kendi rövanş isteğinizi reddedemezsiniz.");
            }

            room.RematchRequestedByPlayerId = null;
            room.StateVersion++;
            _roomService.AddEvent(room.Id, match?.Id, null, room.StateVersion, "RematchDeclined", new { session.PlayerId }, now);
            await _db.SaveChangesAsync(innerCt);

            var snapshot = SnapshotMapper.ToSnapshot(room, match, round, now);
            await _notifier.RematchDeclinedAsync(room.Code, session.PlayerId, snapshot, innerCt);
            return snapshot;
        }, ct);
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
