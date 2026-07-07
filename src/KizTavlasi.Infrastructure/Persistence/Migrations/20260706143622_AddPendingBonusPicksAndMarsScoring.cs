using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KizTavlasi.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPendingBonusPicksAndMarsScoring : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PendingBonusPicks",
                table: "Rounds",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PendingBonusPicks",
                table: "Rounds");
        }
    }
}
