import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';

const icon = <svg data-testid="ikon" />;

describe('IconButton', () => {
  it('erişilebilir adı label prop\'undan alır', () => {
    render(<IconButton label="Sesi kapat" icon={icon} />);
    expect(screen.getByRole('button', { name: 'Sesi kapat' })).toBeInTheDocument();
  });

  it('ikon erişilebilir ağaçtan gizlidir (ad yalnızca label)', () => {
    render(<IconButton label="Kapat" icon={icon} />);
    expect(screen.getByTestId('ikon').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('type belirtilmezse "button" olur', () => {
    render(<IconButton label="Kapat" icon={icon} />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('en az 44×44 px alan sınıflarını taşır', () => {
    render(<IconButton label="Kapat" icon={icon} />);
    expect(screen.getByRole('button')).toHaveClass('min-h-(--size-touch-min)', 'min-w-(--size-touch-min)');
  });

  it('aria-pressed gibi native ARIA özellikleri iletilir', () => {
    const { rerender } = render(<IconButton label="Sesi kapat" icon={icon} aria-pressed={true} />);
    expect(screen.getByRole('button', { name: 'Sesi kapat', pressed: true })).toBeInTheDocument();
    rerender(<IconButton label="Sesi kapat" icon={icon} aria-pressed={false} />);
    expect(screen.getByRole('button', { name: 'Sesi kapat', pressed: false })).toBeInTheDocument();
  });

  it('onClick çalışır; disabled iken çalışmaz', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<IconButton label="Kapat" icon={icon} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<IconButton label="Kapat" icon={icon} onClick={onClick} disabled />);
    const button = screen.getByRole('button', { name: 'Kapat' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('klavyeden (Enter/Space) etkinleşir ve odaklanabilir', async () => {
    const onClick = vi.fn();
    render(<IconButton label="Kapat" icon={icon} onClick={onClick} />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Kapat' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
