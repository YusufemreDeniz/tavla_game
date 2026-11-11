import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import DiceArena from './DiceArena';
import { MIN_SHAKE_MS, SECOND_DIE_DELAY_MS, THROW_IMPACTS, THROW_MS } from '../lib/diceThrow';

const motionPrefs = vi.hoisted(() => ({ reduced: false, fast: false }));
vi.mock('../lib/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/motion')>()),
  useMotionPrefs: () => motionPrefs,
}));

type Props = React.ComponentProps<typeof DiceArena>;

function arena(overrides: Partial<Props> = {}) {
  const props: Props = {
    dice: null,
    rolling: false,
    side: 'bottom',
    rollToken: 0,
    used: [false, false],
    ...overrides,
  };
  return <DiceArena {...props} />;
}

const phase = () => screen.getByTestId('dice-arena').getAttribute('data-phase');

describe('DiceArena', () => {
  beforeEach(() => {
    motionPrefs.reduced = false;
    motionPrefs.fast = false;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('zar yokken boştur ve tıklamaları engellemez', () => {
    render(arena());

    expect(phase()).toBe('idle');
    expect(screen.queryAllByTestId('hand-die')).toHaveLength(0);
    expect(screen.getByTestId('dice-arena')).toHaveClass('pointer-events-none');
  });

  it('atış istenince zarlar elde sallanır; sonuç gelmeden fırlatılmaz', () => {
    render(arena({ rolling: true }));

    expect(phase()).toBe('shaking');
    expect(screen.getAllByTestId('hand-die')).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(phase()).toBe('shaking');
    expect(screen.queryAllByTestId('thrown-die')).toHaveLength(0);
  });

  it('sonuç erken gelse bile sallama en az MIN_SHAKE_MS sürer, sonra zarlar fırlatılır', () => {
    const { rerender } = render(arena({ rolling: true }));

    rerender(arena({ dice: [3, 5], rollToken: 1 }));
    expect(phase()).toBe('shaking');

    act(() => {
      vi.advanceTimersByTime(MIN_SHAKE_MS - 100);
    });
    expect(phase()).toBe('shaking');

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(phase()).toBe('thrown');
    expect(screen.getByRole('img', { name: 'Zar: 3' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Zar: 5' })).toBeInTheDocument();
    expect(screen.queryAllByTestId('hand-die')).toHaveLength(0);
  });

  it('rakibin atışı (sallama görülmeden gelen sonuç) da elden çıkar: önce sallanır, sonra fırlatılır', () => {
    const { rerender } = render(arena({ side: 'top' }));

    rerender(arena({ side: 'top', dice: [2, 6], rollToken: 1 }));
    expect(phase()).toBe('shaking');

    act(() => {
      vi.advanceTimersByTime(MIN_SHAKE_MS + 20);
    });
    expect(phase()).toBe('thrown');
  });

  it('her zar 3 kez masaya değer; ses/sarsıntı için her değmede bildirim gelir, ilki "first"', () => {
    const onImpact = vi.fn();
    const onSettled = vi.fn();
    const { rerender } = render(arena({ rolling: true, onImpact, onSettled }));
    rerender(arena({ dice: [3, 5], rollToken: 1, onImpact, onSettled }));

    act(() => {
      vi.advanceTimersByTime(MIN_SHAKE_MS + 20);
    });
    expect(onImpact).not.toHaveBeenCalled();

    // İlk değme: sürenin %40'ı.
    act(() => {
      vi.advanceTimersByTime(THROW_MS * THROW_IMPACTS[0].at + 5);
    });
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(onImpact).toHaveBeenLastCalledWith({ die: 0, strength: 1, first: true });

    act(() => {
      vi.advanceTimersByTime(THROW_MS + SECOND_DIE_DELAY_MS);
    });
    expect(onImpact).toHaveBeenCalledTimes(6);
    const calls = onImpact.mock.calls.map(([impact]) => impact);
    expect(calls.filter((impact) => impact.first)).toHaveLength(1);
    expect(calls.filter((impact) => impact.die === 0).map((impact) => impact.strength)).toEqual(
      THROW_IMPACTS.map((impact) => impact.strength),
    );
    expect(calls.filter((impact) => impact.die === 1)).toHaveLength(3);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith({ isDouble: false });
  });

  it('çift zar bildirilir', () => {
    const onSettled = vi.fn();
    const { rerender } = render(arena({ rolling: true, onSettled }));
    rerender(arena({ dice: [4, 4], rollToken: 1, onSettled }));

    // Önce fırlatma (React efektleri act sonunda çalışır), sonra atışın tamamı.
    act(() => {
      vi.advanceTimersByTime(MIN_SHAKE_MS + 20);
    });
    act(() => {
      vi.advanceTimersByTime(THROW_MS + SECOND_DIE_DELAY_MS + 50);
    });

    expect(onSettled).toHaveBeenCalledWith({ isDouble: true });
  });

  it('hızlı modda atış kısalır: değmeler daha erken gelir', () => {
    motionPrefs.fast = true;
    const onImpact = vi.fn();
    const { rerender } = render(arena({ rolling: true, onImpact }));
    rerender(arena({ dice: [1, 2], rollToken: 1, onImpact }));

    act(() => {
      vi.advanceTimersByTime(Math.round(MIN_SHAKE_MS * 0.55) + 10);
    });
    expect(phase()).toBe('thrown');
    act(() => {
      vi.advanceTimersByTime(
        Math.round(THROW_MS * 0.55) + Math.round(SECOND_DIE_DELAY_MS * 0.55) + 10,
      );
    });
    expect(onImpact).toHaveBeenCalledTimes(6);
  });

  it('hareket azaltma tercihinde sallama ve sekme yoktur: zarlar hemen durur, tek tık sesi gelir', () => {
    motionPrefs.reduced = true;
    const onImpact = vi.fn();
    const onSettled = vi.fn();
    const { rerender } = render(arena({ rolling: true, onImpact, onSettled }));
    expect(phase()).toBe('idle');

    rerender(arena({ dice: [3, 5], rollToken: 1, onImpact, onSettled }));
    act(() => {
      vi.advanceTimersByTime(5);
    });

    expect(phase()).toBe('thrown');
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(onImpact).toHaveBeenCalledWith({ die: 0, strength: 0.6, first: true });
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('zarlar temizlenince katman boşalır; yeni atış yeniden elde sallanarak başlar', () => {
    const { rerender } = render(arena({ rolling: true }));
    rerender(arena({ dice: [3, 5], rollToken: 1 }));
    act(() => {
      vi.advanceTimersByTime(MIN_SHAKE_MS + 20);
    });
    expect(phase()).toBe('thrown');

    rerender(arena({ dice: null, rolling: true, rollToken: 1 }));
    expect(phase()).toBe('shaking');

    rerender(arena({ dice: [6, 1], rollToken: 2 }));
    expect(phase()).toBe('shaking');
    act(() => {
      vi.advanceTimersByTime(MIN_SHAKE_MS + 20);
    });
    expect(phase()).toBe('thrown');
    expect(screen.getByRole('img', { name: 'Zar: 6' })).toBeInTheDocument();
  });
});
