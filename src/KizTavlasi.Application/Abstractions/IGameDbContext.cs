using KizTavlasi.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace KizTavlasi.Application.Abstractions;

/// <summary>
/// EF Core DbContext soyutlaması. Uygulama servisleri transaction sınırlarını
/// <see cref="ExecuteInTransactionAsync"/> ile çizer; implementasyon Infrastructure'dadır.
/// </summary>
public interface IGameDbContext
{
    DbSet<GameRoom> GameRooms { get; }
    DbSet<Player> Players { get; }
    DbSet<Match> Matches { get; }
    DbSet<Round> Rounds { get; }
    DbSet<PlayerRoundState> PlayerRoundStates { get; }
    DbSet<PlayerPointState> PlayerPointStates { get; }
    DbSet<DiceRoll> DiceRolls { get; }
    DbSet<GameEvent> GameEvents { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

    /// <summary>Verilen işlemi tek veritabanı transaction'ı içinde çalıştırır.</summary>
    Task<TResult> ExecuteInTransactionAsync<TResult>(
        Func<CancellationToken, Task<TResult>> action,
        CancellationToken cancellationToken = default);

    /// <summary>Takip edilen tüm entity'leri bırakır (concurrency retry için).</summary>
    void ClearChangeTracker();
}
