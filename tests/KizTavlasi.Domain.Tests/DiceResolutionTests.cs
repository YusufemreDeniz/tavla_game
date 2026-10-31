using FluentAssertions;
using KizTavlasi.Domain;

namespace KizTavlasi.Domain.Tests;

public class DiceResolutionTests
{
    private static PlayerBoard BoardWith(params (int Point, int Back, int Front)[] points)
    {
        var map = points.ToDictionary(p => p.Point, p => p);
        var list = new List<PointState>();
        var onBoard = 0;
        for (var n = 1; n <= 6; n++)
        {
            if (map.TryGetValue(n, out var p))
            {
                list.Add(new PointState(n, p.Back, p.Front));
                onBoard += p.Back + p.Front;
            }
            else
            {
                list.Add(new PointState(n, 0, 0));
            }
        }
        return new PlayerBoard(list, PlayerBoard.TotalPieces - onBoard);
    }

    // ---------- ZAR DEĞERLENDİRME (ResolveRoll) ----------

    [Fact]
    public void Normal_atista_oynanabilir_zarlar_listelenir_tahta_degismez()
    {
        var engine = new GameEngine();
        var board = new PlayerBoard();

        var outcome = engine.ResolveRoll(board, DiceResult.Create(6, 3));

        outcome.PlayableDice.Should().Equal(6, 3);
        outcome.WastedSteps.Should().BeEmpty();
        outcome.FreePicksGranted.Should().Be(0);
        outcome.TurnWasted.Should().BeFalse();
        board.GetPoint(6).FrontCount.Should().Be(0, "hamleyi oyuncu yapar; atış tahtayı değiştirmez");
    }

    [Fact]
    public void Indirme_asamasinda_son_pul_kalan_hanenin_zari_bosa_gider()
    {
        var engine = new GameEngine();
        var board = BoardWith((3, 1, 1), (6, 3, 0), (5, 3, 0), (4, 3, 0), (1, 2, 0), (2, 2, 0));

        var outcome = engine.ResolveRoll(board, DiceResult.Create(3, 6));

        outcome.PlayableDice.Should().Equal(6);
        outcome.WastedSteps.Should().ContainSingle(s => s.Die == 3 && s.Action == DiceStepAction.Wasted);
    }

    [Fact]
    public void Son_indirme_kaldiginda_normal_zar_atisi_asama_gecisiyle_ikinci_zari_toplamada_oynatir()
    {
        var engine = new GameEngine();
        // Yalnızca 6. hanede 1 indirme hakkı kaldı (diğer haneler 1'e düştü).
        var board = BoardWith((6, 2, 1), (5, 1, 2), (4, 1, 2), (1, 1, 1), (2, 1, 1), (3, 1, 1));

        // 3 ve 6 atıldı: 6 son indirmeyi tamamlar, 3 ise toplamaya geçerek oynanabilir olur!
        var outcome = engine.ResolveRoll(board, DiceResult.Create(3, 6));

        outcome.TurnWasted.Should().BeFalse();
        outcome.WastedSteps.Should().BeEmpty();
        outcome.PlayableDice.Should().Equal([6, 3], "önce 6 indirmeyi tamamlar, ardından 3 toplamada kullanılır");
    }

    [Fact]
    public void Iki_zar_da_oynanamazsa_el_bosa_gider()
    {
        var engine = new GameEngine();
        // 3 ve 5 haneleri son pulda; ikisi de oynanamaz.
        var board = BoardWith((3, 1, 1), (5, 1, 2), (6, 3, 0), (4, 3, 0), (1, 2, 0), (2, 2, 0));

        var outcome = engine.ResolveRoll(board, DiceResult.Create(3, 5));

        outcome.PlayableDice.Should().BeEmpty();
        outcome.TurnWasted.Should().BeTrue();
    }

    [Fact]
    public void Toplama_asamasinda_bos_hanenin_zari_bosa_gider()
    {
        var engine = new GameEngine();
        var board = BoardWith((6, 0, 0), (5, 1, 2), (4, 1, 2), (1, 1, 1), (2, 1, 1), (3, 0, 2));

        var outcome = engine.ResolveRoll(board, DiceResult.Create(6, 5));

        outcome.PlayableDice.Should().Equal(5);
        outcome.WastedSteps.Should().ContainSingle(s => s.Die == 6);
    }

    // ---------- ÇİFT ZAR = 2×ZAR HAMLE (HER İKİ AŞAMADA) ----------

    [Fact]
    public void Indirme_asamasinda_cift_5_toplam_10_hamle_hakki_verir()
    {
        var engine = new GameEngine();
        var board = new PlayerBoard();

        var outcome = engine.ResolveRoll(board, DiceResult.Create(5, 5));

        // İlk hamle 5. haneden zorunlu; kalan 9 hak serbest seçim → toplam 10.
        outcome.PlayableDice.Should().Equal(5);
        outcome.FreePicksGranted.Should().Be(9);
        outcome.TurnWasted.Should().BeFalse();
    }

    [Fact]
    public void Toplama_asamasinda_cift_3_toplam_6_hamle_hakki_verir()
    {
        var engine = new GameEngine();
        var board = BoardWith((3, 1, 1), (6, 1, 2), (5, 1, 2), (4, 1, 2), (1, 1, 1), (2, 1, 1));

        var outcome = engine.ResolveRoll(board, DiceResult.Create(3, 3));

        outcome.PlayableDice.Should().Equal(3);
        outcome.FreePicksGranted.Should().Be(5);
    }

    [Fact]
    public void Cift_atilan_hane_oynanamiyorsa_el_tamamen_bosa_gider()
    {
        var engine = new GameEngine();
        // Toplama aşaması; 3. hane boş.
        var board = BoardWith((3, 0, 0), (6, 1, 2), (5, 1, 2), (4, 1, 2), (1, 1, 1), (2, 1, 2));

        var outcome = engine.ResolveRoll(board, DiceResult.Create(3, 3));

        outcome.TurnWasted.Should().BeTrue();
        outcome.PlayableDice.Should().BeEmpty();
        outcome.FreePicksGranted.Should().Be(0);
        outcome.WastedSteps.Should().HaveCount(2);
    }

    [Fact]
    public void Indirmede_cift_atilan_hanede_son_pul_kaldiysa_el_bosa_gider()
    {
        var engine = new GameEngine();
        var board = BoardWith((5, 1, 2), (6, 3, 0), (4, 3, 0), (1, 2, 0), (2, 2, 0), (3, 2, 0));

        var outcome = engine.ResolveRoll(board, DiceResult.Create(5, 5));

        outcome.TurnWasted.Should().BeTrue();
    }

    // ---------- MANUEL HAMLE (PlayMove) ----------

    [Fact]
    public void Indirme_hamlesi_haneden_bir_pul_indirir()
    {
        var engine = new GameEngine();
        var board = new PlayerBoard();

        var step = engine.PlayMove(board, 6);

        step.Action.Should().Be(DiceStepAction.Advance);
        step.SourcePoint.Should().Be(6);
        board.GetPoint(6).BackCount.Should().Be(2);
        board.GetPoint(6).FrontCount.Should().Be(1);
    }

    [Fact]
    public void Son_pul_kalan_haneden_indirme_yapilamaz()
    {
        var engine = new GameEngine();
        var board = BoardWith((3, 1, 1), (6, 3, 0), (5, 3, 0), (4, 3, 0), (1, 2, 0), (2, 2, 0));

        var act = () => engine.PlayMove(board, 3);

        act.Should().Throw<GameDomainException>()
            .Which.Code.Should().Be(DomainErrorCodes.InvalidCommand);
    }

    [Fact]
    public void Toplama_hamlesi_once_inen_pulu_alir()
    {
        var engine = new GameEngine();
        var board = BoardWith((6, 1, 2), (5, 1, 2), (4, 1, 2), (1, 1, 1), (2, 1, 1), (3, 1, 1));

        var step = engine.PlayMove(board, 6);

        step.Action.Should().Be(DiceStepAction.Collect);
        board.GetPoint(6).FrontCount.Should().Be(1);
        board.GetPoint(6).BackCount.Should().Be(1);
        board.CollectedCount.Should().Be(1);
    }

    [Fact]
    public void Toplamada_bos_haneden_hamle_yapilamaz()
    {
        var engine = new GameEngine();
        var board = BoardWith((6, 0, 0), (5, 1, 2), (4, 1, 2), (1, 1, 2), (2, 1, 2), (3, 1, 1));

        var act = () => engine.PlayMove(board, 6);

        act.Should().Throw<GameDomainException>()
            .Which.Code.Should().Be(DomainErrorCodes.InvalidCommand);
    }

    [Fact]
    public void Toplam_indirilebilecek_pul_sayisi_dokuzdur()
    {
        var engine = new GameEngine();
        var board = new PlayerBoard();
        var brings = 0;

        for (var n = 1; n <= 6; n++)
        {
            while (board.CanBringDown(n))
            {
                engine.PlayMove(board, n);
                brings++;
            }
        }

        brings.Should().Be(9);
        board.IsCollecting.Should().BeTrue();
    }

    [Fact]
    public void Indirme_bitince_hamleler_toplamaya_doner()
    {
        var engine = new GameEngine();
        // Yalnızca 6. hanede bir indirme kaldı.
        var board = BoardWith((6, 2, 1), (5, 1, 2), (4, 1, 2), (1, 1, 1), (2, 1, 1), (3, 1, 1));

        var bringStep = engine.PlayMove(board, 6);
        bringStep.Action.Should().Be(DiceStepAction.Advance);
        board.IsCollecting.Should().BeTrue();

        var collectStep = engine.PlayMove(board, 6);
        collectStep.Action.Should().Be(DiceStepAction.Collect);
        board.CollectedCount.Should().Be(1);
    }

    [Fact]
    public void Son_pul_toplaninca_el_biter_ve_hamle_yapilamaz()
    {
        var engine = new GameEngine();
        var board = BoardWith((2, 0, 1));
        board.CollectedCount.Should().Be(14);

        engine.PlayMove(board, 2);

        board.IsCompleted.Should().BeTrue();
        var act = () => engine.PlayMove(board, 2);
        act.Should().Throw<GameDomainException>()
            .Which.Code.Should().Be(DomainErrorCodes.RoundAlreadyCompleted);
    }

    [Fact]
    public void El_bittikten_sonra_zar_atilamaz()
    {
        var engine = new GameEngine();
        var board = BoardWith((2, 0, 1));
        engine.PlayMove(board, 2);

        var act = () => engine.ResolveRoll(board, DiceResult.Create(3, 4));

        act.Should().Throw<GameDomainException>()
            .Which.Code.Should().Be(DomainErrorCodes.RoundAlreadyCompleted);
    }

    [Fact]
    public void AnyMoveAvailable_hamle_kalmayinca_false_doner()
    {
        var board = BoardWith((2, 0, 1));
        GameEngine.AnyMoveAvailable(board).Should().BeTrue();

        new GameEngine().PlayMove(board, 2);
        GameEngine.AnyMoveAvailable(board).Should().BeFalse();
    }

    [Fact]
    public void Tum_zar_degerleri_1_6_araliginda_olmali()
    {
        var act1 = () => DiceResult.Create(0, 3);
        var act2 = () => DiceResult.Create(3, 7);

        act1.Should().Throw<ArgumentOutOfRangeException>();
        act2.Should().Throw<ArgumentOutOfRangeException>();
    }
}
