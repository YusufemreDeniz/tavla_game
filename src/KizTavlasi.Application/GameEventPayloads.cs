namespace KizTavlasi.Application;

/// <summary>
/// GameEvents tablosuna yazılan (append-only) olay payload'ları. Hem idempotency kontrolü hem
/// maç analitiği bu kayıtları okur. Yeni alanlar varsayılan değerlidir: eski kayıtlar okunmaya devam eder.
/// </summary>
/// <param name="WastedDiceCount">Bu hamleden sonra oynanamaz hale gelip boşa giden zar sayısı.</param>
/// <param name="BringDownCompleted">Bu hamleyle oyuncu indirme aşamasını bitirip toplamaya geçti.</param>
/// <param name="RollTurnNumber">Hamlenin ait olduğu zar atışının tur numarası (DiceRolls.TurnNumber).</param>
internal sealed record MovePlayedEventPayload(
    Guid PlayerId,
    Guid? CommandId,
    int PointNumber,
    string Action,
    string Remaining,
    int PendingBonusPicks,
    int WastedDiceCount = 0,
    bool BringDownCompleted = false,
    int RollTurnNumber = 0);

internal sealed record RoundCompletedEventPayload(
    Guid WinnerPlayerId,
    int RoundNumber,
    bool IsMars,
    int PointsAwarded);

internal static class GameEventTypes
{
    public const string MovePlayed = "MovePlayed";
    public const string RoundCompleted = "RoundCompleted";
}
