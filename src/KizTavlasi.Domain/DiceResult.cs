namespace KizTavlasi.Domain;

/// <summary>İki zarın sonucu (value object).</summary>
public sealed record DiceResult(int Die1, int Die2)
{
    public bool IsDouble => Die1 == Die2;

    public static DiceResult Create(int die1, int die2)
    {
        if (die1 is < 1 or > 6 || die2 is < 1 or > 6)
        {
            throw new ArgumentOutOfRangeException(null, "Zar değerleri 1-6 aralığında olmalıdır.");
        }
        return new DiceResult(die1, die2);
    }
}

/// <summary>Zar üretimi soyutlaması: production'da kriptografik, testlerde deterministik.</summary>
public interface IDiceService
{
    DiceResult Roll();
    int RollSingle();
}
