namespace KizTavlasi.Application.Abstractions;

public interface IRoomCodeGenerator
{
    /// <summary>Tahmin edilmesi zor, karışan karakter içermeyen oda kodu üretir.</summary>
    string Generate();
}
