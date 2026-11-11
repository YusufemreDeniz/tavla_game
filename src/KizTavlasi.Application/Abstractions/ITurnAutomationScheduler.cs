namespace KizTavlasi.Application.Abstractions;

/// <summary>
/// Sunucunun bir oyuncu adına otomatik eylem yapacağı anı (bot hamlesi, süre dolumu,
/// botun rövanş kabulü) zamanlar. Uygulama servisleri commit SONRASI çağırır;
/// implementasyon bellekte zamanlayıcı tutar ve kaçırılan işler için veritabanını
/// periyodik tarar (asıl durum her zaman veritabanındadır).
/// </summary>
public interface ITurnAutomationScheduler
{
    /// <param name="roomId">Oda.</param>
    /// <param name="dueUtc">Eylem zamanı; <c>null</c> ise bekleyen zamanlayıcı iptal edilir.</param>
    void Schedule(Guid roomId, DateTime? dueUtc);
}

/// <summary>Otomasyon kullanılmayan bağlamlar için (ör. bazı testler) boş zamanlayıcı.</summary>
public sealed class NullTurnAutomationScheduler : ITurnAutomationScheduler
{
    public static readonly NullTurnAutomationScheduler Instance = new();

    public void Schedule(Guid roomId, DateTime? dueUtc)
    {
    }
}
