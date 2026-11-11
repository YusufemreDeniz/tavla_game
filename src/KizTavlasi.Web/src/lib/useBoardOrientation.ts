import { useEffect, useState } from 'react';

/**
 * Tahta yönü. Geniş ekranda gerçek tavla gibi yatay: menteşe dikey, iki kanat solda/sağda.
 * Telefonda (dikey ekran) aynı tahta 90° döndürülmüş gibi kurulur: menteşe yatay, iki kanat
 * üstte/altta; hane satırları parmakla rahat basılacak kadar yüksek kalır.
 */
export type BoardOrientation = 'landscape' | 'portrait';

const QUERY = '(min-width: 768px)';

function detect(): BoardOrientation {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'portrait';
  return window.matchMedia(QUERY).matches ? 'landscape' : 'portrait';
}

export function useBoardOrientation(): BoardOrientation {
  const [orientation, setOrientation] = useState<BoardOrientation>(detect);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(QUERY);
    const onChange = () => setOrientation(media.matches ? 'landscape' : 'portrait');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return orientation;
}
