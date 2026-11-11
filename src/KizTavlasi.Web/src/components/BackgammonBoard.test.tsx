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
    expect(document.querySelector('[data-piece="me:6:2"]')).toHaveAttribute('data-landing', 'true');
  });

  it('hareket azaltma tercihinde uçuş animasyonu oynatılmaz', () => {
    motionPrefs.reduced = true;
    mockLayout();
    const { rerender, props } = renderBoard();

    rerender(<BackgammonBoard {...props} myBoard={board('me', AFTER_SIX_ADVANCED)} />);

    expect(screen.queryByTestId('flying-piece')).not.toBeInTheDocument();
    expect(document.querySelector('[data-landing]')).toBeNull();
  });

  it('inmiş pullar altın halkasız; inmemişlerden fiziksel bir boşlukla ayrılır', () => {
    renderBoard({ myBoard: board('me', AFTER_SIX_ADVANCED), clickablePoints: [] });

    const column = screen.getByRole('group', { name: '6. hane: inmemiş 2, inmiş 1 pul' });
    expect(column.querySelectorAll('[data-piece]')).toHaveLength(3);
    expect(column.querySelectorAll('[data-gap]')).toHaveLength(1);
    // Boşluk, arka (inmemiş) gruptan sonra ve öne itilmiş pulun önünde durur.
    const children = Array.from(column.querySelector('[data-gap]')!.parentElement!.children);
    expect(children[2]).toHaveAttribute('data-gap');
    expect(children[3]).toHaveAttribute('data-piece', 'me:6:2');
    expect(column.innerHTML).not.toContain('212, 175, 55');
  });

  it('inmiş pul yokken boşluk çizilmez', () => {
    renderBoard({ clickablePoints: [] });
    expect(document.querySelectorAll('[data-gap]')).toHaveLength(0);
  });

  it('toplama: pul raydaki yan yatmış pula uçar, varış kutusu gizlenir', () => {
    mockLayout();
    const collecting = (done: boolean) =>
      board(
        'me',
        [
          [1, 1],
          [1, 1],
          [1, done ? 0 : 1],
          [1, 2],
          [1, 2],
          [1, 2],
        ],
        done ? 1 : 0,
      );
    const { rerender, props } = renderBoard({ myBoard: collecting(false), clickablePoints: [] });

    rerender(<BackgammonBoard {...props} myBoard={collecting(true)} />);

    expect(screen.getByTestId('flying-piece')).toHaveAttribute('data-kind', 'collect');
    expect(document.querySelector('[data-piece="me:rail:0"]')).toHaveAttribute('data-landing', 'true');
    expect(screen.getByRole('group', { name: 'Ayşe: toplanan 1 pul' })).toBeInTheDocument();
  });

  it('yatay tahta: 24 hane (12 boş kanat + 2 oynanan çeyrek), pullar dikey istiflenir', () => {
    renderBoard({ orientation: 'landscape', clickablePoints: [] });

    expect(document.querySelectorAll('[data-empty]')).toHaveLength(12);
    expect(screen.getAllByRole('region', { name: /(Ayşe|Fatma) tahtası/ })).toHaveLength(2);
    expect(screen.getAllByRole('group', { name: /^\d\. hane:/ })).toHaveLength(12);
    // Benim çeyreğim altta: pullar alt kenardan yukarı doğru dizilir.
    expect(document.querySelector('[data-piece="me:1:0"]')!.parentElement).toHaveClass('flex-col-reverse');
    expect(document.querySelector('[data-piece="them:1:0"]')!.parentElement).toHaveClass('flex-col');
  });

  it('dikey (telefon) tahta: aynı 24 hane, menteşe yatay, pullar yatay istiflenir', () => {
    renderBoard({ orientation: 'portrait', clickablePoints: [] });

    expect(document.querySelectorAll('[data-empty]')).toHaveLength(12);
    expect(document.querySelector('[data-piece="me:1:0"]')!.parentElement).toHaveClass('flex-row');
    expect(document.querySelector('[data-piece="them:1:0"]')!.parentElement).toHaveClass('flex-row-reverse');
  });

  it('oynanabilir hanede hareket edecek pul hafifçe kalkık; dokununca hareketine başlar', () => {
    const { onPickPoint } = renderBoard({ clickablePoints: [6] });
    const movable = document.querySelector('[data-piece="me:6:2"]')!;
    expect(movable).toHaveAttribute('data-mode', 'hint');
    expect(document.querySelector('[data-piece="me:5:2"]')).not.toHaveAttribute('data-mode');
    expect(document.querySelector('[data-glow="on"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '6. haneyi oyna' }));

    expect(onPickPoint).toHaveBeenCalledWith(6);
    expect(movable).toHaveAttribute('data-mode', 'pressed');
  });

  it('hane numaraları çok soluk; adet rozeti yalnızca istif sayılamayacak kadar büyükse görünür', () => {
    renderBoard({ clickablePoints: [] });
    const label = screen.getAllByText('6')[0];
    expect(label).toHaveStyle({ opacity: '0.38' });
    expect(document.body.innerHTML).not.toContain('bg-black/60');
  });

  it('hamle sonrası ilgisiz haneler yeniden mount edilmez', () => {
    const { rerender, props } = renderBoard();
    const untouched = document.querySelector('[data-piece="me:1:0"]');

    rerender(<BackgammonBoard {...props} myBoard={board('me', AFTER_SIX_ADVANCED)} onPickPoint={vi.fn()} />);

    // Aynı DOM düğümü korunur: ilgisiz hane yeniden mount edilmez.
    expect(document.querySelector('[data-piece="me:1:0"]')).toBe(untouched);
    expect(document.querySelector('[data-piece="me:6:2"]')).not.toBeNull();
  });
});
