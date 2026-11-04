using System.Text.Json;
using KizTavlasi.Application.Abstractions;
using KizTavlasi.Application.Dtos;
using KizTavlasi.Domain;
using KizTavlasi.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace KizTavlasi.Application;

/// <summary>
/// Maç analitiği: "Şans vs. Strateji" özeti ve maçın kırılma anı. Kural hesaplamaz;
/// yalnızca sunucunun kaydettiği zar atışlarını (DiceRolls) ve olay günlüğünü (GameEvents) okur.
/// </summary>
public sealed class MatchStatsService
{
    private readonly IGameDbContext _db;
    private readonly RoomService _roomService;

    public MatchStatsService(IGameDbContext db, RoomService roomService)
    {
        _db = db;
        _roomService = roomService;
    }

    /// <summary>Odanın güncel (veya yeni biten) maçının istatistikleri.</summary>
    public async Task<MatchStatsDto> GetCurrentMatchStatsAsync(Guid roomId, CancellationToken ct = default)
    {
        var (room, match, _) = await _roomService.LoadRoomGraphAsync(roomId, tracking: false, ct);
        if (match is null)
        {
            throw new GameDomainException(DomainErrorCodes.MatchNotActive, "Bu odada henüz oynanmış bir maç yok.");
        }

        var rounds = await _db.Rounds.AsNoTracking()
            .Where(r => r.MatchId == match.Id)
            .OrderBy(r => r.RoundNumber)
            .Select(r => new { r.Id, r.RoundNumber })
            .ToListAsync(ct);
        var roundNumberById = rounds.ToDictionary(r => r.Id, r => r.RoundNumber);
        var roundIds = rounds.Select(r => r.Id).ToList();

        var rolls = (await _db.DiceRolls.AsNoTracking()
                .Where(d => roundIds.Contains(d.RoundId))
                .ToListAsync(ct))
            .OrderBy(d => roundNumberById[d.RoundId])
            .ThenBy(d => d.TurnNumber)
            .ToList();

        var events = await _db.GameEvents.AsNoTracking()
            .Where(e => e.MatchId == match.Id
                        && (e.EventType == GameEventTypes.MovePlayed || e.EventType == GameEventTypes.RoundCompleted))
            .OrderBy(e => e.Id)
            .ToListAsync(ct);

        var moves = events
            .Where(e => e.EventType == GameEventTypes.MovePlayed && e.RoundId is not null)
            .Select(e => (RoundId: e.RoundId!.Value, Payload: JsonSerializer.Deserialize<MovePlayedEventPayload>(e.PayloadJson)))
            .Where(m => m.Payload is not null)
            .Select(m => (m.RoundId, Payload: m.Payload!))
            .ToList();
        var roundResults = events
            .Where(e => e.EventType == GameEventTypes.RoundCompleted)
            .Select(e => JsonSerializer.Deserialize<RoundCompletedEventPayload>(e.PayloadJson))
            .Where(r => r is not null)
            .Select(r => r!)
            .ToList();

        var players = room.Players.OrderBy(p => p.Seat).ToList();
        var stats = players
            .Select(p => BuildPlayerStats(p, match, rolls, moves, roundResults, roundNumberById))
            .ToList();
        var highlight = FindHighlight(players, rolls, moves, roundResults, roundNumberById);

        return new MatchStatsDto(match.Id, rounds.Count, rolls.Count, stats, highlight);
    }

    private static PlayerMatchStatsDto BuildPlayerStats(
        Player player,
        Match match,
        IReadOnlyList<DiceRoll> rolls,
        IReadOnlyList<(Guid RoundId, MovePlayedEventPayload Payload)> moves,
        IReadOnlyList<RoundCompletedEventPayload> roundResults,
        IReadOnlyDictionary<Guid, int> roundNumberById)
    {
        var own = rolls.Where(r => r.PlayerId == player.Id).ToList();
        var wastedAtRoll = own.Sum(r => ReadResolution(r)?.WastedSteps.Count ?? 0);
        var wastedAfterMoves = moves.Where(m => m.Payload.PlayerId == player.Id).Sum(m => m.Payload.WastedDiceCount);

        // İndirmenin bittiği tur: o eldeki kendi kaçıncı zar atışı.
        var bringDownTurns = moves
            .Where(m => m.Payload.PlayerId == player.Id && m.Payload.BringDownCompleted)
            .Select(m => new
            {
                RoundNumber = roundNumberById.GetValueOrDefault(m.RoundId),
                Turn = own.Count(r => r.RoundId == m.RoundId && r.TurnNumber <= m.Payload.RollTurnNumber)
            })
            .Where(x => x.Turn > 0)
            .OrderBy(x => x.RoundNumber)
            .ToList();

        return new PlayerMatchStatsDto(
            player.Id,
            own.Count,
            own.Count == 0 ? 0 : Math.Round(own.Average(r => r.Die1 + r.Die2), 2),
            own.Count(r => r.IsDouble),
            LongestDoubleStreak(own).Count,
            wastedAtRoll + wastedAfterMoves,
            bringDownTurns.Count == 0 ? null : bringDownTurns[^1].Turn,
            bringDownTurns.Count == 0 ? null : Math.Round(bringDownTurns.Average(x => x.Turn), 1),
            roundResults.Count(r => r.WinnerPlayerId == player.Id && r.IsMars),
            player.Seat == 1 ? match.Player1Score : match.Player2Score);
    }

    /// <summary>
    /// Maçın kırılma anı: en dramatik tek olay. Öncelik puanı: MARS &gt; aynı atışta aşama geçişi &gt;
    /// üst üste çiftler &gt; büyük çift &gt; en hızlı indirme. Eşitlikte sonraki el (maçın sonuna yakın) kazanır.
    /// </summary>
    private static MatchHighlightDto? FindHighlight(
        IReadOnlyList<Player> players,
        IReadOnlyList<DiceRoll> rolls,
        IReadOnlyList<(Guid RoundId, MovePlayedEventPayload Payload)> moves,
        IReadOnlyList<RoundCompletedEventPayload> roundResults,
        IReadOnlyDictionary<Guid, int> roundNumberById)
    {
        var candidates = new List<(int Score, MatchHighlightDto Highlight)>();
        string NameOf(Guid id) => players.FirstOrDefault(p => p.Id == id)?.DisplayName ?? "Oyuncu";

        foreach (var result in roundResults.Where(r => r.IsMars))
        {
            candidates.Add((100 + result.RoundNumber, new MatchHighlightDto(
                "Mars", result.WinnerPlayerId, result.RoundNumber,
                $"{NameOf(result.WinnerPlayerId)} {result.RoundNumber}. eli MARS ile aldı — rakip daha indirmeyi bitirememişti!")));
        }

        foreach (var group in moves.GroupBy(m => (m.RoundId, m.Payload.PlayerId, m.Payload.RollTurnNumber)))
        {
            var list = group.ToList();
            var transitionIndex = list.FindIndex(m => m.Payload.BringDownCompleted);
            if (transitionIndex >= 0 && list.Skip(transitionIndex + 1).Any(m => m.Payload.Action == nameof(DiceStepAction.Collect)))
            {
                var roundNumber = roundNumberById.GetValueOrDefault(group.Key.RoundId);
                candidates.Add((80 + roundNumber, new MatchHighlightDto(
                    "PhaseShift", group.Key.PlayerId, roundNumber,
                    $"{NameOf(group.Key.PlayerId)} {roundNumber}. elde aynı zar atışında indirmeyi bitirip toplamaya geçti.")));
            }
        }

        foreach (var player in players)
        {
            foreach (var roundRolls in rolls.Where(r => r.PlayerId == player.Id).GroupBy(r => r.RoundId))
            {
                var streak = LongestDoubleStreak(roundRolls.OrderBy(r => r.TurnNumber).ToList());
                if (streak.Count >= 2)
                {
                    var roundNumber = roundNumberById.GetValueOrDefault(roundRolls.Key);
                    candidates.Add((60 + streak.Count * 5 + roundNumber, new MatchHighlightDto(
                        "DoubleStreak", player.Id, roundNumber,
                        $"{player.DisplayName} {roundNumber}. elde üst üste {streak.Count} çift attı ({string.Join(", ", streak.Select(r => $"{r.Die1}-{r.Die2}"))})!")));
                }
            }
        }

        foreach (var roll in rolls.Where(r => r.IsDouble && r.Die1 >= 5))
        {
            var roundNumber = roundNumberById.GetValueOrDefault(roll.RoundId);
            candidates.Add((40 + roll.Die1 + roundNumber, new MatchHighlightDto(
                "BigDouble", roll.PlayerId, roundNumber,
                $"{NameOf(roll.PlayerId)} {roundNumber}. elde {roll.Die1}-{roll.Die2} atıp {roll.Die1 * 2} hamle hakkı kazandı.")));
        }

        if (candidates.Count == 0)
        {
            var fastest = moves
                .Where(m => m.Payload.BringDownCompleted)
                .Select(m => new
                {
                    m.Payload.PlayerId,
                    RoundNumber = roundNumberById.GetValueOrDefault(m.RoundId),
                    Turn = rolls.Count(r => r.RoundId == m.RoundId && r.PlayerId == m.Payload.PlayerId && r.TurnNumber <= m.Payload.RollTurnNumber)
                })
                .Where(x => x.Turn > 0)
                .OrderBy(x => x.Turn)
                .FirstOrDefault();
            if (fastest is not null)
            {
                candidates.Add((10, new MatchHighlightDto(
                    "FastBringDown", fastest.PlayerId, fastest.RoundNumber,
                    $"{NameOf(fastest.PlayerId)} {fastest.RoundNumber}. elde indirmeyi {fastest.Turn}. turda tamamladı.")));
            }
        }

        return candidates.Count == 0 ? null : candidates.MaxBy(c => c.Score).Highlight;
    }

    /// <summary>Kendi atış sırasındaki en uzun ardışık çift dizisi (el sınırında sıfırlanır).</summary>
    private static List<DiceRoll> LongestDoubleStreak(IReadOnlyList<DiceRoll> ownRolls)
    {
        var best = new List<DiceRoll>();
        var current = new List<DiceRoll>();
        Guid? roundId = null;
        foreach (var roll in ownRolls)
        {
            if (roll.RoundId != roundId)
            {
                current = [];
                roundId = roll.RoundId;
            }
            if (roll.IsDouble)
            {
                current.Add(roll);
                if (current.Count > best.Count)
                {
                    best = [.. current];
                }
            }
            else
            {
                current = [];
            }
        }
        return best;
    }

    private static DiceRollResultDto? ReadResolution(DiceRoll roll)
    {
        try
        {
            return JsonSerializer.Deserialize<DiceRollResultDto>(roll.ResolutionJson);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
