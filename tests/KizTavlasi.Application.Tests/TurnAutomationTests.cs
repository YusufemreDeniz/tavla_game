using System.IdentityModel.Tokens.Jwt;
using FluentAssertions;
using KizTavlasi.Application.Dtos;
using KizTavlasi.Application.Tests.TestInfrastructure;
using KizTavlasi.Domain;

namespace KizTavlasi.Application.Tests;

/// <summary>Bot modu, hamle süresi, botun rövanş kabulü ve izleyici erişimi.</summary>
[Collection("Database")]
public class TurnAutomationTests : IDisposable
{
    private readonly TestHarness _harness;
    private readonly Random _dice = new(4242);

    public TurnAutomationTests(SqlTestDatabase database)
    {
        _harness = new TestHarness(database);
    }

    public void Dispose() => _harness.Dispose();

    private async Task<(PlayerSession Human, Guid BotId, RoomSnapshotDto Snapshot)> CreateBotRoomAsync(
        string difficulty = "Master", int? timeLimit = null)
    {
        var created = await _harness.RoomService.CreateBotRoomAsync(new CreateBotRoomRequest("Ayşe", 1, difficulty, timeLimit));
        var human = _harness.SessionFor(created.PlayerToken);
        var botId = created.RoomState.Players.Single(p => p.IsBot).Id;
        return (human, botId, created.RoomState);
    }

    private Task<RoomSnapshotDto> StateAsync(PlayerSession session) =>
        _harness.RoomService.GetRoomStateAsync(session);

    private static PlayerBoard ToBoard(PlayerBoardDto dto) =>
        new(dto.Points.Select(p => new PointState(p.PointNumber, p.BackCount, p.FrontCount)).ToList(), dto.CollectedCount);

    /// <summary>İnsan oyuncunun tek adımı: zar at veya bekleyen hamleyi oyna.</summary>
    private async Task<RoomSnapshotDto> HumanStepAsync(PlayerSession human, RoomSnapshotDto snapshot)
    {
        var round = snapshot.Match!.CurrentRound!;
        if (round.PendingDice.Count == 0 && round.PendingBonusPicks == 0)
        {
            _harness.Dice.Enqueue(_dice.Next(1, 7), _dice.Next(1, 7));
            return (await _harness.GameService.RollDiceAsync(human, Guid.NewGuid(), snapshot.StateVersion)).Snapshot;
        }

        var board = ToBoard(round.Boards.Single(b => b.PlayerId == human.PlayerId));
        var point = BotStrategy.ChooseMove(board, round.PendingDice, round.PendingBonusPicks, BotDifficulty.Master, new Random(1))!.Value;
        return await _harness.GameService.PlayMoveAsync(human, point, snapshot.StateVersion, commandId: Guid.NewGuid());
    }

    /// <summary>Saati otomatik eylem zamanına ilerletip runner'ı çalıştırır (bot zar atarsa rastgele zar kuyruğa alınır).</summary>
    private async Task<AutomationOutcome> AdvanceAndRunAsync(Guid roomId, RoomSnapshotDto snapshot)
    {
        var deadline = snapshot.Match!.CurrentRound!.TurnDeadlineUtc;
        deadline.Should().NotBeNull("bot sırasında otomatik eylem zamanı bulunmalı");
        var now = _harness.Time.GetUtcNow().UtcDateTime;
        if (deadline > now)
        {
            _harness.Time.Advance(deadline.Value - now);
        }
        _harness.Dice.Enqueue(_dice.Next(1, 7), _dice.Next(1, 7));
        return await _harness.Automation.RunDueAsync(roomId);
    }

    /// <summary>İnsan Usta stratejisiyle, bot otomasyonla oynar; maç bitene kadar sürer.</summary>
    private async Task<RoomSnapshotDto> PlayToEndAsync(PlayerSession human, Guid botId, RoomSnapshotDto snapshot)
    {
        var guard = 0;
        while (snapshot.Match!.Status == "InProgress" && guard++ < 3000)
        {
            if (snapshot.Match.CurrentRound!.CurrentPlayerId == botId)
            {
                var outcome = await AdvanceAndRunAsync(human.RoomId, snapshot);
                outcome.Should().BeOneOf(AutomationOutcome.Rolled, AutomationOutcome.Moved);
                snapshot = await StateAsync(human);
            }
            else
            {
                snapshot = await HumanStepAsync(human, snapshot);
            }
        }
        return snapshot;
    }

    [Fact]
    public async Task Bot_odasi_iki_oyunculu_lobi_olarak_kurulur_ve_baskasi_katilamaz()
    {
        var (human, botId, snapshot) = await CreateBotRoomAsync("Easy", 30);

        snapshot.Status.Should().Be("InLobby");
        snapshot.TurnTimeLimitSeconds.Should().Be(30);
        snapshot.Players.Should().HaveCount(2);
        var bot = snapshot.Players.Single(p => p.Id == botId);
        bot.Seat.Should().Be(2);
        bot.IsConnected.Should().BeTrue();
        bot.DisplayName.Should().Be("Çırak Bot");
        snapshot.Players.Single(p => p.Id == human.PlayerId).IsBot.Should().BeFalse();

        var act = () => _harness.RoomService.JoinRoomAsync(snapshot.RoomCode, new JoinRoomRequest("Fatma"));
        (await act.Should().ThrowAsync<GameDomainException>()).Which.Code.Should().Be(DomainErrorCodes.RoomFull);
    }

    [Fact]
    public void Gecersiz_zorluk_ve_hamle_suresi_reddedilir()
    {
        var validator = new CreateBotRoomRequestValidator();
        validator.Validate(new CreateBotRoomRequest("Ayşe", 1, "Hard")).IsValid.Should().BeFalse();
        validator.Validate(new CreateBotRoomRequest("Ayşe", 1, "1")).IsValid.Should().BeFalse();
        validator.Validate(new CreateBotRoomRequest("Ayşe", 1, "master", 15)).IsValid.Should().BeTrue();
        validator.Validate(new CreateBotRoomRequest("Ayşe", 1, "Easy", 45)).IsValid.Should().BeFalse();
        new CreateRoomRequestValidator().Validate(new CreateRoomRequest("Ayşe", 1, 20)).IsValid.Should().BeFalse();
        new CreateRoomRequestValidator().Validate(new CreateRoomRequest("Ayşe", 1, 30)).IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Bot_dusunme_suresi_dolmadan_hareket_etmez_dolunca_zar_atar_ve_hamle_yapar()
    {
        var (human, botId, _) = await CreateBotRoomAsync();
        _harness.Dice.Enqueue(1, 6); // bot (koltuk 2) başlar
        var start = await _harness.GameService.StartMatchAsync(human, Guid.NewGuid());
        var round = start.Snapshot.Match!.CurrentRound!;
        round.CurrentPlayerId.Should().Be(botId);

        var now = _harness.Time.GetUtcNow().UtcDateTime;
        round.TurnDeadlineUtc.Should().BeOnOrAfter(
            now.AddMilliseconds(_harness.GameSettings.RoundStartGraceMs + _harness.GameSettings.BotMinDelayMs));
        _harness.Scheduler.LastDue(human.RoomId).Should().Be(round.TurnDeadlineUtc);

        (await _harness.Automation.RunDueAsync(human.RoomId)).Should().Be(AutomationOutcome.NothingDue);

        _harness.Time.Advance(round.TurnDeadlineUtc!.Value - now);
        _harness.Dice.Enqueue(6, 3);
        (await _harness.Automation.RunDueAsync(human.RoomId)).Should().Be(AutomationOutcome.Rolled);

        var afterRoll = await StateAsync(human);
        afterRoll.Match!.CurrentRound!.PendingDice.Should().BeEquivalentTo([6, 3]);
        afterRoll.Match.CurrentRound.TurnDeadlineUtc.Should().NotBeNull();

        (await AdvanceAndRunAsync(human.RoomId, afterRoll)).Should().Be(AutomationOutcome.Moved);
        (await AdvanceAndRunAsync(human.RoomId, await StateAsync(human))).Should().Be(AutomationOutcome.Moved);

        var afterMoves = await StateAsync(human);
        afterMoves.Match!.CurrentRound!.CurrentPlayerId.Should().Be(human.PlayerId, "bot hamlelerini bitirince sıra insana geçer");
        afterMoves.Match.CurrentRound.TurnDeadlineUtc.Should().BeNull("süresiz odada insan oyuncu için otomatik eylem yok");
        var botBoard = afterMoves.Match.CurrentRound.Boards.Single(b => b.PlayerId == botId);
        botBoard.Points.Single(p => p.PointNumber == 6).FrontCount.Should().Be(1);
        botBoard.Points.Single(p => p.PointNumber == 3).FrontCount.Should().Be(1);
    }

    [Fact]
    public async Task Ayni_an_icin_iki_kez_calisan_otomasyon_eylemi_bir_kez_uygular()
    {
        var (human, _, _) = await CreateBotRoomAsync();
        _harness.Dice.Enqueue(1, 6);
        var start = await _harness.GameService.StartMatchAsync(human, Guid.NewGuid());
        _harness.Time.Advance(start.Snapshot.Match!.CurrentRound!.TurnDeadlineUtc!.Value - _harness.Time.GetUtcNow().UtcDateTime);
        _harness.Dice.Enqueue(6, 3, 5, 5);

        var first = await _harness.Automation.RunDueAsync(human.RoomId);
        var second = await _harness.Automation.RunDueAsync(human.RoomId);

        first.Should().Be(AutomationOutcome.Rolled);
        second.Should().Be(AutomationOutcome.NothingDue, "ilk eylem yeni bir düşünme süresi zamanladı");
        (await StateAsync(human)).StateVersion.Should().Be(start.Snapshot.StateVersion + 1);
    }

    [Theory]
    [InlineData("Easy")]
    [InlineData("Master")]
    public async Task Bota_karsi_mac_sonuna_kadar_oynanir(string difficulty)
    {
        var (human, botId, _) = await CreateBotRoomAsync(difficulty);
        _harness.Dice.Enqueue(6, 1);
        var snapshot = (await _harness.GameService.StartMatchAsync(human, Guid.NewGuid())).Snapshot;

        snapshot = await PlayToEndAsync(human, botId, snapshot);

        snapshot.Match!.Status.Should().Be("Completed");
        snapshot.Match.WinnerPlayerId.Should().NotBeNull();
        _harness.Notifier.Events.Should().Contain("MatchEnded");
    }

    [Fact]
    public async Task Hamle_suresi_dolunca_sunucu_otomatik_zar_atar_ve_gecerli_hamle_oynar()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 1, 15));
        var joined = await _harness.RoomService.JoinRoomAsync(created.RoomCode, new JoinRoomRequest("Fatma"));
        var host = _harness.SessionFor(created.PlayerToken);
        _harness.Dice.Enqueue(6, 1); // host başlar
        var start = await _harness.GameService.StartMatchAsync(host, Guid.NewGuid());
        var startedAt = _harness.Time.GetUtcNow().UtcDateTime;

        start.Snapshot.TurnTimeLimitSeconds.Should().Be(15);
        var deadline = start.Snapshot.Match!.CurrentRound!.TurnDeadlineUtc!.Value;
        deadline.Should().Be(startedAt.AddSeconds(15).AddMilliseconds(_harness.GameSettings.RoundStartGraceMs));

        _harness.Time.Advance(TimeSpan.FromSeconds(10));
        (await _harness.Automation.RunDueAsync(host.RoomId)).Should().Be(AutomationOutcome.NothingDue);

        _harness.Time.Advance(deadline - _harness.Time.GetUtcNow().UtcDateTime);
        _harness.Dice.Enqueue(4, 2);
        (await _harness.Automation.RunDueAsync(host.RoomId)).Should().Be(AutomationOutcome.Rolled);

        var afterRoll = await StateAsync(host);
        afterRoll.Match!.CurrentRound!.CurrentPlayerId.Should().Be(host.PlayerId);
        afterRoll.Match.CurrentRound.TurnDeadlineUtc.Should().Be(
            _harness.Time.GetUtcNow().UtcDateTime.AddSeconds(15), "her hamle için süre yeniden başlar");

        _harness.Time.Advance(TimeSpan.FromSeconds(15));
        (await _harness.Automation.RunDueAsync(host.RoomId)).Should().Be(AutomationOutcome.Moved);

        // Oyuncu kendisi oynarsa otomasyonun yapacak işi kalmaz.
        var state = await StateAsync(host);
        var pending = state.Match!.CurrentRound!.PendingDice;
        pending.Should().ContainSingle();
        await _harness.GameService.PlayMoveAsync(host, pending[0], state.StateVersion, commandId: Guid.NewGuid());
        (await _harness.Automation.RunDueAsync(host.RoomId)).Should().Be(AutomationOutcome.NothingDue);

        var final = await StateAsync(host);
        final.Match!.CurrentRound!.CurrentPlayerId.Should().Be(_harness.SessionFor(joined.PlayerToken).PlayerId);
    }

    [Fact]
    public async Task Bot_rovans_istegini_kabul_eder()
    {
        var (human, botId, _) = await CreateBotRoomAsync();
        _harness.Dice.Enqueue(6, 1);
        var snapshot = (await _harness.GameService.StartMatchAsync(human, Guid.NewGuid())).Snapshot;
        snapshot = await PlayToEndAsync(human, botId, snapshot);
        snapshot.Status.Should().Be("Completed");

        await _harness.GameService.RequestRematchAsync(human);
        _harness.Scheduler.LastDue(human.RoomId).Should().NotBeNull();
        (await _harness.Automation.FindPendingAsync()).Select(p => p.RoomId).Should().Contain(human.RoomId);

        _harness.Dice.Enqueue(5, 2);
        (await _harness.Automation.RunDueAsync(human.RoomId)).Should().Be(AutomationOutcome.RematchAccepted);

        var rematch = await StateAsync(human);
        rematch.Status.Should().Be("Playing");
        rematch.Match!.MatchNumber.Should().Be(2);
    }

    [Fact]
    public async Task Insan_oyuncu_bot_odasindan_ayrilirsa_oda_kapanir_bota_galibiyet_verilmez()
    {
        var (human, _, _) = await CreateBotRoomAsync();
        _harness.Dice.Enqueue(6, 1);
        await _harness.GameService.StartMatchAsync(human, Guid.NewGuid());

        await _harness.RoomService.LeaveRoomAsync(human);

        _harness.Db.ChangeTracker.Clear();
        _harness.Db.GameRooms.Single(r => r.Id == human.RoomId).Status.Should().Be(RoomStatus.Abandoned);
        _harness.Notifier.LastMatchEnded.Should().BeNull();
        (await _harness.Automation.RunDueAsync(human.RoomId)).Should().Be(AutomationOutcome.NothingDue);
    }

    [Fact]
    public async Task Insan_oyuncu_grace_suresinde_donmezse_bot_odasi_sahipsiz_kapanir()
    {
        var (human, _, _) = await CreateBotRoomAsync();
        _harness.Dice.Enqueue(6, 1);
        await _harness.GameService.StartMatchAsync(human, Guid.NewGuid());
        await _harness.RoomService.SetConnectionStateAsync(human, isConnected: true, connectionId: "c1");
        await _harness.RoomService.SetConnectionStateAsync(human, isConnected: false, connectionId: "c1");

        _harness.Time.Advance(TimeSpan.FromMinutes(_harness.GameSettings.DisconnectedPlayerGraceMinutes + 1));
        await _harness.CleanupService.CleanupAsync();

        _harness.Db.ChangeTracker.Clear();
        _harness.Db.GameRooms.Single(r => r.Id == human.RoomId).Status.Should().Be(RoomStatus.Abandoned);
        _harness.Notifier.LastMatchEnded.Should().BeNull();
    }

    [Fact]
    public async Task Izleyici_tokeni_oyuncu_kimligi_tasimaz_ve_snapshot_doner()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 1));
        await _harness.RoomService.JoinRoomAsync(created.RoomCode, new JoinRoomRequest("Fatma"));

        var watch = await _harness.RoomService.WatchRoomAsync(created.RoomCode.ToLowerInvariant());

        watch.RoomState.Players.Should().HaveCount(2);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(watch.SpectatorToken);
        jwt.Claims.Should().Contain(c => c.Type == "access" && c.Value == "spectator");
        jwt.Claims.Should().NotContain(c => c.Type == "playerId" || c.Type == "seat" || c.Type == "sessionId");
    }
}
