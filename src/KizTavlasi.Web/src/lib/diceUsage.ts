/**
 * Hangi zar artık "kullanıldı" (hamlesi oynandı veya boşa gitti)? Yalnızca sunucudan gelen
 * bekleyen zarlara bakılır; kural hesaplanmaz.
 *
 * Çift zarda iki zar da ilk hamle ile serbest haklar bitene kadar canlı kalır (altın vurgu sade
 * kalır, dört zar gösterilmez).
 */
export function diceUsage(
  dice: [number, number],
  pendingDice: readonly number[],
  hasPendingMoves: boolean,
): [boolean, boolean] {
  if (dice[0] === dice[1]) {
    return [!hasPendingMoves, !hasPendingMoves];
  }

  const remaining = [...pendingDice];
  const used = dice.map((value) => {
    const index = remaining.indexOf(value);
    if (index === -1) return true;
    remaining.splice(index, 1);
    return false;
  });
  return [used[0], used[1]];
}
