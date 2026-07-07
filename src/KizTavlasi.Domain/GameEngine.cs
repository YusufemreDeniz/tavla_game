namespace KizTavlasi.Domain;

/// <summary>
/// Kız Tavlası kural motoru. Durum değiştiren tek yer burasıdır;
/// API, Hub ve istemci kural hesaplamaz.
///
/// Akış:
/// 1. Oyuncu zar atar; sunucu hangi zarların OYNANABİLİR olduğunu belirler.
///    Oynanamayan zarlar anında boşa gider.
/// 2. Hamleleri oyuncu kendisi yapar: haneye dokunur, sunucu hamleyi uygular.
///    - İNDİRME aşaması: zarın hanesinden bir pul indirilir (son pul inmez).
///    - TOPLAMA aşaması: zarın hanesinden bir pul toplanır.
/// 3. ÇİFT ZAR (her iki aşamada): toplam 2×zar hamle hakkı verir.
///    İlk hamle çift atılan haneden yapılmak zorundadır; o hane oynanamıyorsa
///    el tamamen boşa gider. Kalan haklar oyuncunun seçtiği hanelerden harcanır.
/// 15 pulu ilk toplayan eli kazanır; rakip hâlâ indirme aşamasındaysa MARS (2 puan).
/// </summary>
public sealed class GameEngine
{
    private readonly GameRulesOptions _options;

    public GameEngine(GameRulesOptions? options = null)
    {
        _options = options ?? GameRulesOptions.Default;
    }

    public GameRulesOptions Options => _options;

    /// <summary>Zarın gösterdiği hane şu an oynanabilir mi?</summary>
    public static bool CanPlay(PlayerBoard board, int pointNumber)
    {
        return board.IsCollecting
            ? board.TotalAt(pointNumber) > 0
            : board.CanBringDown(pointNumber);
    }

    /// <summary>
    /// Zar atışını değerlendirir; tahtayı DEĞİŞTİRMEZ.
    /// Oynanabilir zarları ve boşa giden zarları döndürür; hamleleri oyuncu yapar.
    /// </summary>
    public RollOutcome ResolveRoll(PlayerBoard board, DiceResult dice)
    {
        if (board.IsCompleted)
        {
            throw new GameDomainException(
                DomainErrorCodes.RoundAlreadyCompleted,
                "El tamamlandı; yeni zar çözümlenemez.");
        }

        if (dice.IsDouble && _options.DoubleGrantsBonusCollects)
        {
            if (CanPlay(board, dice.Die1))
            {
                // 2×zar hamle: ilki çift atılan haneden (zorunlu), kalanı serbest seçim.
                return new RollOutcome(dice, [dice.Die1], [], dice.Die1 * 2 - 1, TurnWasted: false);
            }

            return new RollOutcome(
                dice,
                [],
                [WastedStep(board, dice.Die1), WastedStep(board, dice.Die2)],
                0,
                TurnWasted: true);
        }

        var playable = new List<int>();
        var wasted = new List<DiceStep>();
        foreach (var die in new[] { dice.Die1, dice.Die2 })
        {
            if (CanPlay(board, die))
            {
                playable.Add(die);
            }
            else
            {
                wasted.Add(WastedStep(board, die));
            }
        }

        return new RollOutcome(dice, playable, wasted, 0, TurnWasted: playable.Count == 0);
    }

    /// <summary>
    /// Oyuncunun dokunduğu hanede tek hamle uygular:
    /// indirme aşamasında pul indirir, toplama aşamasında pul toplar.
    /// </summary>
    public DiceStep PlayMove(PlayerBoard board, int pointNumber)
    {
        if (board.IsCompleted)
        {
            throw new GameDomainException(
                DomainErrorCodes.RoundAlreadyCompleted,
                "El tamamlandı; hamle yapılamaz.");
        }

        if (board.IsCollecting)
        {
            if (board.TotalAt(pointNumber) == 0)
            {
                throw new GameDomainException(
                    DomainErrorCodes.InvalidCommand,
                    $"{pointNumber}. hane boş; başka bir hane seçin.");
            }
            var before = Snapshot(board, pointNumber);
            board.Collect(pointNumber);
            return new DiceStep(pointNumber, pointNumber, DiceStepAction.Collect, 1, before, Snapshot(board, pointNumber));
        }

        if (!board.CanBringDown(pointNumber))
        {
            throw new GameDomainException(
                DomainErrorCodes.InvalidCommand,
                $"{pointNumber}. hanede indirilecek pul yok (son pul inmez).");
        }

        var beforeBring = Snapshot(board, pointNumber);
        board.BringDown(pointNumber);
        return new DiceStep(pointNumber, pointNumber, DiceStepAction.Advance, 0, beforeBring, Snapshot(board, pointNumber));
    }

    /// <summary>Serbest seçim hakkı için oynanabilecek en az bir hane var mı?</summary>
    public static bool AnyMoveAvailable(PlayerBoard board)
    {
        if (board.IsCompleted)
        {
            return false;
        }
        for (var n = 1; n <= PlayerBoard.PointCount; n++)
        {
            if (CanPlay(board, n))
            {
                return true;
            }
        }
        return false;
    }

    private static DiceStep WastedStep(PlayerBoard board, int die)
    {
        var snapshot = new PointSnapshot(0, 0, board.CollectedCount);
        return new DiceStep(die, null, DiceStepAction.Wasted, 0, snapshot, snapshot);
    }

    private static PointSnapshot Snapshot(PlayerBoard board, int pointNumber)
    {
        var point = board.GetPoint(pointNumber);
        return new PointSnapshot(point.BackCount, point.FrontCount, board.CollectedCount);
    }

    /// <summary>
    /// Başlangıç zarlarını çözümler: yüksek atan başlar, eşitlikte yeniden atılır.
    /// </summary>
    public StartingRollResult ResolveStartingRoll(IDiceService diceService)
    {
        var attempts = new List<StartingRollAttempt>();
        while (true)
        {
            var die1 = diceService.RollSingle();
            var die2 = diceService.RollSingle();
            attempts.Add(new StartingRollAttempt(die1, die2));

            if (die1 != die2)
            {
                var startingSeat = die1 > die2 ? 1 : 2;
                return new StartingRollResult(attempts, startingSeat);
            }
        }
    }

    /// <summary>Maç formatı için gerekli puan (mars 2 puan sayılır).</summary>
    public static int RequiredWinsFor(int bestOf) => bestOf switch
    {
        1 => 1,
        3 => 2,
        5 => 3,
        _ => throw new GameDomainException(DomainErrorCodes.InvalidCommand, $"Geçersiz maç formatı: {bestOf}")
    };

    /// <summary>El bittiğinde maç skorunu değerlendirir. Mars 2 puan kazandırır.</summary>
    public MatchProgress EvaluateRoundEnd(int winnerSeat, bool isMars, int player1Score, int player2Score, int requiredWins)
    {
        if (winnerSeat is not (1 or 2))
        {
            throw new ArgumentOutOfRangeException(nameof(winnerSeat));
        }

        var points = isMars && _options.MarsScoresDouble ? 2 : 1;
        var newP1 = player1Score + (winnerSeat == 1 ? points : 0);
        var newP2 = player2Score + (winnerSeat == 2 ? points : 0);

        int? matchWinnerSeat = null;
        if (newP1 >= requiredWins)
        {
            matchWinnerSeat = 1;
        }
        else if (newP2 >= requiredWins)
        {
            matchWinnerSeat = 2;
        }

        int? nextRoundStarterSeat = null;
        if (matchWinnerSeat is null)
        {
            nextRoundStarterSeat = _options.LoserStartsNextRound
                ? (winnerSeat == 1 ? 2 : 1)
                : winnerSeat;
        }

        return new MatchProgress(newP1, newP2, matchWinnerSeat, nextRoundStarterSeat, points, isMars);
    }
}

/// <summary>Zar atışı değerlendirmesi: oynanabilir zarlar, boşa gidenler ve serbest haklar.</summary>
public sealed record RollOutcome(
    DiceResult Dice,
    IReadOnlyList<int> PlayableDice,
    IReadOnlyList<DiceStep> WastedSteps,
    int FreePicksGranted,
    bool TurnWasted);

/// <summary>Başlangıç zarı denemesi; eşit atışlar da listede yer alır.</summary>
public sealed record StartingRollAttempt(int Player1Die, int Player2Die)
{
    public bool IsTie => Player1Die == Player2Die;
}

public sealed record StartingRollResult(IReadOnlyList<StartingRollAttempt> Attempts, int StartingSeat);

/// <summary>El sonu skor değerlendirmesi.</summary>
public sealed record MatchProgress(
    int Player1Score,
    int Player2Score,
    int? MatchWinnerSeat,
    int? NextRoundStarterSeat,
    int PointsAwarded,
    bool IsMars);
