using FluentAssertions;
using KizTavlasi.Application;
using KizTavlasi.Application.Abstractions;
using KizTavlasi.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace KizTavlasi.Application.Tests;

/// <summary>
/// <see cref="TurnAutomationService"/> yaşam döngüsü: Dispose tekrar çağrılabilir olmalı.
/// DI aynı örneği üç kayıtla (somut tip, ITurnAutomationScheduler, IHostedService) tuttuğundan provider disposal
/// aynı örneği birden çok kez dispose eder. Bu testler SQL Server gerektirmez ([Collection] kullanmaz).
/// </summary>
public class TurnAutomationServiceDisposeTests
{
    private static TurnAutomationService CreateService(IServiceScopeFactory scopeFactory, TimeProvider timeProvider) =>
        new(scopeFactory, timeProvider, Options.Create(new GameOptions()), NullLogger<TurnAutomationService>.Instance);

    private static ServiceProvider BuildProvider()
    {
        // DependencyInjection.AddInfrastructure ile aynı üçlü kayıt (veritabanı bağımlılığı olmadan).
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IOptions<GameOptions>>(Options.Create(new GameOptions()));
        services.AddSingleton<TurnAutomationService>();
        services.AddSingleton<ITurnAutomationScheduler>(sp => sp.GetRequiredService<TurnAutomationService>());
        services.AddHostedService(sp => sp.GetRequiredService<TurnAutomationService>());
        return services.BuildServiceProvider();
    }

    private sealed class CountingScopeFactory : IServiceScopeFactory
    {
        private int _count;
        public int Count => Volatile.Read(ref _count);

        public IServiceScope CreateScope()
        {
            Interlocked.Increment(ref _count);
            return new ServiceCollection().BuildServiceProvider().CreateScope();
        }
    }

    [Fact]
    public void Dispose_FirstCall_Succeeds()
    {
        var service = CreateService(new CountingScopeFactory(), new FakeTimeProvider());

        var act = () => service.Dispose();

        act.Should().NotThrow();
    }

    [Fact]
    public void Dispose_SecondCall_DoesNotThrow()
    {
        var service = CreateService(new CountingScopeFactory(), new FakeTimeProvider());
        service.Dispose();

        var act = () => service.Dispose();

        act.Should().NotThrow();
    }

    [Fact]
    public void Dispose_RepeatedCalls_AreSafe()
    {
        var service = CreateService(new CountingScopeFactory(), new FakeTimeProvider());

        var act = () =>
        {
            for (var i = 0; i < 5; i++)
            {
                service.Dispose();
            }
        };

        act.Should().NotThrow();
    }

    [Fact]
    public void Dispose_ConcurrentCalls_DoNotThrow()
    {
        var service = CreateService(new CountingScopeFactory(), new FakeTimeProvider());

        var act = () => Parallel.For(0, 16, _ => service.Dispose());

        act.Should().NotThrow();
    }

    [Fact]
    public async Task Dispose_FirstCall_CancelsPendingTimers()
    {
        var time = new FakeTimeProvider();
        var factory = new CountingScopeFactory();
        var service = CreateService(factory, time);
        service.Schedule(Guid.NewGuid(), time.GetUtcNow().UtcDateTime.AddMinutes(30));

        service.Dispose();
        time.Advance(TimeSpan.FromHours(2));
        await Task.Delay(200);

        factory.Count.Should().Be(0, "dispose bekleyen zamanlayıcıları iptal etmeli; eylem çalışmamalı");
    }

    [Fact]
    public async Task Schedule_WithoutDispose_FiresTimer_ControlForCancelTest()
    {
        // Kontrol: Dispose olmadan aynı senaryoda zamanlayıcı tetiklenir; yukarıdaki iptal testinin anlamlı olduğunu gösterir.
        var time = new FakeTimeProvider();
        var factory = new CountingScopeFactory();
        using var service = CreateService(factory, time);
        service.Schedule(Guid.NewGuid(), time.GetUtcNow().UtcDateTime.AddMinutes(30));

        time.Advance(TimeSpan.FromHours(2));
        for (var i = 0; i < 100 && factory.Count == 0; i++)
        {
            await Task.Delay(20);
        }

        factory.Count.Should().Be(1);
    }

    [Fact]
    public void Schedule_AfterDispose_IsIgnored()
    {
        var time = new FakeTimeProvider();
        var service = CreateService(new CountingScopeFactory(), time);
        service.Dispose();

        var act = () => service.Schedule(Guid.NewGuid(), time.GetUtcNow().UtcDateTime.AddMinutes(1));

        act.Should().NotThrow();
    }

    [Fact]
    public void ServiceProvider_ResolvesSameInstanceFromAllRegistrations()
    {
        using var provider = BuildProvider();

        var concrete = provider.GetRequiredService<TurnAutomationService>();
        var scheduler = provider.GetRequiredService<ITurnAutomationScheduler>();
        var hosted = provider.GetServices<IHostedService>().OfType<TurnAutomationService>().Single();

        scheduler.Should().BeSameAs(concrete);
        hosted.Should().BeSameAs(concrete);
    }

    [Fact]
    public void ServiceProvider_Dispose_DoesNotThrow_WhenSameInstanceRegisteredMultipleTimes()
    {
        var provider = BuildProvider();
        provider.GetRequiredService<TurnAutomationService>();
        provider.GetRequiredService<ITurnAutomationScheduler>();
        provider.GetServices<IHostedService>().ToList();

        var act = () => provider.Dispose();

        act.Should().NotThrow();
    }

    [Fact]
    public async Task ServiceProvider_DisposeAsync_DoesNotThrow_WhenSameInstanceRegisteredMultipleTimes()
    {
        var provider = BuildProvider();
        provider.GetRequiredService<TurnAutomationService>();
        provider.GetRequiredService<ITurnAutomationScheduler>();
        provider.GetServices<IHostedService>().ToList();

        var act = async () => await provider.DisposeAsync();

        await act.Should().NotThrowAsync();
    }
}
