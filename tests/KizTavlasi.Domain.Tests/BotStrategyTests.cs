using FluentAssertions;
using KizTavlasi.Domain;

namespace KizTavlasi.Domain.Tests;

public class BotStrategyTests
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

    [Fact]
    public void Bekleyen_zar_varsa_once_o_zarin_hanesi_oynanir()
    {
        var move = BotStrategy.ChooseMove(new PlayerBoard(), [3, 5], 0, BotDifficulty.Master, new Random(1));

        move.Should().Be(3);
    }

    [Fact]
    public void Asama_gecisinde_once_son_indirmeyi_yapan_zar_oynanir()
    {
        // Yalnızca 6. hanede bir indirme kaldı; 3 zarı ancak toplamaya geçince oynanabilir.
        var board = BoardWith((1, 1, 1), (2, 1, 1), (3, 1, 1), (4, 1, 2), (5, 1, 2), (6, 2, 1));

        var move = BotStrategy.ChooseMove(board, [3, 6], 0, BotDifficulty.Master, new Random(1));

        move.Should().Be(6);
    }

    [Fact]
    public void Usta_indirmede_en_cok_indirilecek_pulu_olan_haneyi_secer()
    {
        var board = BoardWith((1, 2, 0), (2, 2, 0), (3, 2, 0), (4, 2, 1), (5, 3, 0), (6, 2, 1));

        var move = BotStrategy.ChooseMove(board, [], 3, BotDifficulty.Master, new Random(1));

        move.Should().Be(5, "5. hanede 2 indirme kaldı; diğerlerinde 1");
    }

    [Fact]
    public void Usta_baslangicta_ust_haneleri_onceliklendirir()
    {
        var move = BotStrategy.ChooseMove(new PlayerBoard(), [], 5, BotDifficulty.Master, new Random(1));

        move.Should().Be(6, "4-5-6. hanelerde ikişer indirme var; eşitlikte büyük hane seçilir");
    }

    [Fact]
    public void Usta_toplamada_tek_pullu_haneleri_bosaltmaz_en_kalabalik_haneden_toplar()
    {
        var board = BoardWith((1, 1, 0), (2, 1, 1), (3, 0, 0), (4, 1, 2), (5, 1, 0), (6, 0, 0));

        var move = BotStrategy.ChooseMove(board, [], 2, BotDifficulty.Master, new Random(1));

        move.Should().Be(4);
    }

    [Fact]
    public void Kolay_yalnizca_gecerli_haneler_arasindan_secer()
    {
        var board = BoardWith((1, 1, 1), (2, 1, 0), (3, 2, 0), (4, 1, 2), (5, 2, 1), (6, 1, 0));
        var random = new Random(42);

        var picks = Enumerable.Range(0, 200)
            .Select(_ => BotStrategy.ChooseMove(board, [], 1, BotDifficulty.Easy, random))
            .ToList();

        picks.Should().OnlyContain(p => p == 3 || p == 5, "indirme aşamasında yalnızca 3 ve 5'te inecek pul var");
        picks.Should().Contain(3).And.Contain(5);
    }

    [Fact]
    public void Kolay_ayni_tohumla_ayni_secimi_yapar()
    {
        var first = BotStrategy.ChooseMove(new PlayerBoard(), [], 3, BotDifficulty.Easy, new Random(7));
        var second = BotStrategy.ChooseMove(new PlayerBoard(), [], 3, BotDifficulty.Easy, new Random(7));

        first.Should().Be(second);
    }

    [Fact]
    public void Oynanacak_hamle_yoksa_null_doner()
    {
        BotStrategy.ChooseMove(new PlayerBoard(), [], 0, BotDifficulty.Master, new Random(1)).Should().BeNull();

        var board = BoardWith((1, 1, 0), (2, 1, 0), (3, 1, 0), (4, 1, 0), (5, 1, 0), (6, 1, 0));
        BotStrategy.ChooseMove(board, [], 0, BotDifficulty.Master, new Random(1)).Should().BeNull();
    }

    [Theory]
    [InlineData(BotDifficulty.Easy)]
    [InlineData(BotDifficulty.Master)]
    public void Bot_secimleri_her_zaman_motor_tarafindan_kabul_edilir_ve_eli_bitirir(BotDifficulty difficulty)
    {
        var engine = new GameEngine();
        var board = new PlayerBoard();
        var random = new Random(2026);
        var dice = new Random(99);

        for (var turn = 0; turn < 500 && !board.IsCompleted; turn++)
        {
            var outcome = engine.ResolveRoll(board, DiceResult.Create(dice.Next(1, 7), dice.Next(1, 7)));
            var pending = outcome.PlayableDice.ToList();
            var picks = outcome.FreePicksGranted;

            while (!board.IsCompleted)
            {
                var move = BotStrategy.ChooseMove(board, pending, picks, difficulty, random);
                if (move is null)
                {
                    break;
                }

                if (pending.Contains(move.Value))
                {
                    pending.Remove(move.Value);
                }
                else
                {
                    picks.Should().BeGreaterThan(0);
                    picks--;
                }

                engine.PlayMove(board, move.Value); // geçersiz seçim olsaydı GameDomainException fırlatırdı
                pending.RemoveAll(d => !GameEngine.CanPlay(board, d));
            }
        }

        board.IsCompleted.Should().BeTrue();
    }

    [Fact]
    public void Usta_bos_giden_zar_sayisinda_kolaydan_daha_iyi_veya_esittir()
    {
        static int WastedDice(BotDifficulty difficulty)
        {
            var engine = new GameEngine();
            var wasted = 0;
            for (var game = 0; game < 200; game++)
            {
                var board = new PlayerBoard();
                var dice = new Random(1000 + game); // her iki seviye aynı zar dizisini görür
                var random = new Random(game);
                while (!board.IsCompleted)
                {
                    var outcome = engine.ResolveRoll(board, DiceResult.Create(dice.Next(1, 7), dice.Next(1, 7)));
                    wasted += outcome.WastedSteps.Count;
                    var pending = outcome.PlayableDice.ToList();
                    var picks = outcome.FreePicksGranted;
                    while (BotStrategy.ChooseMove(board, pending, picks, difficulty, random) is int move)
                    {
                        if (!pending.Remove(move))
                        {
                            picks--;
                        }
                        engine.PlayMove(board, move);
                        wasted += pending.RemoveAll(d => !board.IsCompleted && !GameEngine.CanPlay(board, d));
                    }
                }
            }
            return wasted;
        }

        WastedDice(BotDifficulty.Master).Should().BeLessThanOrEqualTo(WastedDice(BotDifficulty.Easy));
    }
}
