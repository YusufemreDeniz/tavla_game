import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DiceTray from './DiceTray';
import { scaleDuration } from '../lib/motion';

const motionPrefs = vi.hoisted(() => ({ reduced: false, fast: false }));
vi.mock('../lib/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/motion')>()),
  useMotionPrefs: () => motionPrefs,
}));

describe('DiceTray', () => {
  beforeEach(() => {
    motionPrefs.reduced = false;
    motionPrefs.fast = false;
  });

  it('atılırken dönen zarları gösterir', () => {
    render(<DiceTray dice={null} rolling rollToken={0} />);
    expect(screen.getAllByRole('img', { name: 'Zar atılıyor' })).toHaveLength(2);
  });

  it('sonuç gelince zarlar düşüş animasyonuyla görünür', () => {
    const { container } = render(<DiceTray dice={[3, 5]} rolling={false} rollToken={1} />);
    expect(screen.getByRole('img', { name: 'Zar: 3' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Zar: 5' })).toBeInTheDocument();
    expect(container.querySelectorAll('.anim-die-drop')).toHaveLength(2);
    expect(screen.getByTestId('dice-tray')).not.toHaveAttribute('data-double');
  });

  it('çift zarda altın parıltı ve halka katmanı eklenir', () => {
    const { container } = render(<DiceTray dice={[4, 4]} rolling={false} rollToken={1} />);
    expect(screen.getByTestId('dice-tray')).toHaveAttribute('data-double', 'true');
    expect(container.querySelector('.anim-double-burst')).not.toBeNull();
    expect(container.querySelectorAll('.anim-double-glow')).toHaveLength(2);
  });

  it('hareket azaltma tercihinde animasyon sınıfları kullanılmaz', () => {
    motionPrefs.reduced = true;
    const { container } = render(<DiceTray dice={[4, 4]} rolling={false} rollToken={1} />);
    expect(container.querySelector('.anim-die-drop, .anim-double-burst, .anim-double-glow')).toBeNull();
    expect(screen.getAllByRole('img', { name: 'Zar: 4' })).toHaveLength(2);
  });
});

describe('scaleDuration', () => {
  it('normal, hızlı ve hareket azaltılmış modları ölçekler', () => {
    expect(scaleDuration(600, { reduced: false, fast: false })).toBe(600);
    expect(scaleDuration(600, { reduced: false, fast: true })).toBe(330);
    expect(scaleDuration(600, { reduced: true, fast: false })).toBe(0);
  });
});
