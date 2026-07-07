namespace KizTavlasi.Domain;

/// <summary>
/// Tek bir zarın çözümleme adımı. İstemci bu adımları animasyonla oynatır.
/// </summary>
public sealed record DiceStep(
    int Die,
    int? SourcePoint,
    DiceStepAction Action,
    int CollectedPieces,
    PointSnapshot Before,
    PointSnapshot After);

/// <summary>Adım öncesi/sonrası hane ve toplanan pul görüntüsü.</summary>
public sealed record PointSnapshot(int Back, int Front, int Collected);

