import { PIP_LAYOUTS } from '../lib/dicePips';
import { FACE_TRANSFORMS } from '../lib/diceThrow';

interface DieFacesProps {
  /** Küpün kenar uzunluğu (px): yüzler bu yarıçapta dışarı itilir. */
  size: number;
  /** Çift zarda altın kenar (sade, titreşimsiz). */
  highlight?: boolean;
}

function Face({ value, size, highlight }: { value: number; size: number; highlight: boolean }) {
  const isOne = value === 1;
  const pipSize = isOne ? 24 : 17;

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{
        transform: `${FACE_TRANSFORMS[value]} translateZ(${size / 2}px)`,
        backfaceVisibility: 'hidden',
        borderRadius: '18%',
        background: 'radial-gradient(circle at 30% 24%, #fffdf8 0%, #f4e9d1 55%, #d6c19a 100%)',
        boxShadow: [
          highlight ? '0 0 0 2px rgba(212,175,55,0.95)' : '0 0 0 1px rgba(95,68,36,0.55)',
          'inset 1px 2px 3px rgba(255,255,255,0.75)',
          'inset -2px -3px 5px rgba(100,70,35,0.35)',
        ].join(', '),
      }}
    >
      {PIP_LAYOUTS[value].map(([x, y], index) => (
        <span
          key={index}
          className="absolute rounded-full"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${pipSize}%`,
            height: `${pipSize}%`,
            transform: 'translate(-50%, -50%)',
            background: isOne
              ? 'radial-gradient(circle at 35% 30%, #c4455a, #7d1f2e 80%)'
              : 'radial-gradient(circle at 35% 30%, #4b3b2d, #130e09 80%)',
            boxShadow: 'inset 0.5px 1px 1px rgba(0,0,0,0.6), 0.5px 1px 0 rgba(255,255,255,0.55)',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Gerçek bir küpün altı yüzü: 1-6, 2-5, 3-4 karşılıklı. Üst eleman `transform-style: preserve-3d`
 * olmalı ve boyutu `size` olmalıdır; dönüşü üst eleman uygular.
 */
export default function DieFaces({ size, highlight = false }: DieFacesProps) {
  return (
    <>
      {[1, 2, 3, 4, 5, 6].map((value) => (
        <Face key={value} value={value} size={size} highlight={highlight} />
      ))}
    </>
  );
}
