using System.Collections.Concurrent;
using System.Collections.Immutable;

namespace KizTavlasi.Api.Realtime;

/// <summary>
/// Oda başına bağlı izleyici bağlantılarını sayar (yalnızca canlı gösterge içindir;
/// izleyiciler veritabanına yazılmaz). Tek instance MVP'de bellek içi tutulur;
/// çoklu instance'ta Redis backplane ile birlikte paylaşılan bir sayaca taşınmalıdır.
/// </summary>
public static class SpectatorTracker
{
    private static readonly ConcurrentDictionary<string, ImmutableHashSet<string>> Connections =
        new(StringComparer.OrdinalIgnoreCase);

    public static int Add(string roomCode, string connectionId) =>
        Connections.AddOrUpdate(roomCode, _ => [connectionId], (_, set) => set.Add(connectionId)).Count;

    public static int Remove(string roomCode, string connectionId)
    {
        while (Connections.TryGetValue(roomCode, out var set))
        {
            var updated = set.Remove(connectionId);
            if (updated.IsEmpty)
            {
                if (Connections.TryRemove(new KeyValuePair<string, ImmutableHashSet<string>>(roomCode, set)))
                {
                    return 0;
                }
            }
            else if (Connections.TryUpdate(roomCode, updated, set))
            {
                return updated.Count;
            }
        }
        return 0;
    }

    public static int Count(string roomCode) =>
        Connections.TryGetValue(roomCode, out var set) ? set.Count : 0;
}
