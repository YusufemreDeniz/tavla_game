/**
 * Oyuncu tokenları odaya özel anahtarla sessionStorage'da tutulur.
 * Böylece aynı tarayıcıda iki sekmede iki farklı oda oynanabilir
 * ve sekme kapanınca token temizlenir.
 */
const keyFor = (roomCode: string) => `kiztavlasi:token:${roomCode.toUpperCase()}`;
const spectatorKeyFor = (roomCode: string) => `kiztavlasi:spectator:${roomCode.toUpperCase()}`;

function safeStorage(action: () => void): void {
  try {
    action();
  } catch {
    // Gizli sekme vb. durumlarda depolama erişilemez olabilir; oturum bellekte sürer.
  }
}

/** Salt okunur izleyici token'ı (oyuncu token'ından ayrı anahtarda). */
export function saveSpectatorToken(roomCode: string, token: string): void {
  safeStorage(() => sessionStorage.setItem(spectatorKeyFor(roomCode), token));
}

export function getSpectatorToken(roomCode: string): string | null {
  try {
    return sessionStorage.getItem(spectatorKeyFor(roomCode));
  } catch {
    return null;
  }
}

export function clearSpectatorToken(roomCode: string): void {
  safeStorage(() => sessionStorage.removeItem(spectatorKeyFor(roomCode)));
}

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
