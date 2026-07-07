/**
 * Oyuncu tokenları odaya özel anahtarla sessionStorage'da tutulur.
 * Böylece aynı tarayıcıda iki sekmede iki farklı oda oynanabilir
 * ve sekme kapanınca token temizlenir.
 */
const keyFor = (roomCode: string) => `kiztavlasi:token:${roomCode.toUpperCase()}`;

export function savePlayerToken(roomCode: string, token: string): void {
  sessionStorage.setItem(keyFor(roomCode), token);
}

export function getPlayerToken(roomCode: string): string | null {
  return sessionStorage.getItem(keyFor(roomCode));
}

export function clearPlayerToken(roomCode: string): void {
  sessionStorage.removeItem(keyFor(roomCode));
}

/** Token payload'ından playerId okur (yalnızca UI için; sunucu her zaman yeniden doğrular). */
export function playerIdFromToken(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded.playerId === 'string' ? decoded.playerId : null;
  } catch {
    return null;
  }
}
