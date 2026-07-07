using KizTavlasi.Domain;
using KizTavlasi.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Testcontainers.MsSql;

namespace KizTavlasi.IntegrationTests.TestInfrastructure;

/// <summary>
/// Gerçek SQL Server (Testcontainers, CI service container veya LocalDB) üzerinde
/// tam API host'u başlatır. Zarlar deterministik test servisi ile kontrol edilir.
/// </summary>
public sealed class ApiTestFixture : WebApplicationFactory<Program>, IAsyncLifetime
{
    private MsSqlContainer? _container;
    private string _databaseName = string.Empty;

    public string ConnectionString { get; private set; } = string.Empty;
    public TestDiceService Dice { get; } = new();

    public async Task InitializeAsync()
    {
        _databaseName = $"KizTavlasiIntegration_{Guid.NewGuid():N}";

        string masterConnection;
        var envConnection = Environment.GetEnvironmentVariable("TEST_SQL_CONNECTION");
        if (!string.IsNullOrWhiteSpace(envConnection))
        {
            masterConnection = envConnection;
        }
        else if (await IsDockerAvailableAsync())
        {
            _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
            await _container.StartAsync();
            masterConnection = _container.GetConnectionString();
        }
        else
        {
            masterConnection =
                "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True";
        }

        ConnectionString = new SqlConnectionStringBuilder(masterConnection)
        {
            InitialCatalog = _databaseName
        }.ConnectionString;

        // Migration'ı burada uygularız; host "Testing" ortamında auto-migrate yapmaz.
        var options = new DbContextOptionsBuilder<GameDbContext>()
            .UseSqlServer(ConnectionString)
            .Options;
        await using var db = new GameDbContext(options);
        await db.Database.MigrateAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:DefaultConnection", ConnectionString);
        builder.UseSetting("Jwt:SigningKey", "integration-test-signing-key-0123456789abcdef-extra");
        builder.UseSetting("Jwt:Issuer", "KizTavlasiOnline");
        builder.UseSetting("Jwt:Audience", "KizTavlasiOnline");
        builder.UseSetting("RateLimiting:GlobalPerMinute", "10000");
        builder.UseSetting("RateLimiting:RoomCreatePerMinute", "10000");
        builder.UseSetting("RateLimiting:RoomJoinPerMinute", "10000");

        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<IDiceService>(Dice);
        });
    }

    public GameDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<GameDbContext>()
            .UseSqlServer(ConnectionString)
            .Options;
        return new GameDbContext(options);
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        try
        {
            await using var db = CreateDbContext();
            await db.Database.EnsureDeletedAsync();
        }
        catch (SqlException)
        {
            // Container zaten kapanacak.
        }

        if (_container is not null)
        {
            await _container.DisposeAsync();
        }

        await base.DisposeAsync();
    }

    private static async Task<bool> IsDockerAvailableAsync()
    {
        try
        {
            using var process = new System.Diagnostics.Process
            {
                StartInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "docker",
                    Arguments = "info",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false
                }
            };
            process.Start();
            await process.WaitForExitAsync();
            return process.ExitCode == 0;
        }
        catch (Exception)
        {
            return false;
        }
    }
}

/// <summary>Kuyruk boşsa güvenli rastgele değere düşen deterministik zar servisi.</summary>
public sealed class TestDiceService : IDiceService
{
    private readonly Queue<int> _values = new();
    private readonly Lock _lock = new();

    public void Enqueue(params int[] values)
    {
        lock (_lock)
        {
            foreach (var value in values)
            {
                _values.Enqueue(value);
            }
        }
    }

    public DiceResult Roll() => DiceResult.Create(RollSingle(), RollSingle());

    public int RollSingle()
    {
        lock (_lock)
        {
            return _values.Count > 0
                ? _values.Dequeue()
                : System.Security.Cryptography.RandomNumberGenerator.GetInt32(1, 7);
        }
    }
}
