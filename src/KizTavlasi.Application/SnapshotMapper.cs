using KizTavlasi.Application.Dtos;
using KizTavlasi.Domain.Entities;

namespace KizTavlasi.Application;

/// <summary>Entity graf'ından authoritative istemci snapshot'ı üretir.</summary>
public static class SnapshotMapper
{
    public static RoomSnapshotDto ToSnapshot(GameRoom room, Match? match, Round? round, DateTime serverTimeUtc)
    {
        var players = room.Players
            .OrderBy(p => p.Seat)
            .Select(p => new PlayerDto(p.Id, p.DisplayName, p.Seat, p.IsConnected, p.Id == room.HostPlayerId))
            .ToList();

        MatchDto? matchDto = null;
        if (match is not null)
        {
            RoundDto? roundDto = null;
            if (round is not null)
            {
                var boards = round.PlayerStates
                    .Select(s =>
                    {
                        var seat = room.Players.First(p => p.Id == s.PlayerId).Seat;
                        var points = s.PointStates
                            .OrderBy(ps => ps.PointNumber)
                            .Select(ps => new PointStateDto(ps.PointNumber, ps.BackCount, ps.FrontCount))
                            .ToList();
                        var isCollecting = points.All(p => p.BackCount <= 1);
                        return new PlayerBoardDto(s.PlayerId, seat, points, s.CollectedCount, isCollecting);
                    })
                    .OrderBy(b => b.Seat)
                    .ToList();

                List<int> pendingDice = string.IsNullOrEmpty(round.PendingDice)
                    ? []
                    : round.PendingDice.Split(',').Select(int.Parse).ToList();

                roundDto = new RoundDto(
                    round.Id,
                    round.RoundNumber,
                    round.Status.ToString(),
                    round.StartingPlayerId,
                    round.CurrentPlayerId,
                    round.WinnerPlayerId,
                    round.TurnNumber,
                    pendingDice,
                    round.PendingBonusPicks,
                    boards);
            }

            matchDto = new MatchDto(
                match.Id,
                match.MatchNumber,
                match.BestOf,
                match.RequiredWins,
                match.Status.ToString(),
                match.Player1Score,
                match.Player2Score,
                match.WinnerPlayerId,
                roundDto);
        }

        return new RoomSnapshotDto(
            room.Code,
            room.Status.ToString(),
            room.BestOf,
            room.HostPlayerId,
            players,
            matchDto,
            room.RematchRequestedByPlayerId,
            room.StateVersion,
            serverTimeUtc);
    }
}
