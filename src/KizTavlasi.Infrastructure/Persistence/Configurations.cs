using KizTavlasi.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace KizTavlasi.Infrastructure.Persistence;

public sealed class GameRoomConfiguration : IEntityTypeConfiguration<GameRoom>
{
    public void Configure(EntityTypeBuilder<GameRoom> builder)
    {
        builder.ToTable("GameRooms", t =>
        {
            t.HasCheckConstraint("CK_GameRooms_BestOf", "[BestOf] IN (1, 3, 5)");
        });

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).ValueGeneratedNever();
        builder.Property(r => r.Code).HasMaxLength(8).IsRequired();
        builder.HasIndex(r => r.Code).IsUnique();
        builder.HasIndex(r => r.Status);
        builder.HasIndex(r => r.ExpiresAtUtc);
        builder.Property(r => r.RowVersion).IsRowVersion();

        builder.HasMany(r => r.Players)
            .WithOne(p => p.Room)
            .HasForeignKey(p => p.RoomId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(r => r.Matches)
            .WithOne(m => m.Room)
            .HasForeignKey(m => m.RoomId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PlayerConfiguration : IEntityTypeConfiguration<Player>
{
    public void Configure(EntityTypeBuilder<Player> builder)
    {
        builder.ToTable("Players", t =>
        {
            t.HasCheckConstraint("CK_Players_Seat", "[Seat] IN (1, 2)");
            t.HasCheckConstraint("CK_Players_DisplayName", "LEN([DisplayName]) >= 2");
        });

        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).ValueGeneratedNever();
        builder.Property(p => p.DisplayName).HasMaxLength(30).IsRequired();
        builder.Property(p => p.SessionTokenHash).HasMaxLength(88).IsRequired();
        builder.HasIndex(p => new { p.RoomId, p.Seat }).IsUnique();
    }
}

public sealed class MatchConfiguration : IEntityTypeConfiguration<Match>
{
    public void Configure(EntityTypeBuilder<Match> builder)
    {
        builder.ToTable("Matches", t =>
        {
            t.HasCheckConstraint("CK_Matches_BestOf", "[BestOf] IN (1, 3, 5)");
        });

        builder.HasKey(m => m.Id);
        builder.Property(m => m.Id).ValueGeneratedNever();
        builder.HasIndex(m => new { m.RoomId, m.MatchNumber }).IsUnique();
        builder.Property(m => m.RowVersion).IsRowVersion();

        builder.HasMany(m => m.Rounds)
            .WithOne(r => r.Match)
            .HasForeignKey(r => r.MatchId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class RoundConfiguration : IEntityTypeConfiguration<Round>
{
    public void Configure(EntityTypeBuilder<Round> builder)
    {
        builder.ToTable("Rounds");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).ValueGeneratedNever();
        builder.Property(r => r.PendingDice).HasMaxLength(32).HasDefaultValue(string.Empty);
        builder.HasIndex(r => new { r.MatchId, r.RoundNumber }).IsUnique();
        builder.Property(r => r.RowVersion).IsRowVersion();

        builder.HasMany(r => r.PlayerStates)
            .WithOne(s => s.Round)
            .HasForeignKey(s => s.RoundId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(r => r.DiceRolls)
            .WithOne(d => d.Round)
            .HasForeignKey(d => d.RoundId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PlayerRoundStateConfiguration : IEntityTypeConfiguration<PlayerRoundState>
{
    public void Configure(EntityTypeBuilder<PlayerRoundState> builder)
    {
        builder.ToTable("PlayerRoundStates", t =>
        {
            t.HasCheckConstraint("CK_PlayerRoundStates_CollectedCount", "[CollectedCount] BETWEEN 0 AND 15");
        });

        builder.HasKey(s => s.Id);
        builder.Property(s => s.Id).ValueGeneratedNever();
        builder.HasIndex(s => new { s.RoundId, s.PlayerId }).IsUnique();

        builder.HasMany(s => s.PointStates)
            .WithOne(p => p.PlayerRoundState)
            .HasForeignKey(p => p.PlayerRoundStateId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PlayerPointStateConfiguration : IEntityTypeConfiguration<PlayerPointState>
{
    public void Configure(EntityTypeBuilder<PlayerPointState> builder)
    {
        builder.ToTable("PlayerPointStates", t =>
        {
            t.HasCheckConstraint("CK_PlayerPointStates_PointNumber", "[PointNumber] BETWEEN 1 AND 6");
            t.HasCheckConstraint("CK_PlayerPointStates_BackCount", "[BackCount] >= 0");
            t.HasCheckConstraint("CK_PlayerPointStates_FrontCount", "[FrontCount] >= 0");
        });

        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).ValueGeneratedNever();
        builder.HasIndex(p => new { p.PlayerRoundStateId, p.PointNumber }).IsUnique();
    }
}

public sealed class DiceRollConfiguration : IEntityTypeConfiguration<DiceRoll>
{
    public void Configure(EntityTypeBuilder<DiceRoll> builder)
    {
        builder.ToTable("DiceRolls", t =>
        {
            t.HasCheckConstraint("CK_DiceRolls_Die1", "[Die1] BETWEEN 1 AND 6");
            t.HasCheckConstraint("CK_DiceRolls_Die2", "[Die2] BETWEEN 1 AND 6");
        });

        builder.HasKey(d => d.Id);
        builder.Property(d => d.Id).ValueGeneratedNever();
        builder.HasIndex(d => d.CommandId).IsUnique();
        builder.HasIndex(d => new { d.RoundId, d.TurnNumber }).IsUnique();
        builder.Property(d => d.ResolutionJson).IsRequired();
    }
}

public sealed class GameEventConfiguration : IEntityTypeConfiguration<GameEvent>
{
    public void Configure(EntityTypeBuilder<GameEvent> builder)
    {
        builder.ToTable("GameEvents");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id).ValueGeneratedOnAdd();
        builder.Property(e => e.EventType).HasMaxLength(64).IsRequired();
        builder.Property(e => e.PayloadJson).IsRequired();
        builder.HasIndex(e => new { e.RoomId, e.SequenceNumber });
    }
}
