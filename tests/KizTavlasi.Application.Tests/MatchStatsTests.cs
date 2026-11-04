using FluentAssertions;
using KizTavlasi.Application.Dtos;
using KizTavlasi.Application.Tests.TestInfrastructure;
using KizTavlasi.Domain;

namespace KizTavlasi.Application.Tests;

/// <summary>Maç sonu "Şans vs. Strateji" analitiği ve kırılma anı.</summary>
[Collection("Database")]
public class MatchStatsTests : IDisposable
{
    private readonly TestHarness _harness;

    public MatchStatsTests(SqlTestDatabase database)
    {
        _harness = new TestHarness(database);
    }

    public void Dispose() => _harness.Dispose();

    private MatchStatsService Stats => new(_harness.Db, _harness.RoomService);

    private static PlayerBoard ToBoard(PlayerBoardDto dto) =>
        new(dto.Points.Select(p => new PointState(p.PointNumber, p.BackCount, p.FrontCount)).ToList(), dto.CollectedCount);

    /// <summary>
    /// Kuyruktaki zarlarla, hamleleri Usta stratejisiyle oynar; maç bitene veya
    /// <paramref name="maxTurnNumber"/> aşılana kadar sürer.
    /// </summary>
    private async Task<RoomSnapshotDto> PlayQueuedAsync(
        PlayerSession host, PlayerSession guest, RoomSnapshotDto snapshot, int maxTurnNumber = int.MaxValue)
    {
        var guard = 0;
        while (snapshot.Match!.Status == "InProgress"
               && snapshot.Match.CurrentRound!.TurnNumber <= maxTurnNumber
               && guard++ < 200)
        {
            var round = snapshot.Match.CurrentRound;
            var current = round.CurrentPlayerId == host.PlayerId ? host : guest;
            if (round.PendingDice.Count == 0 && round.PendingBonusPicks == 0)
            {
                snapshot = (await _harness.GameService.RollDiceAsync(current, Guid.NewGuid(), snapshot.StateVersion)).Snapshot;
                continue;
            }

            var board = ToBoard(round.Boards.Single(b => b.PlayerId == current.PlayerId));
            var point = BotStrategy.ChooseMove(board, round.PendingDice, round.PendingBonusPicks, BotDifficulty.Master, new Random(1))!.Value;
            snapshot = await _harness.GameService.PlayMoveAsync(current, point, snapshot.StateVersion, commandId: Guid.NewGuid());
        }
        return snapshot;
    }

    private async Task<(PlayerSession Host, PlayerSession Guest)> CreateFullRoomAsync()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 1));
        var joined = await _harness.RoomService.JoinRoomAsync(created.RoomCode, new JoinRoomRequest("Fatma"));
        return (_harness.SessionFor(created.PlayerToken), _harness.SessionFor(joined.PlayerToken));
    }

    [Fact]
    public async Task Ust_uste_cift_ayni_atista_asama_gecisi_ve_mars_istatistiklere_yansir()
    {
        var (host, guest) = await CreateFullRoomAsync();

        // Başlangıç 6-1 (Ayşe başlar). Ayşe 6-6: 12 hak = 9 indirme + 3 toplama (aynı atışta aşama geçişi).
        // Fatma 1-2: iki indirme. Ayşe yine 6-6: kalan 12 pulu toplar; Fatma hâlâ indirmede → MARS.
        _harness.Dice.Enqueue(6, 1, 6, 6, 1, 2, 6, 6);
        var snapshot = (await _harness.GameService.StartMatchAsync(host, Guid.NewGuid())).Snapshot;
        snapshot = await PlayQueuedAsync(host, guest, snapshot);

        snapshot.Match!.Status.Should().Be("Completed");
        snapshot.Match.WinnerPlayerId.Should().Be(host.PlayerId);

        var stats = await Stats.GetCurrentMatchStatsAsync(host.RoomId);

        stats.RoundsPlayed.Should().Be(1);
        stats.TotalRolls.Should().Be(3);

        var ayse = stats.Players.Single(p => p.PlayerId == host.PlayerId);
        ayse.Rolls.Should().Be(2);
        ayse.AverageRoll.Should().Be(12);
        ayse.Doubles.Should().Be(2);
        ayse.LongestDoubleStreak.Should().Be(2);
        ayse.WastedDice.Should().Be(0);
        ayse.LastBringDownTurn.Should().Be(1, "indirmeyi ilk atışında bitirdi");
        ayse.MarsWins.Should().Be(1);
        ayse.Points.Should().Be(2);

        var fatma = stats.Players.Single(p => p.PlayerId == guest.PlayerId);
        fatma.Rolls.Should().Be(1);
        fatma.AverageRoll.Should().Be(3);
        fatma.Doubles.Should().Be(0);
        fatma.LastBringDownTurn.Should().BeNull("indirme aşamasını bitiremedi");
        fatma.MarsWins.Should().Be(0);
        fatma.Points.Should().Be(0);

        stats.Highlight.Should().NotBeNull();
        stats.Highlight!.Kind.Should().Be("Mars", "MARS diğer kırılma anlarından önceliklidir");
        stats.Highlight.PlayerId.Should().Be(host.PlayerId);
        stats.Highlight.Text.Should().Contain("Ayşe").And.Contain("MARS");
    }

    [Fact]
    public async Task Bosa_giden_zarlar_sayilir_ve_ust_uste_cift_kirilma_ani_olur()
    {
        var (host, guest) = await CreateFullRoomAsync();

        // Ayşe başlar; 1-1: 1. haneden 1 indirme zorunlu, sonra 1 serbest hak. Ardından Fatma 3-3,
        // sonra Ayşe tekrar 1-1: 1. hanede inecek pul kalmadığı için el tamamen boşa gider (2 zar).
        _harness.Dice.Enqueue(6, 1, 1, 1, 3, 3, 1, 1);
        var snapshot = (await _harness.GameService.StartMatchAsync(host, Guid.NewGuid())).Snapshot;
        await PlayQueuedAsync(host, guest, snapshot, maxTurnNumber: 3);

        var stats = await Stats.GetCurrentMatchStatsAsync(host.RoomId);
        var ayse = stats.Players.Single(p => p.PlayerId == host.PlayerId);
        ayse.Rolls.Should().Be(2);
        ayse.WastedDice.Should().Be(2, "ikinci 1-1 atışında çift hanesi oynanamadığı için iki zar da boşa gitti");
        ayse.LongestDoubleStreak.Should().Be(2);

        stats.Highlight!.Kind.Should().Be("DoubleStreak");
        stats.Highlight.Text.Should().Contain("üst üste 2 çift");
    }

    [Fact]
    public async Task Mac_yoksa_istatistik_istegi_reddedilir()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 1));
        var host = _harness.SessionFor(created.PlayerToken);

        var act = () => Stats.GetCurrentMatchStatsAsync(host.RoomId);

        (await act.Should().ThrowAsync<GameDomainException>()).Which.Code.Should().Be(DomainErrorCodes.MatchNotActive);
    }
}
