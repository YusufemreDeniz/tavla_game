namespace KizTavlasi.Domain;

/// <summary>
/// Bir oyuncunun tahta durumu.
/// - BackCount: hanede henüz İNDİRİLMEMİŞ pullar.
/// - FrontCount: haneden İNDİRİLMİŞ (öne alınmış) pullar.
/// İndirme aşamasında her hanede son pul indirilmez (hane başına en fazla pulSayısı-1 indirme).
/// Tüm hanelerde indirilmemiş pul 1'e düşünce TOPLAMA aşaması başlar ve
/// hanedeki bütün pullar (inen + kalan) toplanabilir.
/// </summary>
public sealed class PlayerBoard
{
    public const int PointCount = 6;
    public const int TotalPieces = 15;

    private readonly PointState[] _points;

    public int CollectedCount { get; private set; }

    public PlayerBoard()
    {
        // Başlangıç dizilimi: 1-3. haneler 2'şer, 4-6. haneler 3'er pul.
        _points = new PointState[PointCount];
        for (var i = 0; i < PointCount; i++)
        {
            var pointNumber = i + 1;
            var initial = pointNumber <= 3 ? 2 : 3;
            _points[i] = new PointState(pointNumber, initial, 0);
        }
        CollectedCount = 0;
    }

    public PlayerBoard(IReadOnlyList<PointState> points, int collectedCount)
    {
        if (points.Count != PointCount)
        {
            throw new ArgumentException($"Tam olarak {PointCount} hane gereklidir.", nameof(points));
        }

        _points = new PointState[PointCount];
        foreach (var point in points)
        {
            if (point.PointNumber is < 1 or > PointCount)
            {
                throw new ArgumentException($"Geçersiz hane numarası: {point.PointNumber}", nameof(points));
            }
            _points[point.PointNumber - 1] = point;
        }

        var totalOnBoard = _points.Sum(p => p.BackCount + p.FrontCount);
        if (totalOnBoard + collectedCount != TotalPieces)
        {
            throw new ArgumentException(
                $"Toplam pul sayısı {TotalPieces} olmalıdır; tahtada {totalOnBoard}, toplanan {collectedCount}.");
        }

        CollectedCount = collectedCount;
    }

    public PointState GetPoint(int pointNumber)
    {
        if (pointNumber is < 1 or > PointCount)
        {
            throw new ArgumentOutOfRangeException(nameof(pointNumber));
        }
        return _points[pointNumber - 1];
    }

    public IReadOnlyList<PointState> Points => _points;

    public bool IsCompleted => CollectedCount == TotalPieces;

    /// <summary>
    /// İndirme aşaması bitti mi? Tüm hanelerde indirilmemiş pul 1'e (veya toplanarak 0'a)
    /// düştüyse oyuncu toplama aşamasındadır.
    /// </summary>
    public bool IsCollecting => _points.All(p => p.BackCount <= 1);

    /// <summary>Hanede indirilebilecek pul var mı? (Son pul indirilmez.)</summary>
    public bool CanBringDown(int pointNumber) => GetPoint(pointNumber).BackCount > 1;

    public int TotalAt(int pointNumber)
    {
        var point = GetPoint(pointNumber);
        return point.BackCount + point.FrontCount;
    }

    internal void BringDown(int pointNumber)
    {
        var point = GetPoint(pointNumber);
        if (point.BackCount <= 1)
        {
            throw new InvalidOperationException($"Hane {pointNumber} içinde indirilecek pul yok.");
        }
        _points[pointNumber - 1] = point with { BackCount = point.BackCount - 1, FrontCount = point.FrontCount + 1 };
    }

    internal void Collect(int pointNumber)
    {
        if (!IsCollecting)
        {
            throw new InvalidOperationException("İndirme aşaması bitmeden pul toplanamaz.");
        }

        var point = GetPoint(pointNumber);
        if (point.FrontCount > 0)
        {
            _points[pointNumber - 1] = point with { FrontCount = point.FrontCount - 1 };
        }
        else if (point.BackCount > 0)
        {
            _points[pointNumber - 1] = point with { BackCount = point.BackCount - 1 };
        }
        else
        {
            throw new InvalidOperationException($"Hane {pointNumber} boş; toplanacak pul yok.");
        }

        CollectedCount++;
    }
}

/// <summary>Bir hanenin anlık durumu (value object).</summary>
public sealed record PointState(int PointNumber, int BackCount, int FrontCount);
