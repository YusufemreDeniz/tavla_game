import { memo, useMemo } from 'react';
import { encodeQr } from '../lib/qr';

interface QrCodeProps {
  value: string;
  /** Piksel cinsinden kenar uzunluğu (SVG ölçeklenir, keskin kalır). */
  size?: number;
  label?: string;
}

const QUIET_ZONE = 4;

/** Tek bir <path> ile çizilen, harici bağımlılıksız SVG QR kodu. */
export default memo(function QrCode({ value, size = 168, label }: QrCodeProps) {
  const { dimension, path } = useMemo(() => {
    const matrix = encodeQr(value);
    let d = '';
    matrix.modules.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
      });
    });
    return { dimension: matrix.size + QUIET_ZONE * 2, path: d };
  }, [value]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${dimension} ${dimension}`}
      role="img"
      aria-label={label ?? `QR kod: ${value}`}
      shapeRendering="crispEdges"
      className="rounded-lg"
    >
      {/* Tarayıcıların okuyabilmesi için tema ne olursa olsun beyaz zemin + siyah modül. */}
      <rect width={dimension} height={dimension} fill="#ffffff" />
      <path d={path} fill="#111111" />
    </svg>
  );
});
