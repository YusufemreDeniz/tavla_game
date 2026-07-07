using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KizTavlasi.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPendingDiceForManualMoves : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PendingDice",
                table: "Rounds",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PendingDice",
                table: "Rounds");
        }
    }
}
