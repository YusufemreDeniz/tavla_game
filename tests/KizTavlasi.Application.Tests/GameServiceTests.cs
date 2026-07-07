using FluentAssertions;
using KizTavlasi.Application.Dtos;
using KizTavlasi.Application.Tests.TestInfrastructure;
using KizTavlasi.Domain;

namespace KizTavlasi.Application.Tests;

[Collection("Database")]
public class GameServiceTests : IDisposable
{
    private readonly TestHarness _harness;

    public GameServiceTests(SqlTestDatabase database)
    {
        _harness = new TestHarness(database);
    }

    public void Dispose() => _harness.Dispose();

    private sealed record PlayerSessionPair(
        KizTavlasi.Application.PlayerSession Host,
        KizTavlasi.Application.PlayerSession Guest);

    private async Task<(PlayerSessionPair Sessions, string RoomCode)> CreateFullRoomAsync(int bestOf = 1)
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", bestOf));
        var joined = await _harness.RoomService.JoinRoomAsync(created.RoomCode, new JoinRoomRequest("Fatma"));
        return (new PlayerSessionPair(
            _harness.SessionFor(created.PlayerToken),
            _harness.SessionFor(joined.PlayerToken)), created.RoomCode);
    }

    /// <summary>Sıradaki oyuncu için her zaman ilerleme sağlayan zarları seçer.</summary>
    private static (int Die1, int Die2) ChooseProductiveDice(PlayerBoardDto board)
    {
        if (!board.IsCollecting)
        {
            var gate = board.Points.First(p => p.BackCount > 1).PointNumber;
            return (gate, gate); // çift: 2×zar hamle, hepsi oynanabilir
        }

        var nonEmpty = board.Points
            .Where(p => p.BackCount + p.FrontCount > 0)
            .Select(p => p.PointNumber)
            .ToList();
        var die1 = nonEmpty[0];
        var die2 = nonEmpty.Count > 1 ? nonEmpty[1] : (die1 == 6 ? 5 : die1 + 1);
        return (die1, die2);
    }

    private static int ChoosePickGate(PlayerBoardDto board)
    {
        if (!board.IsCollecting)
        {
            return board.Points.First(p => p.BackCount > 1).PointNumber;
        }
        return board.Points.First(p => p.BackCount + p.FrontCount > 0).PointNumber;
    }

    /// <summary>Maç bitene veya durdurma koşulu sağlanana kadar sıradaki oyuncuyu oynatır.</summary>
    private async Task<RoomSnapshotDto> DriveAsync(
        PlayerSessionPair sessions,
        RoomSnapshotDto snapshot,
        Func<RoomSnapshotDto, bool>? stop = null,
        Func<Guid, (int Die1, int Die2)?>? diceOverride = null)
    {
        var guard = 0;
        while (snapshot.Match!.Status == "InProgress" && guard++ < 2000)
        {
            if (stop is not null && stop(snapshot))
            {
                return snapshot;
            }

            var round = snapshot.Match.CurrentRound!;
            var currentId = round.CurrentPlayerId!.Value;
            var current = currentId == sessions.Host.PlayerId ? sessions.Host : sessions.Guest;
            var board = round.Boards.First(b => b.PlayerId == currentId);

            if (round.PendingDice.Count > 0)
            {
                snapshot = await _harness.GameService.PlayMoveAsync(current, round.PendingDice[0], snapshot.StateVersion);
                continue;
            }

            if (round.PendingBonusPicks > 0)
            {
                snapshot = await _harness.GameService.PlayMoveAsync(current, ChoosePickGate(board), snapshot.StateVersion);
                continue;
            }

            var dice = diceOverride?.Invoke(currentId) ?? ChooseProductiveDice(board);
            _harness.Dice.Enqueue(dice.Die1, dice.Die2);
            var roll = await _harness.GameService.RollDiceAsync(current, Guid.NewGuid(), snapshot.StateVersion);
            snapshot = roll.Snapshot;
        }
        return snapshot;
    }

    [Fact]
    public async Task Host_maci_baslatir_ve_baslangic_zari_atilir()
    {
        var (sessions, _) = await CreateFullRoomAsync();
        _harness.Dice.Enqueue(6, 2);

        var result = await _harness.GameService.StartMatchAsync(sessions.Host, Guid.NewGuid());

        result.StartingRoll.StartingSeat.Should().Be(1);
        result.StartingRoll.StartingPlayerId.Should().Be(sessions.Host.PlayerId);
        result.Snapshot.Status.Should().Be("Playing");
        result.Snapshot.Match!.CurrentRound!.CurrentPlayerId.Should().Be(sessions.Host.PlayerId);
        _harness.Notifier.Events.Should().Contain("MatchStarted").And.Contain("StartingRollResolved");
    }

    [Fact]
    public async Task Host_olmayan_oyuncu_maci_baslatamaz()
    {
        var (sessions, _) = await CreateFullRoomAsync();

        var act = () => _harness.GameService.StartMatchAsync(sessions.Guest, Guid.NewGuid());

        (await act.Should().ThrowAsync<GameDomainException>())
            .Which.Code.Should().Be(DomainErrorCodes.NotHost);
    }

    [Fact]
    public async Task Baslangic_zarlari_esitse_yeniden_atilir()
    {
        var (sessions, _) = await CreateFullRoomAsync();
        _harness.Dice.Enqueue(4, 4, 2, 5);

        var result = await _harness.GameService.StartMatchAsync(sessions.Host, Guid.NewGuid());

        result.StartingRoll.Attempts.Should().HaveCount(2);
        result.StartingRoll.Attempts[0].IsTie.Should().BeTrue();
        result.StartingRoll.StartingSeat.Should().Be(2);
    }

    [Fact]
    public async Task Sirasi_olmayan_oyuncu_zar_atamaz()
    {
        var (sessions, _) = await CreateFullRoomAsync();
        _harness.Dice.Enqueue(6, 2);
        var started = await _harness.GameService.StartMatchAsync(sessions.Host, Guid.NewGuid());

        var act = () => _harness.GameService.RollDiceAsync(
            sessions.Guest, Guid.NewGuid(), started.Snapshot.StateVersion);

        (await act.Should().ThrowAsync<GameDomainException>())
            .Which.Code.Should().Be(DomainErrorCodes.NotYourTurn);
    }

    [Fact]
    public async Task Zar_atmak_hamleleri_bekletir_hamleyi_oyuncu_yapar()
    {
        var (sessions, _) = await CreateFullRoomAsync();
        _harness.Dice.Enqueue(6, 2);
        var started = await _harness.GameService.StartMatchAsync(sessions.Host, Guid.NewGuid());

        _harness.Dice.Enqueue(3, 5);
        var result = await _harness.GameService.RollDiceAsync(
            sessions.Host, Guid.NewGuid(), started.Snapshot.StateVersion);

        // Zar atıldı ama tahta değişmedi; hamleler oyuncuyu bekliyor.
        result.Roll.PlayableDice.Should().Equal(3, 5);
        result.Roll.TurnWasted.Should().BeFalse();
        var round = result.Snapshot.Match!.CurrentRound!;
        round.PendingDice.Should().Equal(3, 5);
        round.CurrentPlayerId.Should().Be(sessions.Host.PlayerId, "hamleler bitmeden sıra geçmez");
        round.Boards.First(b => b.PlayerId == sessions.Host.PlayerId)
            .Points.First(p => p.PointNumber == 3).FrontCount.Should().Be(0);

        // 3. haneye dokun → pul iner.
        var afterMove = await _harness.GameService.PlayMoveAsync(sessions.Host, 3, result.Snapshot.StateVersion);
        var hostBoard = afterMove.Match!.CurrentRound!.Boards.First(b => b.PlayerId == sessions.Host.PlayerId);
        hostBoard.Points.First(p => p.PointNumber == 3).FrontCount.Should().Be(1);
        afterMove.Match.CurrentRound.PendingDice.Should().Equal(5);

        // 5. haneye dokun → sıra rakibe geçer.
        var afterSecond = await _harness.GameService.PlayMoveAsync(sessions.Host, 5, afterMove.StateVersion);
        afterSecond.Match!.CurrentRound!.PendingDice.Should().BeEmpty();
        afterSecond.Match.CurrentRound.CurrentPlayerId.Should().Be(sessions.Guest.PlayerId);
        _harness.Notifier.Events.Should().Contain("MovePlayed");
    }

    [Fact]
    public async Task Bekleyen_zar_disinda_hane_oynanamaz()
    {
        var (sessions, _) = await CreateFullRoomAsync();
        _harness.Dice.Enqueue(6, 2);
        var started = await _harness.GameService.StartMatchAsync(sessions.Host, Guid.NewGuid());

        _harness.Dice.Enqueue(3, 5);
        var result = await _harness.GameService.RollDiceAsync(sessions.Host, Guid.NewGuid(), started.Snapshot.StateVersion);

        var act = () => _harness.GameService.PlayMoveAsync(sessions.Host, 4, result.Snapshot.StateVersion);

        (await act.Should().ThrowAsync<GameDomainException>())
            .Which.Code.Should().Be(DomainErrorCodes.InvalidCommand);
    }

    [Fact]
    public async Task Cift_atan_2x_zar_hamleyi_tek_tek_oynar_indirme_asamasinda_da()
    {
        var (sessions, _) = await CreateFullRoomAsync();
        _harness.Dice.Enqueue(6, 2);
        var started = await _harness.GameService.StartMatchAsync(sessions.Host, Guid.NewGuid());

        // İndirme aşamasında 5-5: toplam 10 hamle (ilki 5. haneden zorunlu, 9 serbest).
        _harness.Dice.Enqueue(5, 5);
        var roll = await _harness.GameService.RollDiceAsync(sessions.Host, Guid.NewGuid(), started.Snapshot.StateVersion);

        roll.Roll.IsDouble.Should().BeTrue();
        roll.Roll.PlayableDice.Should().Equal(5);
        roll.Roll.BonusPicksGranted.Should().Be(9);

        // Bonus bekliyorken zar atılamaz.
        var rollAct = () => _harness.GameService.RollDiceAsync(sessions.Host, Guid.NewGuid(), roll.Snapshot.StateVersion);
        (await rollAct.Should().ThrowAsync<GameDomainException>())
            .Which.Code.Should().Be(DomainErrorCodes.InvalidCommand);

        // 10 hamleyi oyna: 9 indirme + (indirme bitince) 1 toplama.
        var snapshot = roll.Snapshot;
        var moves = 0;
        while (snapshot.Match!.CurrentRound!.PendingDice.Count > 0 || snapshot.Match.CurrentRound.PendingBonusPicks > 0)
        {
            var board = snapshot.Match.CurrentRound.Boards.First(b => b.PlayerId == sessions.Host.PlayerId);
            var gate = snapshot.Match.CurrentRound.PendingDice.Count > 0
                ? snapshot.Match.CurrentRound.PendingDice[0]
                : ChoosePickGate(board);
            snapshot = await _harness.GameService.PlayMoveAsync(sessions.Host, gate, snapshot.StateVersion);
            moves++;
        }

        moves.Should().Be(10, "5-5 toplam 10 hamle hakkı verir");
        var hostBoard = snapshot.Match!.CurrentRound!.Boards.First(b => b.PlayerId == sessions.Host.PlayerId);
        hostBoard.IsCollecting.Should().BeTrue("9 indirme tamamlandı");
        hostBoard.CollectedCount.Should().Be(1, "10. hamle toplamaya geçti");
        snapshot.Match.CurrentRound.CurrentPlayerId.Should().Be(sessions.Guest.PlayerId, "hamleler bitince sıra rakibe geçer");
    }

    [Fact]
    public async Task Ayni_command_id_ikinci_kez_islenmez()
    {
        var (sessions, _) = await CreateFullRoomAsync();
        _harness.Dice.Enqueue(6, 2);
        var started = await _harness.GameService.StartMatchAsync(sessions.Host, Guid.NewGuid());

        var commandId = Guid.NewGuid();
        _harness.Dice.Enqueue(3, 5);
        var first = await _harness.GameService.RollDiceAsync(sessions.Host, commandId, started.Snapshot.StateVersion);

        var second = await _harness.GameService.RollDiceAsync(sessions.Host, commandId, started.Snapshot.StateVersion);

        second.WasAlreadyProcessed.Should().BeTrue();
        second.Roll.Die1.Should().Be(first.Roll.Die1);
        second.Roll.Die2.Should().Be(first.Roll.Die2);
        second.Snapshot.StateVersion.Should().Be(first.Snapshot.StateVersion);
    }

    [Fact]
    public async Task Eski_state_version_reddedilir()
    {
        var (sessions, _) = await CreateFullRoomAsync();
        _harness.Dice.Enqueue(6, 2);
        var started = await _harness.GameService.StartMatchAsync(sessions.Host, Guid.NewGuid());

        var act = () => _harness.GameService.RollDiceAsync(
            sessions.Host, Guid.NewGuid(), started.Snapshot.StateVersion - 1);

        (await act.Should().ThrowAsync<GameDomainException>())
            .Which.Code.Should().Be(DomainErrorCodes.StaleState);
    }

    [Fact]
    public async Task Tek_el_macinda_15_pul_toplayan_maci_kazanir()
    {
        var (sessions, _) = await CreateFullRoomAsync(bestOf: 1);
        _harness.Dice.Enqueue(6, 2);
        var started = await _harness.GameService.StartMatchAsync(sessions.Host, Guid.NewGuid());

        var snapshot = await DriveAsync(sessions, started.Snapshot);

        snapshot.Match!.Status.Should().Be("Completed");
        snapshot.Status.Should().Be("Completed");
        _harness.Notifier.Events.Should().Contain("RoundEnded").And.Contain("MatchEnded");
    }

    [Fact]
    public async Task Rakip_indirme_asamasindayken_kazanmak_mars_sayilir_ve_iki_puan_verir()
    {
        var (sessions, _) = await CreateFullRoomAsync(bestOf: 5);
        _harness.Dice.Enqueue(6, 2);
        var started = await _harness.GameService.StartMatchAsync(sessions.Host, Guid.NewGuid());

        // Guest hep (1,2) yerine oynanamaz zar atar: 1. hanede back=2 tek indirme sonrası
        // (1,1) çifti 1. haneden oynanamaz hale gelir ve elleri boşa gider.
        var snapshot = await DriveAsync(
            sessions,
            started.Snapshot,
            stop: s => s.Match!.CurrentRound!.RoundNumber > 1,
            diceOverride: playerId => playerId == sessions.Guest.PlayerId ? (1, 1) : null);

        _harness.Notifier.LastRoundEnded.Should().NotBeNull();
        _harness.Notifier.LastRoundEnded!.WinnerPlayerId.Should().Be(sessions.Host.PlayerId);
        _harness.Notifier.LastRoundEnded.IsMars.Should().BeTrue();
        _harness.Notifier.LastRoundEnded.PointsAwarded.Should().Be(2);
        snapshot.Match!.Player1Score.Should().Be(2);
    }

    [Fact]
    public async Task Rovans_akisi_yeni_mac_baslatir()
    {
        var (sessions, _) = await CreateFullRoomAsync(bestOf: 1);
        await PlaySingleMatchAsync(sessions);

        await _harness.GameService.RequestRematchAsync(sessions.Host);
        _harness.Dice.Enqueue(3, 6);
        var rematch = await _harness.GameService.AcceptRematchAsync(sessions.Guest);

        rematch.Snapshot.Status.Should().Be("Playing");
        rematch.Snapshot.Match!.MatchNumber.Should().Be(2);
        rematch.Snapshot.Match.Player1Score.Should().Be(0);
        rematch.Snapshot.Match.Player2Score.Should().Be(0);
        _harness.Notifier.Events.Should().Contain("RematchRequested").And.Contain("RematchAccepted");
    }

    [Fact]
    public async Task Mac_bitmeden_rovans_istenemez()
    {
        var (sessions, _) = await CreateFullRoomAsync();

        var act = () => _harness.GameService.RequestRematchAsync(sessions.Host);

        (await act.Should().ThrowAsync<GameDomainException>())
            .Which.Code.Should().Be(DomainErrorCodes.RematchNotAvailable);
    }

    [Fact]
    public async Task Rovans_reddi_istegi_temizler()
    {
        var (sessions, _) = await CreateFullRoomAsync(bestOf: 1);
        await PlaySingleMatchAsync(sessions);

        await _harness.GameService.RequestRematchAsync(sessions.Host);
        var declined = await _harness.GameService.DeclineRematchAsync(sessions.Guest);

        declined.RematchRequestedByPlayerId.Should().BeNull();
        _harness.Notifier.Events.Should().Contain("RematchDeclined");
    }

    private async Task PlaySingleMatchAsync(PlayerSessionPair sessions)
    {
        _harness.Dice.Enqueue(6, 2);
        var started = await _harness.GameService.StartMatchAsync(sessions.Host, Guid.NewGuid());
        var snapshot = await DriveAsync(sessions, started.Snapshot);
        snapshot.Match!.Status.Should().Be("Completed");
    }
}
