using System.Security.Cryptography;
using KizTavlasi.Domain;

namespace KizTavlasi.Infrastructure.Security;

/// <summary>Production zar servisi: kriptografik rastgele üretim.</summary>
public sealed class CryptoDiceService : IDiceService
{
    public DiceResult Roll() => DiceResult.Create(RollSingle(), RollSingle());

    public int RollSingle() => RandomNumberGenerator.GetInt32(1, 7);
}

/// <summary>
/// Yalnızca Development ortamında E2E testleri için etkinleştirilebilen deterministik zar servisi.
/// Production ortamında hiçbir zaman kaydedilmez.
/// </summary>
public sealed class SeededDiceService : IDiceService
{
    private readonly Random _random;
    private readonly Lock _lock = new();

    public SeededDiceService(int seed)
    {
        _random = new Random(seed);
    }

    public DiceResult Roll() => DiceResult.Create(RollSingle(), RollSingle());

    public int RollSingle()
    {
        lock (_lock)
        {
            return _random.Next(1, 7);
        }
    }
}
