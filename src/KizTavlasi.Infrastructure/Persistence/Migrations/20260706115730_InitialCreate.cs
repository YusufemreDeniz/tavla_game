using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KizTavlasi.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GameEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RoomId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RoundId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SequenceNumber = table.Column<long>(type: "bigint", nullable: false),
                    EventType = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    PayloadJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OccurredAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameEvents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "GameRooms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    BestOf = table.Column<int>(type: "int", nullable: false),
                    HostPlayerId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CurrentMatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RematchRequestedByPlayerId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    StateVersion = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CompletedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameRooms", x => x.Id);
                    table.CheckConstraint("CK_GameRooms_BestOf", "[BestOf] IN (1, 3, 5)");
                });

            migrationBuilder.CreateTable(
                name: "Matches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RoomId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MatchNumber = table.Column<int>(type: "int", nullable: false),
                    BestOf = table.Column<int>(type: "int", nullable: false),
                    RequiredWins = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Player1Score = table.Column<int>(type: "int", nullable: false),
                    Player2Score = table.Column<int>(type: "int", nullable: false),
                    CurrentRoundId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    WinnerPlayerId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    StartedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    StateVersion = table.Column<long>(type: "bigint", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Matches", x => x.Id);
                    table.CheckConstraint("CK_Matches_BestOf", "[BestOf] IN (1, 3, 5)");
                    table.ForeignKey(
                        name: "FK_Matches_GameRooms_RoomId",
                        column: x => x.RoomId,
                        principalTable: "GameRooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Players",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RoomId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Seat = table.Column<int>(type: "int", nullable: false),
                    SessionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SessionTokenHash = table.Column<string>(type: "nvarchar(88)", maxLength: 88, nullable: false),
                    IsConnected = table.Column<bool>(type: "bit", nullable: false),
                    JoinedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastSeenAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DisconnectedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Players", x => x.Id);
                    table.CheckConstraint("CK_Players_DisplayName", "LEN([DisplayName]) >= 2");
                    table.CheckConstraint("CK_Players_Seat", "[Seat] IN (1, 2)");
                    table.ForeignKey(
                        name: "FK_Players_GameRooms_RoomId",
                        column: x => x.RoomId,
                        principalTable: "GameRooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Rounds",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RoundNumber = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    StartingPlayerId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CurrentPlayerId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    WinnerPlayerId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TurnNumber = table.Column<int>(type: "int", nullable: false),
                    StartedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    StateVersion = table.Column<long>(type: "bigint", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Rounds", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Rounds_Matches_MatchId",
                        column: x => x.MatchId,
                        principalTable: "Matches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DiceRolls",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RoundId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlayerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TurnNumber = table.Column<int>(type: "int", nullable: false),
                    Die1 = table.Column<int>(type: "int", nullable: false),
                    Die2 = table.Column<int>(type: "int", nullable: false),
                    IsDouble = table.Column<bool>(type: "bit", nullable: false),
                    CommandId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ResolutionJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiceRolls", x => x.Id);
                    table.CheckConstraint("CK_DiceRolls_Die1", "[Die1] BETWEEN 1 AND 6");
                    table.CheckConstraint("CK_DiceRolls_Die2", "[Die2] BETWEEN 1 AND 6");
                    table.ForeignKey(
                        name: "FK_DiceRolls_Rounds_RoundId",
                        column: x => x.RoundId,
                        principalTable: "Rounds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlayerRoundStates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RoundId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlayerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CollectedCount = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlayerRoundStates", x => x.Id);
                    table.CheckConstraint("CK_PlayerRoundStates_CollectedCount", "[CollectedCount] BETWEEN 0 AND 15");
                    table.ForeignKey(
                        name: "FK_PlayerRoundStates_Rounds_RoundId",
                        column: x => x.RoundId,
                        principalTable: "Rounds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlayerPointStates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlayerRoundStateId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PointNumber = table.Column<int>(type: "int", nullable: false),
                    BackCount = table.Column<int>(type: "int", nullable: false),
                    FrontCount = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlayerPointStates", x => x.Id);
                    table.CheckConstraint("CK_PlayerPointStates_BackCount", "[BackCount] >= 0");
                    table.CheckConstraint("CK_PlayerPointStates_FrontCount", "[FrontCount] >= 0");
                    table.CheckConstraint("CK_PlayerPointStates_PointNumber", "[PointNumber] BETWEEN 1 AND 6");
                    table.ForeignKey(
                        name: "FK_PlayerPointStates_PlayerRoundStates_PlayerRoundStateId",
                        column: x => x.PlayerRoundStateId,
                        principalTable: "PlayerRoundStates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DiceRolls_CommandId",
                table: "DiceRolls",
                column: "CommandId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DiceRolls_RoundId_TurnNumber",
                table: "DiceRolls",
                columns: new[] { "RoundId", "TurnNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GameEvents_RoomId_SequenceNumber",
                table: "GameEvents",
                columns: new[] { "RoomId", "SequenceNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_GameRooms_Code",
                table: "GameRooms",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GameRooms_ExpiresAtUtc",
                table: "GameRooms",
                column: "ExpiresAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_GameRooms_Status",
                table: "GameRooms",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_Matches_RoomId_MatchNumber",
                table: "Matches",
                columns: new[] { "RoomId", "MatchNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlayerPointStates_PlayerRoundStateId_PointNumber",
                table: "PlayerPointStates",
                columns: new[] { "PlayerRoundStateId", "PointNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlayerRoundStates_RoundId_PlayerId",
                table: "PlayerRoundStates",
                columns: new[] { "RoundId", "PlayerId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Players_RoomId_Seat",
                table: "Players",
                columns: new[] { "RoomId", "Seat" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Rounds_MatchId_RoundNumber",
                table: "Rounds",
                columns: new[] { "MatchId", "RoundNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DiceRolls");

            migrationBuilder.DropTable(
                name: "GameEvents");

            migrationBuilder.DropTable(
                name: "PlayerPointStates");

            migrationBuilder.DropTable(
                name: "Players");

            migrationBuilder.DropTable(
                name: "PlayerRoundStates");

            migrationBuilder.DropTable(
                name: "Rounds");

            migrationBuilder.DropTable(
                name: "Matches");

            migrationBuilder.DropTable(
                name: "GameRooms");
        }
    }
}
