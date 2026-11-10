import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoadingScreen, StateScreen } from './StateScreen';
import { Button } from './Button';

describe('StateScreen', () => {
  it('main bölgesi ve tek <h1> başlık üretir; açıklama ve içerik gösterilir', () => {
    render(
      <StateScreen title="Masa dolu" description="Ayşe oynuyor.">
        <p>Ek içerik</p>
      </StateScreen>,
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Masa dolu' })).toBeInTheDocument();
    expect(screen.getByText('Ayşe oynuyor.')).toBeInTheDocument();
    expect(screen.getByText('Ek içerik')).toBeInTheDocument();
  });

  it('metinler çağıran taraftan gelir: bileşen kendi metnini eklemez', () => {
    render(<StateScreen title="Yalnızca başlık" />);
    expect(screen.getByRole('main')).toHaveTextContent(/^Yalnızca başlık$/);
  });

  it('ikon erişilebilir ağaçtan gizlidir', () => {
    render(<StateScreen title="T" icon={<svg data-testid="ikon" />} />);
    expect(screen.getByTestId('ikon').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('eylemler klavyeyle sırayla odaklanır ve Enter/Boşluk ile çalışır', async () => {
    const onA = vi.fn();
    const onB = vi.fn();
    render(
      <StateScreen
        title="T"
        actions={
          <>
            <Button onClick={onA}>Birinci</Button>
            <Button variant="ghost" onClick={onB}>
              İkinci
            </Button>
          </>
        }
      />,
    );
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Birinci' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onA).toHaveBeenCalledTimes(1);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'İkinci' })).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(onB).toHaveBeenCalledTimes(1);
  });
});

describe('LoadingScreen', () => {
  it('role="status" ile metni duyurur ve başlık üretmez; döner halka gizlidir', () => {
    const { container } = render(<LoadingScreen>Yükleniyor…</LoadingScreen>);
    expect(screen.getByRole('status')).toHaveTextContent('Yükleniyor…');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
