import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('type belirtilmezse "button" olur ve form içinde submit etmez', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Gönder</Button>
      </form>,
    );
    const button = screen.getByRole('button', { name: 'Gönder' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('type="submit" verilirse form gönderilir', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Gönder</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('tıklanınca onClick çalışır', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Tamam</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Tamam' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('loading: gerçekten disabled olur, aria-busy alır ve tıklanamaz', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Oluştur
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Oluştur' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading: loadingLabel çocukların yerine geçer; verilmezse çocuklar kalır', () => {
    const { rerender } = render(
      <Button loading loadingLabel="Bekleyin…">
        Oluştur
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Bekleyin…' })).toBeInTheDocument();
    expect(screen.queryByText('Oluştur')).not.toBeInTheDocument();

    rerender(<Button loading>Oluştur</Button>);
    expect(screen.getByRole('button', { name: 'Oluştur' })).toBeInTheDocument();
  });

  it('loading değilken aria-busy yoktur', () => {
    render(<Button>Tamam</Button>);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
  });

  it('disabled: tıklanamaz ve aria-busy almaz', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Tamam
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ikon erişilebilir ağaçtan gizlidir; loading iken ikon yerine spinner gelir', () => {
    const { container, rerender } = render(<Button icon={<svg data-testid="ikon" />}>Tamam</Button>);
    expect(screen.getByTestId('ikon').parentElement).toHaveAttribute('aria-hidden', 'true');
    rerender(
      <Button loading icon={<svg data-testid="ikon" />}>
        Tamam
      </Button>,
    );
    expect(screen.queryByTestId('ikon')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('varyantlar kendi semantic token sınıflarını uygular', () => {
    const { rerender } = render(<Button variant="primary">A</Button>);
    expect(screen.getByRole('button')).toHaveClass('from-action-primary-from', 'text-fg-on-gold');
    rerender(<Button variant="secondary">A</Button>);
    expect(screen.getByRole('button')).toHaveClass('to-action-secondary', 'text-fg-on-action');
    rerender(<Button variant="tertiary">A</Button>);
    expect(screen.getByRole('button')).toHaveClass('border-action-tertiary-border', 'text-action-tertiary-fg');
  });

  it('varsayılan varyant primary; fullWidth w-full ekler', () => {
    const { rerender } = render(<Button>A</Button>);
    expect(screen.getByRole('button')).toHaveClass('from-action-primary-from');
    expect(screen.getByRole('button')).not.toHaveClass('w-full');
    rerender(<Button fullWidth>A</Button>);
    expect(screen.getByRole('button')).toHaveClass('w-full');
  });

  it('ghost varyantı nötr çerçeve kullanır (altın/bordo değil)', () => {
    render(<Button variant="ghost">Kurallar</Button>);
    const button = screen.getByRole('button', { name: 'Kurallar' });
    expect(button).toHaveClass('border-line-control', 'text-fg-primary');
    expect(button.className).not.toMatch(/action-primary|action-secondary|action-tertiary/);
  });

  it('size: md 54 px, sm 44 px dokunma hedefi sınıflarını uygular (çakışmadan)', () => {
    const { rerender } = render(<Button>A</Button>);
    expect(screen.getByRole('button')).toHaveClass('min-h-(--size-button)');
    expect(screen.getByRole('button')).not.toHaveClass('min-h-(--size-touch-min)');
    rerender(<Button size="sm">A</Button>);
    expect(screen.getByRole('button')).toHaveClass('min-h-(--size-touch-min)');
    expect(screen.getByRole('button')).not.toHaveClass('min-h-(--size-button)');
  });

  it('native özellikler ve ref iletilir', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} name="eylem" value="x" aria-describedby="yardim" data-testid="btn">
        Tamam
      </Button>,
    );
    const button = screen.getByTestId('btn');
    expect(button).toHaveAttribute('name', 'eylem');
    expect(button).toHaveAttribute('value', 'x');
    expect(button).toHaveAttribute('aria-describedby', 'yardim');
    expect(ref.current).toBe(button);
  });
});
