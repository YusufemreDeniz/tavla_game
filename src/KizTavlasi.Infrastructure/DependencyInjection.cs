using KizTavlasi.Application;
using KizTavlasi.Application.Abstractions;
using KizTavlasi.Domain;
using KizTavlasi.Infrastructure.Persistence;
using KizTavlasi.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace KizTavlasi.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        bool isDevelopment)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException(
                "ConnectionStrings__DefaultConnection ayarı zorunludur.");

        services.AddDbContext<GameDbContext>(options =>
            options.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure(3)));
        services.AddScoped<IGameDbContext>(sp => sp.GetRequiredService<GameDbContext>());

        services.AddOptions<JwtOptions>()
            .Bind(configuration.GetSection(JwtOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddOptions<GameOptions>()
            .Bind(configuration.GetSection(GameOptions.SectionName))
            .ValidateOnStart();

        services.AddOptions<BrandingOptions>()
            .Bind(configuration.GetSection(BrandingOptions.SectionName));

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IRoomCodeGenerator, RoomCodeGenerator>();
        services.AddSingleton<IPlayerTokenService, PlayerTokenService>();

        // Deterministik zar yalnızca Development ortamında etkinleşebilir (E2E testleri için).
        services.AddSingleton<IDiceService>(sp =>
        {
            var gameOptions = sp.GetRequiredService<IOptions<GameOptions>>().Value;
            return isDevelopment && gameOptions.DeterministicDiceSeed is int seed
                ? new SeededDiceService(seed)
                : new CryptoDiceService();
        });

        services.AddSingleton(new GameEngine(GameRulesOptions.Default));
        services.AddScoped<RoomService>();
        services.AddScoped<GameService>();

        services.AddHostedService<RoomCleanupService>();

        return services;
    }
}
