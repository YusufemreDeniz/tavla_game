import { describe, expect, it } from 'vitest';
import {
  FACE_TRANSFORMS,
  THROW_HEIGHT,
  THROW_IMPACTS,
  THROW_PROGRESS,
  THROW_SPIN,
  THROW_TIMES,
  faceOrientation,
  handPoses,
  mulberry32,
  planThrow,
  type ThrowArea,
} from './diceThrow';

const AREA: ThrowArea = { w: 340, h: 520, size: 42, side: 'bottom' };

const mod360 = (angle: number) => ((angle % 360) + 360) % 360;

describe('küp yüzleri', () => {
  it('karşılıklı yüzler aynı eksende 180° farklı durur: 1-6, 2-5, 3-4', () => {
    expect(FACE_TRANSFORMS[1]).toBe('rotateY(0deg)');
    expect(FACE_TRANSFORMS[6]).toBe('rotateY(180deg)');
    expect(FACE_TRANSFORMS[3]).toBe('rotateY(90deg)');
    expect(FACE_TRANSFORMS[4]).toBe('rotateY(-90deg)');
    expect(FACE_TRANSFORMS[2]).toBe('rotateX(90deg)');
    expect(FACE_TRANSFORMS[5]).toBe('rotateX(-90deg)');
  });

  it('her sonuç için küp yönelimi, yüz dönüşünün tersidir', () => {
    expect(faceOrientation(1)).toEqual({ x: 0, y: 0 });
    expect(faceOrientation(6)).toEqual({ x: 0, y: 180 });
    expect(faceOrientation(3)).toEqual({ x: 0, y: -90 });
    expect(faceOrientation(4)).toEqual({ x: 0, y: 90 });
    expect(faceOrientation(2)).toEqual({ x: -90, y: 0 });
    expect(faceOrientation(5)).toEqual({ x: 90, y: 0 });
  });
});

describe('planThrow', () => {
  it('zaman çizelgesi tutarlı: tüm kanallar aynı uzunlukta, zaman 0..1 artan', () => {
    const [a] = planThrow([3, 5], 7, AREA);
    for (const channel of [
      THROW_HEIGHT,
      THROW_PROGRESS,
      THROW_SPIN,
      a.x,
      a.y,
      a.scale,
      a.rotateZ,
      a.cubeX,
      a.cubeY,
      a.shadowX,
      a.shadowY,
      a.shadowScale,
      a.shadowOpacity,
    ]) {
      expect(channel).toHaveLength(THROW_TIMES.length);
    }
    expect(THROW_TIMES[0]).toBe(0);
    expect(THROW_TIMES.at(-1)).toBe(1);
    expect([...THROW_TIMES].sort((x, y) => x - y)).toEqual([...THROW_TIMES]);
  });

  it.each([1, 2, 3, 4, 5, 6])(
    'atış sonunda küp, %i yüzünü izleyiciye çevirir (360° katlarıyla)',
    (value) => {
      const other = value === 6 ? 1 : value + 1;
      for (const seed of [1, 2, 3, 99, 12345]) {
        const [plan] = planThrow([value, other], seed, AREA);
        const face = faceOrientation(value);
        expect(mod360(plan.cubeX.at(-1)!)).toBeCloseTo(mod360(face.x), 6);
        expect(mod360(plan.cubeY.at(-1)!)).toBeCloseTo(mod360(face.y), 6);
      }
    },
  );

  it('zar havada gerçekten döner: her eksende en az 2 tam tura yakın', () => {
    const [plan] = planThrow([4, 2], 5, AREA);
    expect(Math.abs(plan.cubeX.at(-1)! - plan.cubeX[0])).toBeGreaterThanOrEqual(2 * 360 - 100);
    expect(Math.abs(plan.cubeY.at(-1)! - plan.cubeY[0])).toBeGreaterThanOrEqual(2 * 360 - 100);
  });

  it('dönüş yavaşlayarak durur: sondaki aralıkta hız ilk aralıktan çok düşüktür', () => {
    const [plan] = planThrow([6, 3], 11, AREA);
    const speed = (i: number) =>
      Math.abs(plan.cubeY[i + 1] - plan.cubeY[i]) / (THROW_TIMES[i + 1] - THROW_TIMES[i]);
    expect(speed(5)).toBeLessThan(speed(0) / 3);
    expect(plan.cubeY.at(-1)).toBe(plan.cubeY.at(-2));
  });

  it('düzlemde dinlenme açısı her zar için ±15° içinde ve zarlar farklı açıda durur', () => {
    const tilts = new Set<number>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const [a, b] = planThrow([2, 5], seed, AREA);
      for (const plan of [a, b]) {
        expect(Math.abs(plan.rest.tilt)).toBeLessThanOrEqual(15);
        expect(mod360(plan.rotateZ.at(-1)!)).toBeCloseTo(mod360(plan.rest.tilt), 6);
        tilts.add(Math.round(plan.rest.tilt));
      }
    }
    expect(tilts.size).toBeGreaterThan(10);
  });

  it('zarlar iniş bölgesinde üst üste binmez ve alanın içinde kalır', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const [a, b] = planThrow([1, 6], seed, AREA);
      const distance = Math.hypot(a.rest.x - b.rest.x, a.rest.y - b.rest.y);
      expect(distance).toBeGreaterThan(AREA.size * 1.3);
      for (const plan of [a, b]) {
        expect(plan.rest.x).toBeGreaterThan(AREA.size);
        expect(plan.rest.x).toBeLessThan(AREA.w - AREA.size);
        expect(plan.rest.y).toBeGreaterThan(0);
        expect(plan.rest.y).toBeLessThan(AREA.h);
      }
    }
  });

  it('aynı tohum aynı atışı, farklı tohum farklı atışı üretir', () => {
    expect(planThrow([3, 4], 42, AREA)).toEqual(planThrow([3, 4], 42, AREA));
    expect(planThrow([3, 4], 42, AREA)[0].rest).not.toEqual(planThrow([3, 4], 43, AREA)[0].rest);
  });

  it('zar oyuncunun kenarından başlar: benimki alttan, rakibinki üstten fırlatılır', () => {
    const mine = planThrow([3, 4], 1, { ...AREA, side: 'bottom' })[0];
    const theirs = planThrow([3, 4], 1, { ...AREA, side: 'top' })[0];
    expect(mine.y[0]).toBeGreaterThan(AREA.h * 0.7);
    expect(theirs.y[0]).toBeLessThan(AREA.h * 0.3);
    // Sallama (elde bekleme) ile fırlatma aynı noktadan başlar: kesintisiz geçiş.
    expect(handPoses({ ...AREA, side: 'bottom' })[0].y).toBe(mine.y[0]);
    expect(handPoses({ ...AREA, side: 'bottom' })[0].x).toBe(mine.x[0]);
  });

  it('3 kez seker: yükseklik her değmede sıfıra iner, tepeler ve şiddet giderek azalır', () => {
    const touchIndexes = THROW_IMPACTS.map((impact) => THROW_TIMES.indexOf(impact.at));
    expect(touchIndexes.every((i) => i >= 0)).toBe(true);
    touchIndexes.forEach((i) => expect(THROW_HEIGHT[i]).toBe(0));
    const peaks = [THROW_HEIGHT[1], THROW_HEIGHT[3], THROW_HEIGHT[5]];
    expect(peaks[0]).toBeGreaterThan(peaks[1]);
    expect(peaks[1]).toBeGreaterThan(peaks[2]);
    const strengths = THROW_IMPACTS.map((impact) => impact.strength);
    expect(strengths).toEqual([...strengths].sort((x, y) => y - x));
  });

  it('havada büyür, değince normal boyuta döner; gölge zarla birlikte sağ alta uzaklaşıp silikleşir', () => {
    const [plan] = planThrow([5, 5], 9, AREA);
    const peak = THROW_HEIGHT.indexOf(Math.max(...THROW_HEIGHT));
    const touch = THROW_TIMES.indexOf(THROW_IMPACTS[0].at);
    expect(plan.scale[peak]).toBeGreaterThan(plan.scale[touch]);
    expect(plan.scale[touch]).toBe(1);
    expect(plan.scale.at(-1)).toBe(1);
    // Işık sol üstten: gölge zarın sağ altına düşer ve yükseldikçe daha uzağa.
    const offset = (i: number) => ({
      dx: plan.shadowX[i] - plan.x[i],
      dy: plan.shadowY[i] - plan.y[i],
    });
    expect(offset(touch).dx).toBeGreaterThan(0);
    expect(offset(touch).dy).toBeGreaterThan(0);
    expect(offset(peak).dx).toBeGreaterThan(offset(touch).dx);
    expect(offset(peak).dy).toBeGreaterThan(offset(touch).dy);
    expect(plan.shadowOpacity[peak]).toBeLessThan(plan.shadowOpacity[touch]);
  });
});

describe('mulberry32', () => {
  it('0..1 aralığında, tohuma bağlı ve tekrarlanabilir değerler üretir', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    for (let i = 0; i < 50; i += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
