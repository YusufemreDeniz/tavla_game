using KizTavlasi.Application.Abstractions;
using KizTavlasi.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace KizTavlasi.Infrastructure.Persistence;

public class GameDbContext : DbContext, IGameDbContext
{
    public GameDbContext(DbContextOptions<GameDbContext> options) : base(options)
    {
    }

    public DbSet<GameRoom> GameRooms => Set<GameRoom>();
    public DbSet<Player> Players => Set<Player>();
    public DbSet<Match> Matches => Set<Match>();
    public DbSet<Round> Rounds => Set<Round>();
    public DbSet<PlayerRoundState> PlayerRoundStates => Set<PlayerRoundState>();
    public DbSet<PlayerPointState> PlayerPointStates => Set<PlayerPointState>();
    public DbSet<DiceRoll> DiceRolls => Set<DiceRoll>();
    public DbSet<GameEvent> GameEvents => Set<GameEvent>();

    public async Task<TResult> ExecuteInTransactionAsync<TResult>(
        Func<CancellationToken, Task<TResult>> action,
        CancellationToken cancellationToken = default)
    {
        if (Database.CurrentTransaction is not null)
        {
            return await action(cancellationToken);
        }

        var strategy = Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async ct =>
        {
            await using var transaction = await Database.BeginTransactionAsync(ct);
            var result = await action(ct);
            await transaction.CommitAsync(ct);
            return result;
        }, cancellationToken);
    }

    public void ClearChangeTracker() => ChangeTracker.Clear();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(GameDbContext).Assembly);
    }
}
