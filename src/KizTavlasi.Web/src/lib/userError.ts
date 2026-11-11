import { ApiError } from '../api/client';
import type { ConnectionStatus, GameErrorCode } from '../types/game';

/** Bilinmeyen teknik hatalarda kullanıcıya gösterilen güvenli mesaj. */
export const GENERIC_ACTION_ERROR = 'İşlem gerçekleştirilemedi. Lütfen tekrar deneyin.';
/** Bağlantı durumu güvenilir biçimde kopuk (reconnecting/disconnected) iken gösterilen mesaj. */
export const CONNECTION_LOST_ERROR = 'Bağlantı kesildi. Lütfen tekrar deneyin.';
/** Kodsuz HTTP 429 için sabit istemci mesajı (sunucu başlığı kullanılmaz). */
export const RATE_LIMITED_ERROR = 'Çok fazla istek gönderildi. Lütfen biraz bekleyin.';
/** Ağa hiç ulaşılamadığında (ApiError status 0) sabit istemci mesajı; `ApiError.message` kullanılmaz. */
export const NETWORK_ERROR = 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.';

const HUB_EXCEPTION_MARKER = 'HubException: ';

/**
 * Backend `DomainErrorCodes` ile birebir aynı, tanımlı domain hata kodları (tek güvenilir kimlik kaynağı).
 * Bir hatanın güvenilirliği dilinden değil, bu kodlardan birini taşımasından gelir.
 */
const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set<GameErrorCode>([
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_EXPIRED',
  'PLAYER_NOT_IN_ROOM',
  'INVALID_SESSION',
  'MATCH_ALREADY_STARTED',
  'MATCH_NOT_ACTIVE',
  'NOT_YOUR_TURN',
  'ROLL_ALREADY_IN_PROGRESS',
  'STALE_STATE',
  'INVALID_COMMAND',
  'REMATCH_NOT_AVAILABLE',
  'ROUND_ALREADY_COMPLETED',
  'NOT_HOST',
  'SPECTATOR_READ_ONLY',
]);

interface UserMessageOptions {
  /** Bağlama özgü güvenli mesaj (ör. "Odaya katılınamadı."); verilmezse genel mesaj. */
  fallback?: string;
  /** Domain errorCode → kullanıcıya yönelik istemci tarafı Türkçe metin. */
  known?: Record<string, string>;
  /**
   * Çağıranın o anki GERÇEK bağlantı durumu. Yalnızca reconnecting/disconnected ise bağlantı mesajı üretilir;
   * hata metninden bağlantı sorunu tahmin edilmez.
   */
  connectionStatus?: ConnectionStatus;
}

/**
 * Bir hatayı kullanıcıya gösterilecek güvenli bir mesaja çevirir. Saf fonksiyondur: store, API, SignalR, token
 * kullanmaz; hata nesnesini değiştirmez. Sunucudan gelen SERBEST METNİ (HubException gövdesi, kodsuz `title`)
 * güvenilir saymaz. Oturum/yetki sınıflandırması bu fonksiyonun işi DEĞİLDİR (çağıranın kendi akışında, mesajdan
 * önce yapılır); HTTP durum kodu burada yalnızca mesaj seçer, hiçbir yetki/oturum kararı üretmez.
 */
export function toUserMessage(error: unknown, options: UserMessageOptions = {}): string {
  const fallback = options.fallback ?? GENERIC_ACTION_ERROR;

  if (error instanceof ApiError) {
    // Sunucu `title`/`message` hiçbir koşulda gösterilmez: mesaj yalnızca istemci eşlemesinden, sabit istemci
    // mesajlarından veya bağlam fallback'inden gelir (sunucu başlığının Türkçe olması güvenilirlik gerekçesi değildir).
    const code = error.errorCode;
    if (code !== null) {
      return (KNOWN_ERROR_CODES.has(code) && options.known?.[code]) || fallback;
    }
    if (error.status === 0) return NETWORK_ERROR;
    if (error.status === 429) return RATE_LIMITED_ERROR;
    return fallback;
  }

  // HubException: yalnızca gövde TAMAMEN tanımlı bir domain kodu ise ve çağıran o kod için metin verdiyse.
  const message = error instanceof Error ? error.message : '';
  const markerAt = message.indexOf(HUB_EXCEPTION_MARKER);
  if (markerAt >= 0) {
    const body = message.slice(markerAt + HUB_EXCEPTION_MARKER.length).trim();
    const mapped = KNOWN_ERROR_CODES.has(body) ? options.known?.[body] : undefined;
    if (mapped) return mapped;
  }

  if (options.connectionStatus === 'reconnecting' || options.connectionStatus === 'disconnected') {
    return CONNECTION_LOST_ERROR;
  }
  return fallback;
}
