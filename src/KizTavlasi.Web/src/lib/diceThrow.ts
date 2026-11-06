/**
 * Zar atışının fiziği (yalnızca görsel; oyun sonucunu sunucu belirler).
 *
 * Zar, oyuncunun elinden tahtaya fırlatılır: havada 3 eksende döner, masaya düşüp 3 kez
 * seker, sürtünmeyle yavaşlayıp durur. Yükseklik (h) tek bir profilden türetilir; zarın
 * ölçeği (kameraya yaklaşma) ve gölgesinin uzaklığı/silikliği aynı profili izler, böylece
 * her sekmede gölge ve zar birlikte "tok" bir hareket verir. Işık sol üstten: gölge sağ alta düşer.
 *
 * Küp yüzleri gerçektir: 1-6, 2-5, 3-4 karşılıklı. Atış sonunda küp, sonuç yüzü izleyiciye
 * bakacak şekilde (360° katlarıyla) durur; ek olarak yalnızca düzlemde ±15° döner.
 */

import type { Easing } from 'framer-motion';

/** Atanın kenarı: yatay tahtada alt/üst, dikey (telefon) tahtada sol/sağ. */
export type ThrowSide = 'bottom' | 'top' | 'left' | 'right';

/** Atış süresi (ms, normal hız). */
export const THROW_MS = 1500;
/** İkinci zar, ilkinden bu kadar sonra fırlatılır. */
export const SECOND_DIE_DELAY_MS = 70;
/** Zar sonucu gelse bile eldeki "sallama" en az bu kadar sürer (ms, normal hız). */
export const MIN_SHAKE_MS = 480;

/** Zaman ekseni (sürenin oranı): fırlat → tepe → 1. değme → 1. sekme tepesi → 2. değme → ... */
export const THROW_TIMES = [0, 0.18, 0.4, 0.54, 0.68, 0.78, 0.88, 1];
/** Masadan yükseklik: elde .35, tepe 1, değmede 0, her sekmede daha alçak. */
export const THROW_HEIGHT = [0.35, 1, 0, 0.45, 0, 0.16, 0, 0];
/** Katedilen yol oranı: sürtünmeyle her sekmede yavaşlar. */
export const THROW_PROGRESS = [0, 0.3, 0.62, 0.78, 0.88, 0.94, 0.985, 1];
/** Dönüşün tamamlanma oranı: önce hızlı, sonra yavaşlayarak durur. */
export const THROW_SPIN = [0, 0.38, 0.74, 0.86, 0.94, 0.98, 1, 1];
/** Yükseklik kanalı için parça başına ivme: yükselirken yavaşlar, düşerken hızlanır. */
export const THROW_HEIGHT_EASE: Easing[] = [
  'easeOut',
  'easeIn',
  'easeOut',
  'easeIn',
  'easeOut',
  'easeIn',
  'linear',
];

/** Masaya değme anları (THROW_TIMES oranı) ve şiddetleri (ses ve titreşim için). */
export const THROW_IMPACTS = [
  { at: 0.4, strength: 1 },
  { at: 0.68, strength: 0.55 },
  { at: 0.88, strength: 0.25 },
] as const;

/** Ölçek: zar havadayken kameraya yaklaşır. */
const AIR_SCALE = 0.45;

/** Bir küpü, sonuç yüzü izleyiciye bakacak şekilde döndüren açılar (derece). */
export function faceOrientation(value: number): { x: number; y: number } {
  switch (value) {
    case 1:
      return { x: 0, y: 0 };
    case 2:
      return { x: -90, y: 0 };
    case 3:
      return { x: 0, y: -90 };
    case 4:
      return { x: 0, y: 90 };
    case 5:
      return { x: 90, y: 0 };
    default:
      return { x: 0, y: 180 };
  }
}

/** Küp yüzlerinin yerleşimi (DieFaces ile aynı): sonuç yüzünün küp üzerindeki dönüşü. */
export const FACE_TRANSFORMS: Record<number, string> = {
  1: 'rotateY(0deg)',
  6: 'rotateY(180deg)',
  3: 'rotateY(90deg)',
  4: 'rotateY(-90deg)',
  2: 'rotateX(90deg)',
  5: 'rotateX(-90deg)',
};

/** Tohumlu, tekrarlanabilir rastgelelik (yalnızca görsel çeşitlilik için). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ThrowArea {
  /** Katman ölçüleri (px). */
  w: number;
  h: number;
  /** Zar kenar uzunluğu (px). */
  size: number;
  /** Atışı yapan oyuncunun tarafı. */
  side: ThrowSide;
  /** İniş bölgesinin merkezi (katmanın oranı). */
  cx?: number;
  cy?: number;
  /** İki zar arası yarı mesafe (genişliğin oranı); dar kanatta küçültülür. */
  spread?: number;
}

export interface HandPose {
  x: number;
  y: number;
  cubeX: number;
  cubeY: number;
  tilt: number;
}

/** Zarların elde durduğu yer: oyuncunun kenarına yakın, hafifçe yan yana. */
export function handPoses({ w, h, size, side }: ThrowArea): [HandPose, HandPose] {
  const anchor = {
    bottom: { x: w * 0.5, y: h * 0.9 },
    top: { x: w * 0.5, y: h * 0.1 },
    left: { x: w * 0.12, y: h * 0.8 },
    right: { x: w * 0.88, y: h * 0.8 },
  }[side];
  // Üst/alt kenarda zarlar yan yana, sol/sağ kenarda alt alta durur.
  const [dx, dy] = side === 'left' || side === 'right' ? [0, size * 0.7] : [size * 0.7, 0];
  return [
    { x: anchor.x - dx, y: anchor.y - dy, cubeX: -25, cubeY: 30, tilt: -14 },
    { x: anchor.x + dx, y: anchor.y + dy, cubeX: 20, cubeY: -35, tilt: 11 },
  ];
}

export interface DiePlan {
  value: number;
  /** Zemin üzerindeki merkez konumu (px) — her keyframe için. */
  x: number[];
  y: number[];
  /** Düzlemde dönüş (derece). */
  rotateZ: number[];
  /** Zarın ölçeği (havada büyür). */
  scale: number[];
  /** Küpün 3 boyutlu dönüşü (derece). */
  cubeX: number[];
  cubeY: number[];
  /** Gölge: zarın zemindeki izdüşümü + ışık yönünde (sağ alt) kayma. */
  shadowX: number[];
  shadowY: number[];
  shadowScale: number[];
  shadowOpacity: number[];
  /** Durma anı. */
  rest: { x: number; y: number; tilt: number };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** İki zar için tam atış planı: aynı tohum aynı atışı üretir. */
export function planThrow(
  values: [number, number],
  seed: number,
  area: ThrowArea,
): [DiePlan, DiePlan] {
  const { w, h, size, cx = 0.5, cy = 0.5 } = area;
  const rng = mulberry32(seed);
  const hand = handPoses(area);

  // İniş bölgesi: iki zar yan yana, ayrı ayrı rastgele kaymış; asla üst üste binmez.
  const spreadX = Math.max(w * (area.spread ?? 0.17), size * 0.75);
  const jitterX = w * 0.04;
  const jitterY = h * 0.05;
  const rests = [-1, 1].map((dir) => ({
    x: w * cx + dir * spreadX + (rng() * 2 - 1) * jitterX,
    y: h * cy + (rng() * 2 - 1) * jitterY,
    // Her zar biraz farklı açıda durur: ±15°.
    tilt: (rng() * 2 - 1) * 15,
  }));

  const plans = values.map((value, i): DiePlan => {
    const start = hand[i];
    const rest = rests[i];
    const face = faceOrientation(value);
    const spinDir = rng() < 0.5 ? 1 : -1;
    const spinsX = 2 + Math.floor(rng() * 2);
    const spinsY = 2 + Math.floor(rng() * 2);
    // Küp: başlangıç yönelimi → (sonuç yüzü + tam turlar). Tam turlar yüz sonucunu değiştirmez.
    const finalX = face.x + 360 * spinsX * spinDir;
    const finalY = face.y + 360 * spinsY * -spinDir;
    const zTurns = rng() < 0.5 ? 0 : 1;
    const finalZ = rest.tilt + 360 * zTurns * spinDir;
    // Atış yolunda hafif yan eğri: zar düz çizgide gitmez.
    const curve = (rng() * 2 - 1) * w * 0.12;

    const x = THROW_PROGRESS.map(
      (p) => lerp(start.x, rest.x, p) + curve * Math.sin(Math.PI * p),
    );
    const y = THROW_PROGRESS.map((p) => lerp(start.y, rest.y, p));
    const height = THROW_HEIGHT;

    return {
      value,
      x,
      y,
      rotateZ: THROW_SPIN.map((q) => lerp(start.tilt, finalZ, q)),
      scale: height.map((hh) => 1 + AIR_SCALE * hh),
      cubeX: THROW_SPIN.map((q) => lerp(start.cubeX, finalX, q)),
      cubeY: THROW_SPIN.map((q) => lerp(start.cubeY, finalY, q)),
      shadowX: x.map((xx, k) => xx + 2 + height[k] * 14),
      shadowY: y.map((yy, k) => yy + 3 + height[k] * 18),
      shadowScale: height.map((hh) => 1 + 0.3 * hh),
      shadowOpacity: height.map((hh) => Math.max(0.18, 0.5 - 0.28 * hh)),
      rest,
    };
  });

  return [plans[0], plans[1]];
}
