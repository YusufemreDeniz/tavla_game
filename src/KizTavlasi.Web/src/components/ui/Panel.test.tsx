import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Panel } from './Panel';

describe('Panel', () => {
  it('varsayılan olarak div render eder ve çocukları gösterir', () => {
    render(<Panel data-testid="p">İçerik</Panel>);
    const panel = screen.getByTestId('p');
    expect(panel.tagName).toBe('DIV');
    expect(panel).toHaveTextContent('İçerik');
  });

  it('as ile uygun HTML öğesi seçilir; section + aria-labelledby bölge (landmark) olur', () => {
    render(
      <Panel as="section" aria-labelledby="baslik">
        <h2 id="baslik">Oda Oluştur</h2>
      </Panel>,
    );
    expect(screen.getByRole('region', { name: 'Oda Oluştur' }).tagName).toBe('SECTION');
  });

  it('as="li" liste içinde geçerli öğe üretir', () => {
    render(
      <ul>
        <Panel as="li">Madde</Panel>
      </ul>,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('Madde');
  });

  it('varyantlar semantic yüzey token sınıflarını uygular', () => {
    const { rerender } = render(<Panel data-testid="p" />);
    expect(screen.getByTestId('p')).toHaveClass('bg-surface-raised', 'border-line-subtle', 'rounded-panel');
    rerender(<Panel data-testid="p" variant="sunken" />);
    expect(screen.getByTestId('p')).toHaveClass('bg-surface-input');
    rerender(<Panel data-testid="p" variant="outline" />);
    expect(screen.getByTestId('p')).toHaveClass('bg-transparent');
    rerender(<Panel data-testid="p" variant="wood" />);
    expect(screen.getByTestId('p')).toHaveClass('bg-surface-wood');
  });

  it('gereksiz dekor yok: gradient ve gölge sınıfı eklemez', () => {
    render(<Panel data-testid="p" />);
    const cls = screen.getByTestId('p').className;
    expect(cls).not.toMatch(/bg-linear|bg-gradient|shadow-/);
  });

  it('padding seçenekleri uygulanır', () => {
    const { rerender } = render(<Panel data-testid="p" />);
    expect(screen.getByTestId('p')).toHaveClass('p-5');
    rerender(<Panel data-testid="p" padding="none" />);
    expect(screen.getByTestId('p')).toHaveClass('p-0');
    rerender(<Panel data-testid="p" padding="lg" />);
    expect(screen.getByTestId('p')).toHaveClass('p-8');
  });

  it('className eklenir ve native HTML özellikleri iletilir', () => {
    render(
      <Panel data-testid="p" className="mt-4" id="kart" aria-label="Kart">
        x
      </Panel>,
    );
    const panel = screen.getByTestId('p');
    expect(panel).toHaveClass('mt-4', 'bg-surface-raised');
    expect(panel).toHaveAttribute('id', 'kart');
    expect(panel).toHaveAttribute('aria-label', 'Kart');
  });
});
