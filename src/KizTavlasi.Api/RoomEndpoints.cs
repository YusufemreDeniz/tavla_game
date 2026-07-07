using FluentValidation;
using KizTavlasi.Application;
using KizTavlasi.Application.Dtos;
using KizTavlasi.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace KizTavlasi.Api;

public static class RoomEndpoints
{
    public static void MapRoomEndpoints(this IEndpointRouteBuilder app)
    {
        var rooms = app.MapGroup("/api/rooms").WithTags("Rooms");

        rooms.MapPost("/", async (
            CreateRoomRequest request,
            IValidator<CreateRoomRequest> validator,
            RoomService roomService,
            CancellationToken ct) =>
        {
            await ValidateAsync(validator, request, ct);
            var result = await roomService.CreateRoomAsync(request, ct);
            return Results.Ok(result);
        }).RequireRateLimiting("room-create");

        rooms.MapPost("/{roomCode}/join", async (
            string roomCode,
            JoinRoomRequest request,
            IValidator<JoinRoomRequest> validator,
            RoomService roomService,
            CancellationToken ct) =>
        {
            await ValidateAsync(validator, request, ct);
            var result = await roomService.JoinRoomAsync(roomCode, request, ct);
            return Results.Ok(result);
        }).RequireRateLimiting("room-join");

        rooms.MapGet("/{roomCode}", async (string roomCode, RoomService roomService, CancellationToken ct) =>
        {
            var info = await roomService.GetPublicRoomInfoAsync(roomCode, ct);
            return Results.Ok(info);
        }).RequireRateLimiting("room-join");

        rooms.MapGet("/{roomCode}/state", async (string roomCode, HttpContext context, RoomService roomService, CancellationToken ct) =>
        {
            var session = ResolveSessionForRoom(context, roomCode);
            await roomService.ValidateSessionAsync(session, ct);
            var state = await roomService.GetRoomStateAsync(session, ct);
            return Results.Ok(state);
        }).RequireAuthorization();

        rooms.MapPost("/{roomCode}/leave", async (string roomCode, HttpContext context, RoomService roomService, CancellationToken ct) =>
        {
            var session = ResolveSessionForRoom(context, roomCode);
            await roomService.ValidateSessionAsync(session, ct);
            await roomService.LeaveRoomAsync(session, ct);
            return Results.NoContent();
        }).RequireAuthorization();

        rooms.MapPost("/{roomCode}/start", async (
            string roomCode,
            [FromBody] StartMatchApiRequest request,
            HttpContext context,
            RoomService roomService,
            GameService gameService,
            CancellationToken ct) =>
        {
            var session = ResolveSessionForRoom(context, roomCode);
            await roomService.ValidateSessionAsync(session, ct);
            var result = await gameService.StartMatchAsync(session, request.CommandId, ct);
            return Results.Ok(result);
        }).RequireAuthorization();

        rooms.MapPost("/{roomCode}/rematch", async (
            string roomCode,
            HttpContext context,
            RoomService roomService,
            GameService gameService,
            CancellationToken ct) =>
        {
            var session = ResolveSessionForRoom(context, roomCode);
            await roomService.ValidateSessionAsync(session, ct);
            var snapshot = await gameService.RequestRematchAsync(session, ct);
            return Results.Ok(snapshot);
        }).RequireAuthorization();

        app.MapGet("/api/config/public", (IOptions<BrandingOptions> branding) =>
        {
            var config = new PublicConfigDto(
                branding.Value.ProductName,
                GameConstants.SupportedBestOf,
                GameConstants.AllowedReactions);
            return Results.Ok(config);
        }).WithTags("Config");
    }

    private static PlayerSession ResolveSessionForRoom(HttpContext context, string roomCode)
    {
        var session = PlayerSessionResolver.Resolve(context.User);
        if (!string.Equals(session.RoomCode, roomCode.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            throw new GameDomainException(DomainErrorCodes.PlayerNotInRoom, "Bu odaya erişim yetkiniz yok.");
        }
        return session;
    }

    private static async Task ValidateAsync<T>(IValidator<T> validator, T request, CancellationToken ct)
    {
        var validationResult = await validator.ValidateAsync(request, ct);
        if (!validationResult.IsValid)
        {
            throw new GameDomainException(
                DomainErrorCodes.InvalidCommand,
                validationResult.Errors[0].ErrorMessage);
        }
    }
}

public sealed record StartMatchApiRequest(Guid CommandId);
