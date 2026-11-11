/**
 * Ahşap ve çuha dokuları: tek seferlik SVG görüntüsü olarak üretilir (data URI) ve CSS arka planı
 * olarak kullanılır. Filtre görüntü çözülürken bir kez çalışır; sayfada canlı filtre maliyeti yoktur.
 * Ahşap tek parça olarak (tekrarsız, `background-size: 100% 100%`) gerilir; böylece döşeme dikişi oluşmaz.
 *
 * Ahşap: uzamış `feTurbulence` damar çizgilerini, çok düşük frekanslı ikinci bir `feTurbulence`
 * üzerinden `feDisplacementMap` ile dalgalandırır; böylece damarlar düz çizgi değil, düzensiz
 * ve dalgalı akar. Koyu damar ve açık parıltı katmanları ayrı alfa kanallarından türetilir.
 */

type Rgb = [number, number, number];

export interface WoodOptions {
  /** Zemin rengi. */
  base: string;
  /** Damar çizgisi rengi. */
  dark: Rgb;
  /** Parıltı (açık damar) rengi. */
  light: Rgb;
  /** Damar frekansı "x y" (y büyüdükçe damarlar sıklaşır). */
  freq: string;
  seed: number;
  /** Dalgalanma şiddeti (piksel). */
  wave: number;
}

const unit = (c: Rgb) => c.map((v) => (v / 255).toFixed(3));

function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function woodTexture(options: WoodOptions): string {
  const [dr, dg, db] = unit(options.dark);
  const [lr, lg, lb] = unit(options.light);
  const { base, freq, seed, wave } = options;

  return svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='960' height='640' preserveAspectRatio='none'>` +
      `<filter id='w' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>` +
      `<feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='4' seed='${seed}' stitchTiles='stitch' result='g'/>` +
      `<feTurbulence type='fractalNoise' baseFrequency='0.004 0.018' numOctaves='2' seed='${seed + 5}' result='p'/>` +
      `<feDisplacementMap in='g' in2='p' scale='${wave}' xChannelSelector='R' yChannelSelector='G' result='w'/>` +
      `<feColorMatrix in='w' type='matrix' values='0 0 0 0 ${dr} 0 0 0 0 ${dg} 0 0 0 0 ${db} 1.8 0 0 0 -0.78' result='d'/>` +
      `<feColorMatrix in='w' type='matrix' values='0 0 0 0 ${lr} 0 0 0 0 ${lg} 0 0 0 0 ${lb} 0 -1.7 0 0 0.86' result='l'/>` +
      `<feMerge><feMergeNode in='d'/><feMergeNode in='l'/></feMerge>` +
      `</filter>` +
      `<rect width='960' height='640' fill='${base}'/>` +
      `<rect width='960' height='640' filter='url(#w)'/>` +
      `</svg>`,
  );
}

/** Kahvehane çuhası: ince, kısa liflerden oluşan koyu yeşil keçe. */
export function feltTexture(): string {
  return svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>` +
      `<filter id='f' x='0' y='0' width='100%' height='100%'>` +
      `<feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='3' stitchTiles='stitch'/>` +
      `<feColorMatrix type='matrix' values='0 0 0 0 0.03 0 0 0 0 0.09 0 0 0 0 0.06 0 0 0 0.95 -0.3'/>` +
      `</filter>` +
      `<rect width='160' height='160' fill='#183626'/>` +
      `<rect width='160' height='160' filter='url(#f)' opacity='0.6'/>` +
      `</svg>`,
  );
}

/** Ceviz çerçeve: koyu, sık damarlı. */
export const WALNUT_TEXTURE = woodTexture({
  base: '#4d2d16',
  dark: [34, 17, 6],
  light: [150, 98, 56],
  freq: '0.007 0.2',
  seed: 11,
  wave: 26,
});

/** Oyun yüzeyi: açık, dalgalı damarlı ağaç. */
export const MAPLE_TEXTURE = woodTexture({
  base: '#cdac7a',
  dark: [122, 82, 42],
  light: [252, 234, 198],
  freq: '0.005 0.13',
  seed: 4,
  wave: 20,
});

export const FELT_TEXTURE = feltTexture();
