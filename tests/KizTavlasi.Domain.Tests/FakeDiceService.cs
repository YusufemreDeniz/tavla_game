using KizTavlasi.Domain;

namespace KizTavlasi.Domain.Tests;

/// <summary>Testlerde deterministik zar dizisi sağlar.</summary>
public sealed class FakeDiceService : IDiceService
{
    private readonly Queue<int> _values;

    public FakeDiceService(params int[] values)
    {
        _values = new Queue<int>(values);
    }

    public DiceResult Roll() => DiceResult.Create(RollSingle(), RollSingle());

    public int RollSingle()
    {
        if (_values.Count == 0)
        {
            throw new InvalidOperationException("FakeDiceService kuyruğu boş.");
        }
        return _values.Dequeue();
    }
}
