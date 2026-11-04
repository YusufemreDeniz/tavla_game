using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KizTavlasi.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBotsTurnTimerAndDeadline : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "TurnDeadlineUtc",
                table: "Rounds",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BotDifficulty",
                table: "Players",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TurnTimeLimitSeconds",
                table: "GameRooms",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Rounds_TurnDeadlineUtc",
                table: "Rounds",
                column: "TurnDeadlineUtc",
                filter: "[TurnDeadlineUtc] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Players_BotDifficulty",
                table: "Players",
                sql: "[BotDifficulty] IS NULL OR [BotDifficulty] IN (1, 2)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_GameRooms_TurnTimeLimitSeconds",
                table: "GameRooms",
                sql: "[TurnTimeLimitSeconds] IS NULL OR [TurnTimeLimitSeconds] IN (15, 30)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Rounds_TurnDeadlineUtc",
                table: "Rounds");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Players_BotDifficulty",
                table: "Players");

            migrationBuilder.DropCheckConstraint(
                name: "CK_GameRooms_TurnTimeLimitSeconds",
                table: "GameRooms");

            migrationBuilder.DropColumn(
                name: "TurnDeadlineUtc",
                table: "Rounds");

            migrationBuilder.DropColumn(
                name: "BotDifficulty",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "TurnTimeLimitSeconds",
                table: "GameRooms");
        }
    }
}
