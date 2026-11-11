namespace KizTavlasi.Domain;

/// <summary>Yapay zekâ rakibinin zorluk seviyesi.</summary>
public enum BotDifficulty
{
    /// <summary>Geçerli hamleler arasından rastgele seçer.</summary>
    Easy = 1,

    /// <summary>Gelecekteki zarların boşa gitme olasılığını en aza indiren sezgisel seçim.</summary>
    Master = 2
}

/// <summary>
/// Bot hamle seçimi. Kural hesaplamaz: yalnızca <see cref="GameEngine.CanPlay"/> ile
/// oynanabilir olduğu doğrulanan haneler arasından seçim yapar; hamleyi yine
/// <see cref="GameEngine.PlayMove"/> uygular. Saf ve deterministiktir
/// (Kolay seviyede rastgelelik çağıranın verdiği <see cref="Random"/> ile gelir).
///
/// Neden bu sezgisel? Kız Tavlası'nda bir zar, yalnızca kendi hanesi oynanabilirse
/// işe yarar. Bu yüzden serbest seçimlerde mümkün olduğunca ÇOK hanenin oynanabilir
/// kalması gelecekteki boşa giden zarları azaltır:
/// - İndirme: en çok indirilecek pulu kalan haneden indir (başlangıçta 4-5-6. haneler).
/// - Toplama: en kalabalık haneden topla; tek pullu haneleri boşaltma.
/// </summary>
public static class BotStrategy
{
    /// <summary>Sıradaki hamle için oynanacak haneyi seçer.</summary>
    /// <param name="board">Botun güncel tahtası.</param>
    /// <param name="pendingDice">Oynanmayı bekleyen zarlar (zorunlu hamleler).</param>
    /// <param name="pendingBonusPicks">Çift zar serbest hamle hakkı.</param>
    /// <returns>Oynanacak hane; oynanacak hamle yoksa <c>null</c>.</returns>
    public static int? ChooseMove(
        PlayerBoard board,
        IReadOnlyList<int> pendingDice,
        int pendingBonusPicks,
        BotDifficulty difficulty,
        Random random)
    {
        if (board.IsCompleted)
        {
            return null;
        }

        // Zorunlu zarlar önce: şu an oynanabilir olan ilk zar (aşama geçişinde sıra önemlidir:
        // son indirmeyi yapan zar önce oynanınca diğer zar toplamada açılır).
        if (pendingDice.Count > 0)
        {
            foreach (var die in pendingDice)
            {
                if (GameEngine.CanPlay(board, die))
                {
                    return die;
                }
            }
            return null;
        }

        if (pendingBonusPicks <= 0)
        {
            return null;
        }

        var candidates = Enumerable.Range(1, PlayerBoard.PointCount)
            .Where(n => GameEngine.CanPlay(board, n))
            .ToList();
        if (candidates.Count == 0)
        {
            return null;
        }

        if (difficulty == BotDifficulty.Easy)
        {
            return candidates[random.Next(candidates.Count)];
        }

        return candidates
            .OrderByDescending(n => Score(board, n))
            .ThenByDescending(n => n)
            .First();
    }

    /// <summary>
    /// Bir haneden hamle yapmanın değeri: hamleden sonra o hanede kalacak "yedek" hamle sayısı.
    /// Yüksek olan hane, oynandıktan sonra da oynanabilir kalır.
    /// </summary>
    private static int Score(PlayerBoard board, int pointNumber)
    {
        var point = board.GetPoint(pointNumber);
        return board.IsCollecting
            ? point.BackCount + point.FrontCount
            : point.BackCount - 1;
    }
}
