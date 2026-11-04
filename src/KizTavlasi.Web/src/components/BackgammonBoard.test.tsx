import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import BackgammonBoard from './BackgammonBoard';
import type { PlayerBoardDto } from '../types/game';

const motionPrefs = vi.hoisted(() => ({ reduced: false, fast: false }));
vi.mock('../lib/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/motion')>()),
  useMotionPrefs: () => motionPrefs,
}));

// jsdom PointerEvent sağlamıyor; React `pointerType` alanını yerel olaydan okur.
beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    class PointerEventPolyfill extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? 'mouse';
      }
    }
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  }
});

function board(
  playerId: string,
  points: [number, number][] = [
    [2, 0],
    [2, 0],
    [2, 0],
    [3, 0],
    [3, 0],
    [3, 0],
  ],
  collectedCount = 0,
): PlayerBoardDto {
  return {
    playerId,
    seat: playerId === 'me' ? 1 : 2,
    collectedCount,
    isCollecting: points.every(([back]) => back <= 1),
    points: points.map(([backCount, frontCount], i) => ({ pointNumber: i + 1, backCount, frontCount })),
  };
}

const AFTER_SIX_ADVANCED: [number, number][] = [
  [2, 0],
  [2, 0],
  [2, 0],
  [3, 0],
  [3, 0],
  [2, 1],
];

function mockLayout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 40,
    bottom: 40,
    width: 40,
    height: 40,
    toJSON: () => ({}),
  } as DOMRect);
}

function renderBoard(overrides: Partial<React.ComponentProps<typeof BackgammonBoard>> = {}) {
  const onPickPoint = vi.fn();
  const props: React.ComponentProps<typeof BackgammonBoard> = {
    myBoard: board('me'),
    opponentBoard: board('them'),
    myName: 'Ayşe',
    opponentName: 'Fatma',
    isMyTurn: true,
    clickablePoints: [6],
    myFlash: null,
    opponentFlash: null,
    onPickPoint,
    centerContent: null,
    ...overrides,
  };
  const utils = render(<BackgammonBoard {...props} />);
  return { ...utils, props, onPickPoint };
}

describe('BackgammonBoard', () => {
  beforeEach(() => {
    motionPrefs.reduced = false;
    motionPrefs.fast = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fareyle üzerine gelince indirme için hayalet pul gösterir, ayrılınca kaldırır', () => {
    const { container } = renderBoard();
    const button = screen.getByRole('button', { name: '6. haneyi oyna' });

    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(button.querySelectorAll('[data-variant="ghost"]')).toHaveLength(1);
    expect(button.querySelectorAll('[data-variant="lifted"]')).toHaveLength(1);

    fireEvent.pointerLeave(button, { pointerType: 'mouse' });
    expect(container.querySelectorAll('[data-variant]')).toHaveLength(0);
  });

  it('toplama aşamasında hayalet pul kenar rayında belirir', () => {
    const collecting = board('me', [
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 2],
      [1, 2],
      [1, 2],
    ]);
    renderBoard({ myBoard: collecting, clickablePoints: [4] });
    const button = screen.getByRole('button', { name: '4. haneyi oyna' });

    fireEvent.pointerEnter(button, { pointerType: 'mouse' });

    const rail = screen.getByRole('group', { name: 'Ayşe: toplanan 0 pul' });
    expect(rail.querySelectorAll('[data-variant="ghost"]')).toHaveLength(1);
    expect(button.querySelectorAll('[data-variant="lifted"]')).toHaveLength(1);
  });

  it('mobilde basılı tutmak önizler ama hamle oynamaz; kısa dokunuş oynar', () => {
    vi.useFakeTimers();
    const { onPickPoint } = renderBoard();
    const button = screen.getByRole('button', { name: '6. haneyi oyna' });

    fireEvent.pointerDown(button, { pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(button.querySelectorAll('[data-variant="ghost"]')).toHaveLength(1);
    fireEvent.pointerUp(button, { pointerType: 'touch' });
    fireEvent.click(button);
    expect(onPickPoint).not.toHaveBeenCalled();

    fireEvent.pointerDown(button, { pointerType: 'touch' });
    fireEvent.pointerUp(button, { pointerType: 'touch' });
    fireEvent.click(button);
    expect(onPickPoint).toHaveBeenCalledWith(6);
  });

  it('tıklanamayan haneler önizleme göstermez', () => {
    const { container } = renderBoard({ clickablePoints: [] });
    expect(screen.queryByRole('button', { name: /haneyi oyna/ })).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-variant]')).toHaveLength(0);
  });

  it('hamle snapshot ile gelince pul uçuş katmanında taşınır ve hedef pul gizlenir', () => {
    mockLayout();
    const { rerender, props } = renderBoard();

    rerender(<BackgammonBoard {...props} myBoard={board('me', AFTER_SIX_ADVANCED)} />);

    expect(screen.getByTestId('flying-piece')).toBeInTheDocument();
    expect(document.querySelector('[data-piece="me:6:front:0"]')).toHaveAttribute('data-landing', 'true');
  });

  it('hareket azaltma tercihinde uçuş animasyonu oynatılmaz', () => {
    motionPrefs.reduced = true;
    mockLayout();
    const { rerender, props } = renderBoard();

    rerender(<BackgammonBoard {...props} myBoard={board('me', AFTER_SIX_ADVANCED)} />);

    expect(screen.queryByTestId('flying-piece')).not.toBeInTheDocument();
    expect(document.querySelector('[data-landing]')).toBeNull();
  });

  it('hamle sonrası ilgisiz haneler yeniden mount edilmez', () => {
    const { rerender, props } = renderBoard();
    const untouched = document.querySelector('[data-piece="me:1:back:0"]');

    rerender(<BackgammonBoard {...props} myBoard={board('me', AFTER_SIX_ADVANCED)} onPickPoint={vi.fn()} />);

    // Aynı DOM düğümü korunur: ilgisiz hane yeniden mount edilmez.
    expect(document.querySelector('[data-piece="me:1:back:0"]')).toBe(untouched);
    expect(document.querySelector('[data-piece="me:6:front:0"]')).not.toBeNull();
  });
});
