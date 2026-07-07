using FluentAssertions;
using KizTavlasi.Domain;

namespace KizTavlasi.Domain.Tests;

public class StartingRollTests
{
    private readonly GameEngine _engine = new();

    [Fact]
    public void Yuksek_zar_atan_oyuncu_baslar()
    {
        var dice = new FakeDiceService(6, 2);

        var result = _engine.ResolveStartingRoll(dice);

        result.StartingSeat.Should().Be(1);
        result.Attempts.Should().HaveCount(1);
        result.Attempts[0].Player1Die.Should().Be(6);
        result.Attempts[0].Player2Die.Should().Be(2);
    }

    [Fact]
    public void Ikinci_oyuncu_yuksek_atarsa_ikinci_oyuncu_baslar()
    {
        var dice = new FakeDiceService(2, 5);

        var result = _engine.ResolveStartingRoll(dice);

        result.StartingSeat.Should().Be(2);
    }

    [Fact]
    public void Baslangic_zarlari_esitse_yeniden_atilir()
    {
        var dice = new FakeDiceService(4, 4, 3, 3, 6, 1);

        var result = _engine.ResolveStartingRoll(dice);

        result.Attempts.Should().HaveCount(3);
        result.Attempts[0].IsTie.Should().BeTrue();
        result.Attempts[1].IsTie.Should().BeTrue();
        result.Attempts[2].IsTie.Should().BeFalse();
        result.StartingSeat.Should().Be(1);
    }
}
