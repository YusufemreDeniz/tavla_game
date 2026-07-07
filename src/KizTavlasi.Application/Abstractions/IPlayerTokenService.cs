namespace KizTavlasi.Application.Abstractions;

public sealed record PlayerTokenResult(string Token, string SessionTokenHash, Guid SessionId, DateTime ExpiresAtUtc);

public interface IPlayerTokenService
{
    /// <summary>Misafir oyuncu için geçici JWT üretir; jti hash'i DB'de saklanır.</summary>
    PlayerTokenResult CreateToken(Guid playerId, Guid roomId, string roomCode, int seat);

    /// <summary>Verilen jti değerinin hash'ini hesaplar (rejoin doğrulaması için).</summary>
    string HashTokenId(string jti);
}
