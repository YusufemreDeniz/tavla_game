using KizTavlasi.Domain;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace KizTavlasi.Api;

/// <summary>
/// Domain hatalarını RFC 7807 ProblemDetails yanıtına çevirir.
/// Production'da stack trace asla dönmez.
/// </summary>
public sealed class GameExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GameExceptionHandler> _logger;

    public GameExceptionHandler(ILogger<GameExceptionHandler> logger)
    {
        _logger = logger;
    }

    private static int StatusCodeFor(string code) => code switch
    {
        DomainErrorCodes.RoomNotFound => StatusCodes.Status404NotFound,
        DomainErrorCodes.RoomExpired => StatusCodes.Status410Gone,
        DomainErrorCodes.RoomFull => StatusCodes.Status409Conflict,
        DomainErrorCodes.MatchAlreadyStarted => StatusCodes.Status409Conflict,
        DomainErrorCodes.StaleState => StatusCodes.Status409Conflict,
        DomainErrorCodes.RollAlreadyInProgress => StatusCodes.Status409Conflict,
        DomainErrorCodes.InvalidSession => StatusCodes.Status401Unauthorized,
        DomainErrorCodes.PlayerNotInRoom => StatusCodes.Status403Forbidden,
        DomainErrorCodes.NotHost => StatusCodes.Status403Forbidden,
        DomainErrorCodes.NotYourTurn => StatusCodes.Status403Forbidden,
        _ => StatusCodes.Status400BadRequest
    };

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not GameDomainException domainException)
        {
            _logger.LogError(exception, "Beklenmeyen hata. Path: {Path}", httpContext.Request.Path);

            var unexpected = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "Beklenmeyen bir hata oluştu.",
                Type = "https://tools.ietf.org/html/rfc9110#section-15.6.1"
            };
            httpContext.Response.StatusCode = unexpected.Status.Value;
            await httpContext.Response.WriteAsJsonAsync(unexpected, cancellationToken);
            return true;
        }

        _logger.LogWarning("Oyun kuralı hatası. Code: {ErrorCode}, Path: {Path}", domainException.Code, httpContext.Request.Path);

        var problem = new ProblemDetails
        {
            Status = StatusCodeFor(domainException.Code),
            Title = domainException.Message,
            Type = "https://tools.ietf.org/html/rfc9110#section-15.5",
            Extensions = { ["errorCode"] = domainException.Code }
        };

        httpContext.Response.StatusCode = problem.Status.Value;
        await httpContext.Response.WriteAsJsonAsync(problem, cancellationToken);
        return true;
    }
}
