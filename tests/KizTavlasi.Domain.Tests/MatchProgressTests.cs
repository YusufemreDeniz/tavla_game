using FluentAssertions;
using KizTavlasi.Domain;

namespace KizTavlasi.Domain.Tests;

public class MatchProgressTests
{
    private readonly GameEngine _engine = new();

    [Theory]
    [InlineData(1, 1)]
    [InlineData(3, 2)]
    [InlineData(5, 3)]
    public void Mac_formatina_gore_gerekli_puan_dogru_hesaplanir(int bestOf, int expectedPoints)
    {
        GameEngine.RequiredWinsFor(bestOf).Should().Be(expectedPoints);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    [InlineData(4)]
    [InlineData(7)]
    public void Gecersiz_mac_formati_reddedilir(int bestOf)
    {
        var act = () => GameEngine.RequiredWinsFor(bestOf);

        act.Should().Throw<GameDomainException>()
            .Which.Code.Should().Be(DomainErrorCodes.InvalidCommand);
    }

    [Fact]
    public void Normal_el_galibiyeti_bir_puan_kazandirir()
    {
        var progress = _engine.EvaluateRoundEnd(winnerSeat: 1, isMars: false, player1Score: 0, player2Score: 0, requiredWins: 2);

        progress.Player1Score.Should().Be(1);
        progress.PointsAwarded.Should().Be(1);
        progress.IsMars.Should().BeFalse();
        progress.MatchWinnerSeat.Should().BeNull();
    }

    [Fact]
    public void Mars_iki_puan_kazandirir()
    {
        var progress = _engine.EvaluateRoundEnd(winnerSeat: 1, isMars: true, player1Score: 0, player2Score: 0, requiredWins: 3);

        progress.Player1Score.Should().Be(2);
        progress.PointsAwarded.Should().Be(2);
        progress.IsMars.Should().BeTrue();
    }

    [Fact]
    public void Mars_ile_gerekli_puana_ulasan_maci_kazanir()
    {
        // Best of 3 (2 puan gerekli): tek mars maçı bitirir.
        var progress = _engine.EvaluateRoundEnd(winnerSeat: 2, isMars: true, player1Score: 0, player2Score: 0, requiredWins: 2);

        progress.Player2Score.Should().Be(2);
        progress.MatchWinnerSeat.Should().Be(2);
    }

    [Fact]
    public void MarsScoresDouble_kapaliyken_mars_tek_puan_sayilir()
    {
        var engine = new GameEngine(new GameRulesOptions { MarsScoresDouble = false });

        var progress = engine.EvaluateRoundEnd(winnerSeat: 1, isMars: true, player1Score: 0, player2Score: 0, requiredWins: 2);

        progress.Player1Score.Should().Be(1);
        progress.PointsAwarded.Should().Be(1);
    }

    [Fact]
    public void Tek_el_macinda_ilk_eli_kazanan_maci_kazanir()
    {
        var progress = _engine.EvaluateRoundEnd(winnerSeat: 1, isMars: false, player1Score: 0, player2Score: 0, requiredWins: 1);

        progress.MatchWinnerSeat.Should().Be(1);
        progress.NextRoundStarterSeat.Should().BeNull();
    }

    [Fact]
    public void Best_of_3_macinda_iki_puan_toplayan_maci_kazanir()
    {
        var afterRound1 = _engine.EvaluateRoundEnd(1, false, 0, 0, requiredWins: 2);
        afterRound1.MatchWinnerSeat.Should().BeNull();

        var afterRound2 = _engine.EvaluateRoundEnd(2, false, afterRound1.Player1Score, afterRound1.Player2Score, 2);
        afterRound2.MatchWinnerSeat.Should().BeNull();

        var afterRound3 = _engine.EvaluateRoundEnd(1, false, afterRound2.Player1Score, afterRound2.Player2Score, 2);
        afterRound3.MatchWinnerSeat.Should().Be(1);
        afterRound3.Player1Score.Should().Be(2);
    }

    [Fact]
    public void Best_of_5_macinda_uc_puan_toplayan_maci_kazanir()
    {
        var progress = _engine.EvaluateRoundEnd(2, false, player1Score: 1, player2Score: 2, requiredWins: 3);

        progress.Player2Score.Should().Be(3);
        progress.MatchWinnerSeat.Should().Be(2);
    }

    [Fact]
    public void Mac_bitmediyse_sonraki_ele_kaybeden_baslar()
    {
        var progress = _engine.EvaluateRoundEnd(winnerSeat: 1, isMars: false, player1Score: 0, player2Score: 0, requiredWins: 2);

        progress.NextRoundStarterSeat.Should().Be(2);
    }

    [Fact]
    public void LoserStartsNextRound_kapaliyken_kazanan_baslar()
    {
        var engine = new GameEngine(new GameRulesOptions { LoserStartsNextRound = false });

        var progress = engine.EvaluateRoundEnd(winnerSeat: 1, isMars: false, player1Score: 0, player2Score: 0, requiredWins: 2);

        progress.NextRoundStarterSeat.Should().Be(1);
    }
}
