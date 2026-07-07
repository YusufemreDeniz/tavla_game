using KizTavlasi.Application;
using KizTavlasi.Domain;
using KizTavlasi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace KizTavlasi.Infrastructure;

/// <summary>
/// Süresi dolan bekleyen odaları işaretler, tamamlanmış eski odaları siler.
/// Aktif (Playing) odalara dokunmaz.
/// </summary>
public sealed class RoomCleanupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeProvider _timeProvider;
    private readonly GameOptions _options;
    private readonly ILogger<RoomCleanupService> _logger;

    public RoomCleanupService(
        IServiceScopeFactory scopeFactory,
        TimeProvider timeProvider,
        IOptions<GameOptions> options,
        ILogger<RoomCleanupService> logger)
    {
        _scopeFactory = scopeFactory;
        _timeProvider = timeProvider;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(_options.CleanupIntervalMinutes);
        using var timer = new PeriodicTimer(interval, _timeProvider);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CleanupAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Oda temizleme sırasında hata oluştu.");
            }

            if (!await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
            {
                break;
            }
        }
    }

    internal async Task CleanupAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        // Bekleyen/lobide kalan ve süresi dolan odalar sona erdirilir.
        var expired = await db.GameRooms
            .Where(r => (r.Status == RoomStatus.Waiting || r.Status == RoomStatus.InLobby) && r.ExpiresAtUtc < now)
            .ExecuteUpdateAsync(s => s
                .SetProperty(r => r.Status, RoomStatus.Expired)
                .SetProperty(r => r.CompletedAtUtc, now), ct);

        // Tamamlanan/terk edilen odalar, oda ömrü kadar süre geçtikten sonra silinir.
        var deleteBefore = now.AddHours(-_options.RoomExpirationHours);
        var deleted = await db.GameRooms
            .Where(r => (r.Status == RoomStatus.Completed || r.Status == RoomStatus.Abandoned || r.Status == RoomStatus.Expired)
                        && r.CompletedAtUtc != null && r.CompletedAtUtc < deleteBefore)
            .ExecuteDeleteAsync(ct);

        if (expired > 0 || deleted > 0)
        {
            _logger.LogInformation("Oda temizliği: {Expired} oda sona erdirildi, {Deleted} oda silindi.", expired, deleted);
        }
    }
}
