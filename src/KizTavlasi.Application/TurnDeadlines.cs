using KizTavlasi.Domain;
using KizTavlasi.Domain.Entities;

namespace KizTavlasi.Application;

/// <summary>
/// <see cref="Round.TurnDeadlineUtc"/> hesaplaması: sunucunun sıradaki oyuncu adına
/// ne zaman hareket edeceği. Kural değildir; yalnızca zamanlama politikasıdır.
/// </summary>
public static class TurnDeadlines
{
    public static DateTime? Compute(GameRoom room, Round round, DateTime now, GameOptions options)
    {
        if (round.Status != RoundStatus.InProgress || round.CurrentPlayerId is null)
        {
            return null;
        }

        var current = room.Players.FirstOrDefault(p => p.Id == round.CurrentPlayerId);
        if (current is null)
        {
            return null;
        }

        // Elin ilk zarı: istemci başlangıç zarı / el sonucu animasyonunu gösterirken beklenir.
        var isOpeningRoll = round.TurnNumber == 1
            && string.IsNullOrEmpty(round.PendingDice)
            && round.PendingBonusPicks == 0;
        var openingGraceMs = isOpeningRoll ? options.RoundStartGraceMs : 0;

        if (current.IsBot)
        {
            return now.AddMilliseconds(BotThinkMs(room.StateVersion, options) + openingGraceMs);
        }

        if (room.TurnTimeLimitSeconds is int seconds && seconds > 0)
        {
            return now.AddSeconds(seconds).AddMilliseconds(openingGraceMs);
        }

        return null;
    }

    /// <summary>İnsan benzeri "düşünme" süresi: state version'a bağlı deterministik sapma.</summary>
    public static int BotThinkMs(long stateVersion, GameOptions options)
    {
        var min = Math.Max(0, options.BotMinDelayMs);
        var span = Math.Max(0, options.BotMaxDelayMs - min);
        if (span == 0)
        {
            return min;
        }
        var jitter = (int)((stateVersion * 7919L) % (span + 1));
        return min + jitter;
    }
}
