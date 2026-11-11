/**
 * Kullanıcıya gösterilecek hata mesajı eşlemesi (Aşama 3.10A, sertleştirme 3.10B). Saf fonksiyon testleri.
 *
 * Güvenlik sözleşmesi (3.10B):
 *  - Sunucudan gelen SERBEST METİN (HubException gövdesi, kodsuz `problem.title`) hiçbir koşulda güvenilir sayılmaz.
 *  - HubException: yalnızca gövde TAMAMEN tanımlı bir domain kodu ise ve çağıran o kod için istemci metni verdiyse gösterilir.
 *  - HTTP (3.10C, sıkı istemci sahipliği): sunucu `title`/`message` ASLA gösterilmez. Tanımlı errorCode → yalnızca çağıranın
 *    istemci eşlemesi, yoksa bağlam fallback'i; tanınmayan kod ve kodsuz yanıtlar → fallback. İstisna: status 0 (sabit istemci
 *    ağ mesajı) ve 429 (sabit istemci metni).
 *  - Bağlantı mesajı yalnızca çağıranın GERÇEK bağlantı durumuna bağlıdır.
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { CONNECTION_LOST_ERROR, GENERIC_ACTION_ERROR, NETWORK_ERROR, RATE_LIMITED_ERROR, toUserMessage } from './userError';

const TECHNICAL = [
  'WebSocket closed with status code: 0 (no reason given).',
  "An unexpected error occurred invoking 'StartMatch' on the server.",
  "Failed to complete negotiation with the server: Error: Unauthorized: Status code '401'",
  'TypeError: Failed to fetch',
  "Connection disconnected with error 'Error: WebSocket closed with status code: 1006 (sim).'.",
];

describe('toUserMessage — C: bilinmeyen teknik hatalar', () => {
  it.each(TECHNICAL)('ham teknik mesaj kullanıcıya gösterilmez: %s', (raw) => {
    const out = toUserMessage(new Error(raw));
    expect(out).toBe(GENERIC_ACTION_ERROR);
    expect(out).not.toContain('WebSocket');
    expect(out).not.toContain('negotiation');
    expect(out).not.toContain('fetch');
  });

  it("bilinmeyen Error güvenli fallback'e dönüşür; özel fallback verilirse o kullanılır", () => {
    expect(toUserMessage(new Error('boom'))).toBe(GENERIC_ACTION_ERROR);
    expect(toUserMessage(new Error('boom'), { fallback: 'Odaya katılınamadı.' })).toBe('Odaya katılınamadı.');
  });

  it('boş mesaj ve beklenmedik değerler hata fırlatmadan fallback üretir', () => {
    for (const value of [new Error(''), new Error('   '), null, undefined, '', 'düz metin', 42, {}, { message: 'x' }, Symbol('s'), []]) {
      expect(() => toUserMessage(value)).not.toThrow();
      expect(toUserMessage(value)).toBe(GENERIC_ACTION_ERROR);
    }
  });

  it('hata nesnesini değiştirmez', () => {
    const error = new Error('WebSocket closed with status code: 0');
    toUserMessage(error, { connectionStatus: 'reconnecting' });
    expect(error.message).toBe('WebSocket closed with status code: 0');
    expect(Object.keys(error)).toEqual([]);
  });
});

describe('toUserMessage — A: güvenilir bağlantı durumu', () => {
  it.each(['reconnecting', 'disconnected'] as const)('%s durumunda bilinmeyen hata bağlantı mesajına dönüşür (ham metin yok)', (status) => {
    const out = toUserMessage(new Error('WebSocket closed with status code: 0 (no reason given).'), { connectionStatus: status });
    expect(out).toBe(CONNECTION_LOST_ERROR);
    expect(out).toBe('Bağlantı kesildi. Lütfen tekrar deneyin.');
  });

  it.each(['connected', 'connecting', 'idle', undefined] as const)(
    'bağlantı %s iken ilgisiz hata bağlantı kesintisi diye sınıflandırılmaz',
    (status) => {
      expect(toUserMessage(new Error('Cannot read properties of undefined'), { connectionStatus: status })).toBe(GENERIC_ACTION_ERROR);
    },
  );

  it('bağlantı mesajı metin tahminine değil yalnızca duruma bağlıdır: bağlıyken "WebSocket" içeren metin fallback alır', () => {
    expect(toUserMessage(new Error('WebSocket closed with status code: 0'), { connectionStatus: 'connected' })).toBe(GENERIC_ACTION_ERROR);
  });
});

describe('toUserMessage — HubException güvenliği (3.10B)', () => {
  const known = { ROOM_EXPIRED: 'Bu odanın süresi dolmuş.', SPECTATOR_READ_ONLY: 'İzleyiciler hamle yapamaz.' };

  it.each([
    'An unexpected error occurred: HubException: Bu işlem şu an yapılamaz.',
    'An unexpected error occurred: HubException: Server=(localdb)\\MSSQLLocalDB;Database=KizTavlasiOnline;Trusted_Connection=True',
    'An unexpected error occurred: HubException: System.InvalidOperationException: x at KizTavlasi.Api.GameHub.StartMatch() in C:\\src\\GameHub.cs:line 42',
    'An unexpected error occurred: HubException: SELECT * FROM Players WHERE Token = \'abc\'',
    'An unexpected error occurred: HubException: https://internal.example.com/hubs/game?access_token=abc',
    'An unexpected error occurred: HubException: Tamamen Türkçe ama keyfi bir sunucu metni.',
  ])('keyfi HubException gövdesi (Türkçe olsa bile) kullanıcıya gösterilmez: %s', (raw) => {
    const out = toUserMessage(new Error(raw), { known });
    expect(out).toBe(GENERIC_ACTION_ERROR);
    expect(out).not.toMatch(/localdb|Exception|SELECT|https?:|access_token|Türkçe|yapılamaz/i);
  });

  it('gövde TAMAMEN tanımlı bir domain kodu ise ve çağıran o kod için istemci metni verdiyse o metin gösterilir', () => {
    expect(toUserMessage(new Error('An unexpected error occurred: HubException: ROOM_EXPIRED'), { known })).toBe('Bu odanın süresi dolmuş.');
    expect(toUserMessage(new Error('HubException: SPECTATOR_READ_ONLY  '), { known })).toBe('İzleyiciler hamle yapamaz.');
  });

  it('domain kodu çağıranın eşlemesinde yoksa veya kod gövdenin yalnızca bir parçasıysa fallback kullanılır', () => {
    expect(toUserMessage(new Error('HubException: NOT_HOST'), { known })).toBe(GENERIC_ACTION_ERROR);
    expect(toUserMessage(new Error('HubException: ROOM_EXPIRED ve ek ayrıntı'), { known })).toBe(GENERIC_ACTION_ERROR);
    expect(toUserMessage(new Error('HubException: FOO_BAR'), { known: { FOO_BAR: 'x' } })).toBe(GENERIC_ACTION_ERROR);
    expect(toUserMessage(new Error('HubException: '), { known })).toBe(GENERIC_ACTION_ERROR);
  });

  it('önek tek başına güvenilir yapmaz; bağlantı durumu reconnecting ise bağlantı mesajı kullanılır', () => {
    expect(toUserMessage(new Error('HubException: Sıra sende değil.'), { connectionStatus: 'reconnecting' })).toBe(CONNECTION_LOST_ERROR);
    expect(toUserMessage(new Error('HubException: ROOM_EXPIRED'), { known, connectionStatus: 'reconnecting' })).toBe('Bu odanın süresi dolmuş.');
  });
});

describe('toUserMessage — HTTP hata yüzeyi (3.10B)', () => {
  const known = { ROOM_FULL: 'Bu oda dolu; en fazla iki oyuncu katılabilir.' };
  const TITLE = 'Some framework title: Server=(localdb)\\x at System.Foo.Bar() in C:\\src\\a.cs';

  it.each([400, 401, 403, 404, 405, 409, 415, 418, 422, 500, 502, 503, 504, 599])(
    'kodsuz HTTP %i: sunucu başlığı ham gösterilmez, bağlam fallback\'i kullanılır',
    (status) => {
      expect(toUserMessage(new ApiError(status, 'Bu başlık Türkçe ama güvenilmez.', null), { fallback: 'Odaya katılınamadı.' })).toBe('Odaya katılınamadı.');
      expect(toUserMessage(new ApiError(status, TITLE, null))).toBe(GENERIC_ACTION_ERROR);
    },
  );

  it('kodsuz 403 ve 409 başlıkları özellikle gösterilmez (oturum/yetki kararı üretilmez, yalnızca mesaj)', () => {
    expect(toUserMessage(new ApiError(403, 'Forbidden', null))).toBe(GENERIC_ACTION_ERROR);
    expect(toUserMessage(new ApiError(409, 'Conflict', null))).toBe(GENERIC_ACTION_ERROR);
  });

  it('bilinmeyen HTTP durumları (ör. 301, 0 olmayan garip değerler) fallback alır', () => {
    for (const status of [301, 307, 451, 600, -1]) {
      expect(toUserMessage(new ApiError(status, 'x', null))).toBe(GENERIC_ACTION_ERROR);
    }
  });

  it('status=0 mevcut istemci ağ mesajı davranışını korur (mesaj alanı değil, istemci sabiti kullanılır)', () => {
    expect(NETWORK_ERROR).toBe('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
    expect(toUserMessage(new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.', null))).toBe(NETWORK_ERROR);
    // 3.10C: status=0 için de ApiError.message güvenilir sayılmaz.
    expect(toUserMessage(new ApiError(0, '  ', null), { fallback: 'Oda oluşturulamadı.' })).toBe(NETWORK_ERROR);
    expect(toUserMessage(new ApiError(0, 'Her şey bozuldu https://x.example.com?access_token=abc', null))).toBe(NETWORK_ERROR);
  });

  it('kodsuz 429 sabit, güvenli istemci mesajını alır (sunucu başlığı kullanılmaz)', () => {
    expect(RATE_LIMITED_ERROR).toBe('Çok fazla istek gönderildi. Lütfen biraz bekleyin.');
    expect(toUserMessage(new ApiError(429, 'Too Many Requests', null))).toBe(RATE_LIMITED_ERROR);
    expect(toUserMessage(new ApiError(429, 'Çok fazla istek gönderildi. Lütfen biraz bekleyin.', null))).toBe(RATE_LIMITED_ERROR);
  });

  it('bilinen errorCode: çağıranın istemci eşlemesi önceliklidir', () => {
    expect(toUserMessage(new ApiError(409, 'sunucu metni', 'ROOM_FULL'), { known })).toBe('Bu oda dolu; en fazla iki oyuncu katılabilir.');
  });

  it('tanımlı errorCode ama istemci eşlemesi yoksa: sunucu başlığı (Türkçe olsa bile) gösterilmez, fallback kullanılır (3.10C)', () => {
    // 3.10B'de bu durumda teknik içerik süzgecinden geçen sunucu başlığı gösteriliyordu; artık istemci sahipliği zorunlu.
    expect(toUserMessage(new ApiError(400, 'Geçersiz istek metni.', 'INVALID_COMMAND'))).toBe(GENERIC_ACTION_ERROR);
    expect(toUserMessage(new ApiError(409, 'Maç zaten başladı.', 'MATCH_ALREADY_STARTED'), { known })).toBe(GENERIC_ACTION_ERROR);
    expect(toUserMessage(new ApiError(400, 'Geçersiz istek metni.', 'INVALID_COMMAND'), { fallback: 'Oda oluşturulamadı.' })).toBe('Oda oluşturulamadı.');
  });

  it('tanınan kod + zararsız görünen ama hassas/serbest sunucu başlığı fallback alır (süzgece güvenilmez)', () => {
    for (const title of [
      'Kullanıcı ayse@example.com için işlem başarısız oldu.',
      'Oda ABC123 içindeki oyuncu p-7f3a koltuk 2 yetkisiz.',
      'Veritabanı KizTavlasiOnline üzerinde zaman aşımı',
      'Her şey yolunda görünüyor ama bu metin sunucuya ait.',
    ]) {
      const out = toUserMessage(new ApiError(400, title, 'INVALID_COMMAND'), { fallback: 'Güvenli.' });
      expect(out).toBe('Güvenli.');
    }
  });

  it('hiçbir (durum, kod, başlık) kombinasyonunda sunucu başlığı çıktıya girmez (yalnızca istemci sabitleri/eşlemeleri)', () => {
    const CODES = [
      'ROOM_NOT_FOUND', 'ROOM_FULL', 'ROOM_EXPIRED', 'PLAYER_NOT_IN_ROOM', 'INVALID_SESSION', 'MATCH_ALREADY_STARTED', 'MATCH_NOT_ACTIVE',
      'NOT_YOUR_TURN', 'ROLL_ALREADY_IN_PROGRESS', 'STALE_STATE', 'INVALID_COMMAND', 'REMATCH_NOT_AVAILABLE', 'ROUND_ALREADY_COMPLETED',
      'NOT_HOST', 'SPECTATOR_READ_ONLY', 'UNKNOWN_CODE', null,
    ] as const;
    for (const status of [0, 200, 301, 400, 401, 403, 404, 409, 410, 422, 429, 500, 503]) {
      for (const code of CODES) {
        const out = toUserMessage(new ApiError(status, 'SUNUCU-BASLIGI-XYZ', code as never), { known: { ROOM_FULL: 'Dolu.' } });
        expect(out).not.toContain('SUNUCU-BASLIGI-XYZ');
      }
    }
  });

  it('tanımlı errorCode ama başlık teknik veri içeriyorsa (token, URL, yol, stack, SQL, bağlantı dizesi) fallback kullanılır', () => {
    for (const leaky of [
      'Hata: access_token=abc',
      'Bağlan: https://x.example.com/api',
      'Dosya C:\\Users\\biri\\app\\GameService.cs bulunamadı',
      'Dosya /var/www/app/GameService.cs bulunamadı',
      'System.NullReferenceException: Object reference not set',
      '   at KizTavlasi.Application.GameService.Start(Guid id) in GameService.cs:line 10',
      "SELECT Id FROM Rooms WHERE Code = 'ABC'",
      'Server=(localdb)\\MSSQLLocalDB;Database=x',
      'h.eyJwbGF5ZXJJZCI6IngifQ.s',
    ]) {
      expect(toUserMessage(new ApiError(400, leaky, 'INVALID_COMMAND'), { fallback: 'Güvenli.' })).toBe('Güvenli.');
    }
  });

  it('tanınmayan errorCode bağlam fallback\'ine düşer (sunucu başlığı gösterilmez)', () => {
    expect(toUserMessage(new ApiError(400, 'Türkçe ama tanınmayan kod başlığı', 'SOME_NEW_CODE' as never), { fallback: 'Maç izlenemedi.' })).toBe('Maç izlenemedi.');
    expect(toUserMessage(new ApiError(500, 'x', 'sql_error' as never))).toBe(GENERIC_ACTION_ERROR);
  });

  it('boş başlık fallback alır; ApiError bağlantı durumundan etkilenmez', () => {
    expect(toUserMessage(new ApiError(400, '  ', 'INVALID_COMMAND'))).toBe(GENERIC_ACTION_ERROR);
    expect(toUserMessage(new ApiError(409, 'sunucu metni', 'ROOM_FULL'), { known, connectionStatus: 'disconnected' })).toBe(
      'Bu oda dolu; en fazla iki oyuncu katılabilir.',
    );
    expect(toUserMessage(new ApiError(400, 'Geçersiz istek metni.', 'INVALID_COMMAND'), { connectionStatus: 'disconnected' })).toBe(GENERIC_ACTION_ERROR);
  });

  it('hiçbir çıktı, girdideki token/URL/dosya yolunu içermez', () => {
    const inputs = [
      new ApiError(500, 'wss://h/hubs/game?access_token=abc /var/log/a.log C:\\x\\y.cs', null),
      new ApiError(400, 'bearer abc.def.ghi', 'SOME_UNKNOWN' as never),
      new Error('HubException: https://a.b/c?token=h.eyJ4IjoxfQ.s'),
    ];
    for (const e of inputs) expect(toUserMessage(e)).not.toMatch(/access_token|wss:|https?:|bearer|\/var\/|C:\\|eyJ/i);
  });
});
