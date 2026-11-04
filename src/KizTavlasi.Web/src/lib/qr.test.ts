import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { encodeQr, type QrMatrix } from './qr';

/** Matrisi sessiz bölgeli RGBA görüntüye çevirir; bağımsız çözücü (jsQR) ile okunur. */
function decode(matrix: QrMatrix): string | null {
  const scale = 4;
  const quiet = 4;
  const width = (matrix.size + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (x + quiet) * scale + dx;
          const py = (y + quiet) * scale + dy;
          const offset = (py * width + px) * 4;
          pixels[offset] = 0;
          pixels[offset + 1] = 0;
          pixels[offset + 2] = 0;
        }
      }
    }
  }
  return jsQR(pixels, width, width, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

describe('encodeQr', () => {
  it.each([
    'A',
    'http://localhost:5173/oda/7K9M2X',
    'https://kiztavlasi.example.com/oda/ABC234',
    'http://192.168.1.42:5173/oda/HJKMNP?ref=qr',
    // Sürüm 7+ (sürüm bilgisi blokları) ve çok bloklu serpiştirme için daha uzun metin.
    `https://kiztavlasi.example.com/oda/ABC234?${'davet=arkadas&'.repeat(6)}`,
    'Kız Tavlası — ÇĞİÖŞÜ çğıöşü',
  ])('bağımsız çözücüyle aynen geri okunur: %s', (text) => {
    expect(decode(encodeQr(text))).toBe(text);
  });

  it('kısa oda bağlantısı için küçük bir sürüm seçer ve bulucu desenlerini çizer', () => {
    const matrix = encodeQr('https://kiztavlasi.example.com/oda/ABC234');
    expect(matrix.size).toBeLessThanOrEqual(33); // sürüm ≤ 4
    expect((matrix.size - 17) % 4).toBe(0);
    // Sol üst bulucu: 7×7 dış çerçeve koyu, 1 modül açık halka, 3×3 koyu merkez.
    expect(matrix.modules[0].slice(0, 7).every(Boolean)).toBe(true);
    expect(matrix.modules[1][1]).toBe(false);
    expect(matrix.modules[3][3]).toBe(true);
  });

  it('kapasiteyi aşan metinde hata fırlatır', () => {
    expect(() => encodeQr('x'.repeat(400))).toThrow(RangeError);
  });
});
