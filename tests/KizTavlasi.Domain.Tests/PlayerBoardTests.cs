using FluentAssertions;
using KizTavlasi.Domain;

namespace KizTavlasi.Domain.Tests;

public class PlayerBoardTests
{
    [Fact]
    public void Baslangicta_toplam_15_pul_bulunur()
    {
        var board = new PlayerBoard();

        var total = board.Points.Sum(p => p.BackCount + p.FrontCount) + board.CollectedCount;

        total.Should().Be(15);
    }

    [Theory]
    [InlineData(1, 2)]
    [InlineData(2, 2)]
    [InlineData(3, 2)]
    public void Baslangicta_1_3_kapilarinda_ikiser_pul_bulunur(int pointNumber, int expectedBack)
    {
        var board = new PlayerBoard();

        var point = board.GetPoint(pointNumber);

        point.BackCount.Should().Be(expectedBack);
        point.FrontCount.Should().Be(0);
    }

    [Theory]
    [InlineData(4, 3)]
    [InlineData(5, 3)]
    [InlineData(6, 3)]
    public void Baslangicta_4_6_kapilarinda_ucer_pul_bulunur(int pointNumber, int expectedBack)
    {
        var board = new PlayerBoard();

        var point = board.GetPoint(pointNumber);

        point.BackCount.Should().Be(expectedBack);
        point.FrontCount.Should().Be(0);
    }

    [Fact]
    public void Baslangicta_toplanan_pul_sayisi_sifirdir()
    {
        var board = new PlayerBoard();

        board.CollectedCount.Should().Be(0);
        board.IsCompleted.Should().BeFalse();
    }

    [Fact]
    public void Tutarsiz_pul_toplami_ile_board_olusturulamaz()
    {
        var points = Enumerable.Range(1, 6)
            .Select(n => new PointState(n, 1, 0))
            .ToList();

        var act = () => new PlayerBoard(points, collectedCount: 0);

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Baslangicta_oyuncu_indirme_asamasindadir()
    {
        var board = new PlayerBoard();

        board.IsCollecting.Should().BeFalse();
    }

    [Fact]
    public void Tum_haneler_son_pula_dusunce_toplama_asamasi_baslar()
    {
        var points = new List<PointState>
        {
            new(1, 1, 1), new(2, 1, 1), new(3, 1, 1),
            new(4, 1, 2), new(5, 1, 2), new(6, 1, 2),
        };
        var board = new PlayerBoard(points, collectedCount: 0);

        board.IsCollecting.Should().BeTrue();
    }
}
