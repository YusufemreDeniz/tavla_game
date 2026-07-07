using System.Security.Claims;
using KizTavlasi.Application;
using KizTavlasi.Domain;
using KizTavlasi.Infrastructure.Security;

namespace KizTavlasi.Api;

public static class PlayerSessionResolver
{
    /// <summary>JWT claim'lerinden oyuncu oturumunu çözer; eksik claim varsa oturumu reddeder.</summary>
    public static PlayerSession Resolve(ClaimsPrincipal principal)
    {
        var playerId = principal.FindFirstValue(GameClaimTypes.PlayerId);
        var roomId = principal.FindFirstValue(GameClaimTypes.RoomId);
        var roomCode = principal.FindFirstValue(GameClaimTypes.RoomCode);
        var seat = principal.FindFirstValue(GameClaimTypes.Seat);
        var sessionId = principal.FindFirstValue(GameClaimTypes.SessionId);
        var jti = principal.FindFirstValue("jti");

        if (playerId is null || roomId is null || roomCode is null || seat is null || sessionId is null || jti is null
            || !Guid.TryParse(playerId, out var playerGuid)
            || !Guid.TryParse(roomId, out var roomGuid)
            || !Guid.TryParse(sessionId, out var sessionGuid)
            || !int.TryParse(seat, out var seatNumber))
        {
            throw new GameDomainException(DomainErrorCodes.InvalidSession, "Oturum bilgileri eksik veya geçersiz.");
        }

        return new PlayerSession(playerGuid, roomGuid, roomCode, seatNumber, sessionGuid, jti);
    }
}
