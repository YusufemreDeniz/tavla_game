using System.Collections.Concurrent;
using KizTavlasi.Application;
using KizTavlasi.Application.Abstractions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace KizTavlasi.Infrastructure;

/// <summary>
/// Otomatik eylemleri (bot hamlesi, hamle süresi dolumu, botun rövanş kabulü) zamanında çalıştırır.
///
/// - Hızlı yol: <see cref="Schedule"/> commit sonrası çağrılır; oda başına tek bir bellek içi
///   zamanlayıcı tutulur (yeni zamanlama eskisini iptal eder).
/// - Güvenli yol: her <see cref="GameOptions.AutomationSweepSeconds"/> saniyede veritabanı taranır;
///   yeniden başlatma veya kaybolan zamanlayıcı durumunda eylem yine gerçekleşir.
/// Gerçek durum her zaman veritabanındadır; çalıştırma idempotenttir (bkz. <see cref="TurnAutomationRunner"/>).
/// </summary>
public sealed class TurnAutomationService : BackgroundService, ITurnAutomationScheduler
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeProvider _timeProvider;
    private readonly GameOptions _options;
    private readonly ILogger<TurnAutomationService> _logger;
    private readonly ConcurrentDictionary<Guid, CancellationTokenSource> _timers = new();
    private readonly CancellationTokenSource _shutdown = new();

    public TurnAutomationService(
        IServiceScopeFactory scopeFactory,
        TimeProvider timeProvider,
        IOptions<GameOptions> options,
        ILogger<TurnAutomationService> logger)
    {
        _scopeFactory = scopeFactory;
        _timeProvider = timeProvider;
        _options = options.Value;
        _logger = logger;
    }

    public void Schedule(Guid roomId, DateTime? dueUtc)
    {
        if (_timers.TryRemove(roomId, out var previous))
        {
            previous.Cancel();
        }

        if (dueUtc is null || _shutdown.IsCancellationRequested)
        {
            return;
        }

        var cts = CancellationTokenSource.CreateLinkedTokenSource(_shutdown.Token);
        if (!_timers.TryAdd(roomId, cts))
        {
            // Eşzamanlı başka bir zamanlama kazandı; o geçerli.
            cts.Dispose();
            return;
        }

        var delay = dueUtc.Value - _timeProvider.GetUtcNow().UtcDateTime;
        _ = RunAfterAsync(roomId, delay, cts);
    }

    private async Task RunAfterAsync(Guid roomId, TimeSpan delay, CancellationTokenSource cts)
    {
        try
        {
            if (delay > TimeSpan.Zero)
            {
                await Task.Delay(delay, _timeProvider, cts.Token);
            }
        }
        catch (OperationCanceledException)
        {
            cts.Dispose();
            return;
        }

        // Bu zamanlayıcı hâlâ odanın güncel zamanlayıcısıysa kaydı kaldır.
        _timers.TryRemove(new KeyValuePair<Guid, CancellationTokenSource>(roomId, cts));
        cts.Dispose();
        await RunRoomAsync(roomId, _shutdown.Token);
    }

    private async Task RunRoomAsync(Guid roomId, CancellationToken ct)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var runner = scope.ServiceProvider.GetRequiredService<TurnAutomationRunner>();
            // Sonraki eylem (ör. botun bir sonraki hamlesi) GameService tarafından commit sonrası zamanlanır.
            await runner.RunDueAsync(roomId, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Otomatik eylem çalıştırılamadı. RoomId: {RoomId}", roomId);
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await using var registration = stoppingToken.Register(() => _shutdown.Cancel());
        var interval = TimeSpan.FromSeconds(Math.Max(1, _options.AutomationSweepSeconds));
        using var timer = new PeriodicTimer(interval, _timeProvider);

        try
        {
            do
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var runner = scope.ServiceProvider.GetRequiredService<TurnAutomationRunner>();
                    var pending = await runner.FindPendingAsync(stoppingToken);
                    foreach (var (roomId, dueUtc) in pending)
                    {
                        // Zaten zamanlanmış odalara dokunma; yalnızca kaçırılanları (ör. yeniden başlatma) yakala.
                        if (!_timers.ContainsKey(roomId))
                        {
                            Schedule(roomId, dueUtc);
                        }
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Otomasyon taraması sırasında hata oluştu.");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    public override void Dispose()
    {
        _shutdown.Cancel();
        _timers.Clear();
        _shutdown.Dispose();
        base.Dispose();
    }
}
