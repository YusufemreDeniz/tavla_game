import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextField } from './TextField';

describe('TextField', () => {
  it('label, input ile for/id üzerinden bağlanır', () => {
    render(<TextField label="Oyuncu adın" />);
    const input = screen.getByLabelText('Oyuncu adın');
    expect(input.tagName).toBe('INPUT');
    expect(screen.getByText('Oyuncu adın').tagName).toBe('LABEL');
  });

  it('verilen id kullanılır; verilmezse benzersiz id üretilir', () => {
    render(
      <>
        <TextField label="A" id="ozel" />
        <TextField label="B" />
        <TextField label="C" />
      </>,
    );
    expect(screen.getByLabelText('A')).toHaveAttribute('id', 'ozel');
    const idB = screen.getByLabelText('B').id;
    const idC = screen.getByLabelText('C').id;
    expect(idB).not.toBe('');
    expect(idB).not.toBe(idC);
  });

  it('hata yokken aria-invalid ve alert yoktur', () => {
    render(<TextField label="Ad" />);
    expect(screen.getByLabelText('Ad')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('error: aria-invalid, role="alert" ve aria-describedby ilişkisi kurulur', () => {
    render(<TextField label="Ad" error="Ad en az 2 karakter olmalıdır." />);
    const input = screen.getByLabelText('Ad');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Ad en az 2 karakter olmalıdır.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
    expect(input).toHaveAccessibleDescription('Ad en az 2 karakter olmalıdır.');
  });

  it('hata sonradan çıkınca alert eklenir, düzelince kalkar (mesaj bileşende sabit değil)', () => {
    const { rerender } = render(<TextField label="Ad" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(<TextField label="Ad" error="Herhangi bir mesaj" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Herhangi bir mesaj');
    rerender(<TextField label="Ad" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ad')).not.toHaveAttribute('aria-invalid');
  });

  it('hint aria-describedby ile bağlanır; hint ve error birlikte tanımlanır', () => {
    const { rerender } = render(<TextField label="Kod" hint="6-8 karakter" />);
    expect(screen.getByLabelText('Kod')).toHaveAccessibleDescription('6-8 karakter');
    rerender(<TextField label="Kod" hint="6-8 karakter" error="Geçersiz" />);
    expect(screen.getByLabelText('Kod')).toHaveAccessibleDescription('6-8 karakter Geçersiz');
  });

  it('çağıranın aria-describedby değeri korunur', () => {
    render(
      <>
        <p id="dis">Dış açıklama</p>
        <TextField label="Ad" aria-describedby="dis" error="Hata" />
      </>,
    );
    expect(screen.getByLabelText('Ad')).toHaveAccessibleDescription('Dış açıklama Hata');
  });

  it('native input özellikleri iletilir ve kontrollü kullanımda çalışır', async () => {
    const onChange = vi.fn();
    function Controlled() {
      const [v, setV] = useState('');
      return (
        <TextField
          label="Ad"
          value={v}
          maxLength={5}
          placeholder="Örn."
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setV(e.target.value);
          }}
        />
      );
    }
    render(<Controlled />);
    const input = screen.getByLabelText('Ad');
    expect(input).toHaveAttribute('maxlength', '5');
    expect(input).toHaveAttribute('placeholder', 'Örn.');
    expect(input).toHaveAttribute('autocomplete', 'off');
    await userEvent.type(input, 'abcdefg');
    expect(input).toHaveValue('abcde');
    expect(onChange).toHaveBeenLastCalledWith('abcde');
  });

  it('disabled iken yazılamaz', async () => {
    render(<TextField label="Ad" disabled />);
    const input = screen.getByLabelText('Ad');
    expect(input).toBeDisabled();
    await userEvent.type(input, 'x');
    expect(input).toHaveValue('');
  });

  it('mono: mono görünüm sınıfları uygulanır, normal alanda uygulanmaz', () => {
    const { rerender } = render(<TextField label="Kod" mono />);
    expect(screen.getByLabelText('Kod')).toHaveClass('font-code', 'tracking-code', 'uppercase');
    rerender(<TextField label="Kod" />);
    expect(screen.getByLabelText('Kod')).not.toHaveClass('font-code');
  });

  it('mono yalnızca görsel: değeri büyük harfe çevirmez', async () => {
    render(<TextField label="Kod" mono />);
    await userEvent.type(screen.getByLabelText('Kod'), 'ab1');
    expect(screen.getByLabelText('Kod')).toHaveValue('ab1');
  });

  it('hata ikonu erişilebilir ağaçtan gizlidir', () => {
    render(<TextField label="Ad" error="Hata" />);
    expect(screen.getByRole('alert').querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
