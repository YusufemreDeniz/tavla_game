using KizTavlasi.Infrastructure.Persistence;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Testcontainers.MsSql;

namespace KizTavlasi.Application.Tests.TestInfrastructure;

/// <summary>
/// Test veritabanı sağlayıcısı. Öncelik sırası:
/// 1. TEST_SQL_CONNECTION ortam değişkeni (CI service container)
/// 2. Docker üzerinden Testcontainers MsSql
/// 3. SQL LocalDB (Windows geliştirme makinesi)
/// Her test sınıfı kendi izole veritabanını alır.
/// </summary>
public sealed class SqlTestDatabase : IAsyncLifetime
{
    private MsSqlContainer? _container;
    private string _databaseName = string.Empty;
    private string _masterConnectionString = string.Empty;

    public string ConnectionString { get; private set; } = string.Empty;

    public async Task InitializeAsync()
    {
        _databaseName = $"KizTavlasiTest_{Guid.NewGuid():N}";

        var envConnection = Environment.GetEnvironmentVariable("TEST_SQL_CONNECTION");
        if (!string.IsNullOrWhiteSpace(envConnection))
        {
            _masterConnectionString = envConnection;
        }
        else if (await IsDockerAvailableAsync())
        {
            _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
            await _container.StartAsync();
            _masterConnectionString = _container.GetConnectionString();
        }
        else
        {
            _masterConnectionString =
                "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True";
        }

        var builder = new SqlConnectionStringBuilder(_masterConnectionString)
        {
            InitialCatalog = _databaseName
        };
        ConnectionString = builder.ConnectionString;

        await using var db = CreateContext();
        await db.Database.MigrateAsync();
    }

    public GameDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<GameDbContext>()
            .UseSqlServer(ConnectionString)
            .Options;
        return new GameDbContext(options);
    }

    public async Task DisposeAsync()
    {
        try
        {
            await using var db = CreateContext();
            await db.Database.EnsureDeletedAsync();
        }
        catch (SqlException)
        {
            // Test veritabanı silinemedi; container zaten kapanacak.
        }

        if (_container is not null)
        {
            await _container.DisposeAsync();
        }
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
