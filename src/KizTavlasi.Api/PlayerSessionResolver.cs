using System.Security.Claims;
using KizTavlasi.Application;
using KizTavlasi.Domain;
using KizTavlasi.Infrastructure.Security;

namespace KizTavlasi.Api;

/// <summary>Salt okunur izleyici oturumu (oyuncu kaydı yoktur).</summary>
public sealed record SpectatorSession(Guid RoomId, string RoomCode);

public static class PlayerSessionResolver
{
    public static bool IsSpectator(ClaimsPrincipal principal) =>
        principal.FindFirstValue(GameClaimTypes.Role) == GameClaimTypes.SpectatorRole;

    /// <summary>İzleyici token'ını çözer; oyuncu kimliği taşıyan token'lar izleyici sayılmaz.</summary>
    public static SpectatorSession ResolveSpectator(ClaimsPrincipal principal)
    {
        var roomId = principal.FindFirstValue(GameClaimTypes.RoomId);
        var roomCode = principal.FindFirstValue(GameClaimTypes.RoomCode);
        if (!IsSpectator(principal)
            || principal.FindFirstValue(GameClaimTypes.PlayerId) is not null
            || roomCode is null
            || !Guid.TryParse(roomId, out var roomGuid))
        {
            throw new GameDomainException(DomainErrorCodes.InvalidSession, "İzleyici oturumu geçersiz.");
        }
        return new SpectatorSession(roomGuid, roomCode);
    }

    /// <summary>JWT claim'lerinden oyuncu oturumunu çözer; eksik claim varsa oturumu reddeder.</summary>
    public static PlayerSession Resolve(ClaimsPrincipal principal)
    {
        if (IsSpectator(principal))
        {
            throw new GameDomainException(DomainErrorCodes.SpectatorReadOnly, "İzleyiciler hamle yapamaz; maçı yalnızca izleyebilir.");
        }

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
