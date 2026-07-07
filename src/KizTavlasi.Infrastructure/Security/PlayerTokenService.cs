using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using KizTavlasi.Application.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace KizTavlasi.Infrastructure.Security;

public static class GameClaimTypes
{
    public const string PlayerId = "playerId";
    public const string RoomId = "roomId";
    public const string RoomCode = "roomCode";
    public const string Seat = "seat";
    public const string SessionId = "sessionId";
}

public sealed class PlayerTokenService : IPlayerTokenService
{
    private readonly JwtOptions _options;
    private readonly TimeProvider _timeProvider;

    public PlayerTokenService(IOptions<JwtOptions> options, TimeProvider timeProvider)
    {
        _options = options.Value;
        _timeProvider = timeProvider;
    }

    public PlayerTokenResult CreateToken(Guid playerId, Guid roomId, string roomCode, int seat)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var expires = now.AddHours(_options.ExpirationHours);
        var sessionId = Guid.CreateVersion7();
        var jti = Guid.CreateVersion7().ToString("N");

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Jti, jti),
            new(GameClaimTypes.PlayerId, playerId.ToString()),
            new(GameClaimTypes.RoomId, roomId.ToString()),
            new(GameClaimTypes.RoomCode, roomCode),
            new(GameClaimTypes.Seat, seat.ToString()),
            new(GameClaimTypes.SessionId, sessionId.ToString())
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.SigningKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            notBefore: now,
            expires: expires,
            signingCredentials: credentials);

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);
        return new PlayerTokenResult(tokenString, HashTokenId(jti), sessionId, expires);
    }

    public string HashTokenId(string jti)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(jti));
        return Convert.ToBase64String(hash);
    }
}
