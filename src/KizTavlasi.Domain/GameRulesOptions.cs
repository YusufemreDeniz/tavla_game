namespace KizTavlasi.Domain;

/// <summary>
/// Kız Tavlası kural varyasyonları. Varsayılan değerler istenen standart oyunu tanımlar.
/// </summary>
public sealed class GameRulesOptions
{
    /// <summary>Toplama aşamasında çift atan oyuncu toplam 2×zar pul alır; ilk pul çift atılan haneden, kalanı serbest seçim.</summary>
    public bool DoubleGrantsBonusCollects { get; init; } = true;

    /// <summary>Kazanan bittiğinde rakip hâlâ indirme aşamasındaysa MARS: 1 yerine 2 puan.</summary>
    public bool MarsScoresDouble { get; init; } = true;

    /// <summary>Sonraki ele önceki eli kaybeden oyuncu başlar.</summary>
    public bool LoserStartsNextRound { get; init; } = true;

    public static GameRulesOptions Default { get; } = new();
}
