namespace KizTavlasi.Application;

public static class GameConstants
{
    public static readonly int[] SupportedBestOf = [1, 3, 5];
    public static readonly string[] AllowedReactions =
    [
        "❤️", "😂", "🎲", "👏", "😮", "🔥",
        "😎", "😭", "🥳", "😤", "🤯", "🙏",
        "💪", "🍀", "😉", "🤝", "🫣", "👑",
    ];
    public const int DisplayNameMinLength = 2;
    public const int DisplayNameMaxLength = 30;
    public const int HostSeat = 1;
    public const int GuestSeat = 2;

    /// <summary>Desteklenen hamle süreleri (saniye); <c>null</c> = süresiz.</summary>
    public static readonly int[] SupportedTurnTimeLimits = [15, 30];

    public static string BotDisplayName(Domain.BotDifficulty difficulty) => difficulty switch
    {
        Domain.BotDifficulty.Master => "Usta Bot",
        _ => "Çırak Bot"
    };
}

/// <summary>Oda yaşam döngüsü ve oyun ayarları (options pattern).</summary>
public sealed class GameOptions
{
    public const string SectionName = "Game";

    public int RoomExpirationHours { get; set; } = 24;
    public int DisconnectedPlayerGraceMinutes { get; set; } = 5;
    public int CleanupIntervalMinutes { get; set; } = 10;

    /// <summary>Bot hamlesi öncesi insan benzeri bekleme aralığı (ms).</summary>
    public int BotMinDelayMs { get; set; } = 550;
    public int BotMaxDelayMs { get; set; } = 950;

    /// <summary>Elin ilk zarından önce istemci animasyonları için ek bekleme (ms).</summary>
    public int RoundStartGraceMs { get; set; } = 2600;

    /// <summary>Kaçırılmış otomatik eylemler için veritabanı tarama aralığı (saniye).</summary>
    public int AutomationSweepSeconds { get; set; } = 5;

    /// <summary>
    /// Yalnızca Development ortamında etkinleşebilen deterministik zar tohumu (E2E testleri için).
    /// Production'da yok sayılır.
    /// </summary>
    public int? DeterministicDiceSeed { get; set; }
}

/// <summary>Ürün adı tek merkezden yönetilir.</summary>
public sealed class BrandingOptions
{
    public const string SectionName = "Branding";

    public string ProductName { get; set; } = "Kız Tavlası Online";
}
