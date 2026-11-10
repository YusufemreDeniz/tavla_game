import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OptionGroup } from './OptionGroup';
import type { OptionItem } from './OptionGroup';

const bestOf: OptionItem<number>[] = [
  { value: 1, label: 'Tek El', hint: '1 Puan' },
  { value: 3, label: '3 El', hint: '2 Puana' },
  { value: 5, label: '5 El', hint: '3 Puana' },
];

function Controlled({ onChange, initial = 3 }: { onChange?: (v: number) => void; initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <OptionGroup
      legend="Oyun formatı"
      options={bestOf}
      value={value}
      onChange={(v) => {
        onChange?.(v);
        setValue(v);
      }}
    />
  );
}

describe('OptionGroup', () => {
  it('fieldset/legend ile adlandırılmış grup ve native radyolar üretir', () => {
    render(<Controlled />);
    expect(screen.getByRole('group', { name: 'Oyun formatı' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    radios.forEach((r) => expect(r.tagName).toBe('INPUT'));
  });

  it('hint erişilebilir adın parçasıdır (ekran okuyucudan gizlenmez)', () => {
    render(<Controlled />);
    expect(screen.getByRole('radio', { name: /Tek El\s*1 Puan/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /5 El\s*3 Puana/ })).toBeInTheDocument();
  });

  it('yalnızca value ile eşleşen seçenek seçilidir', () => {
    render(<Controlled initial={3} />);
    expect(screen.getByRole('radio', { name: /^3 El/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Tek El/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /5 El/ })).not.toBeChecked();
  });

  it('tıklama onChange\'i ORİJİNAL tipte (number) çağırır ve seçimi günceller', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /5 El/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(5);
    expect(screen.getByRole('radio', { name: /5 El/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^3 El/ })).not.toBeChecked();
  });

  it('seçili olana tekrar tıklamak onChange tetiklemez', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /^3 El/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('görünür etikete (karta) tıklamak seçer', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByText('Tek El'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('klavye: tek Tab durağı seçili radyodur, Tab gruptan çıkar', async () => {
    render(
      <>
        <button>önce</button>
        <Controlled initial={3} />
        <button>sonra</button>
      </>,
    );
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'önce' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: /^3 El/ })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'sonra' })).toHaveFocus();
  });

  it('klavye: ok tuşları seçimi ve odağı taşır (sağ/aşağı ileri, sol/yukarı geri, uçlarda döner)', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} initial={3} />);
    screen.getByRole('radio', { name: /^3 El/ }).focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith(5);
    expect(screen.getByRole('radio', { name: /5 El/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /5 El/ })).toHaveFocus();

    await userEvent.keyboard('{ArrowRight}'); // sona gelince başa döner
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole('radio', { name: /Tek El/ })).toHaveFocus();

    await userEvent.keyboard('{ArrowLeft}'); // başa gelince sona döner
    expect(onChange).toHaveBeenLastCalledWith(5);

    await userEvent.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith(3);
    await userEvent.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it('aynı sayfadaki iki grup birbirinin klavye gezinmesini etkilemez (benzersiz name)', async () => {
    const onA = vi.fn();
    const onB = vi.fn();
    render(
      <>
        <OptionGroup legend="A" options={bestOf} value={1} onChange={onA} />
        <OptionGroup legend="B" options={bestOf} value={1} onChange={onB} />
      </>,
    );
    const groupA = screen.getByRole('group', { name: 'A' });
    const groupB = screen.getByRole('group', { name: 'B' });
    const nameA = groupA.querySelector('input')!.getAttribute('name');
    const nameB = groupB.querySelector('input')!.getAttribute('name');
    expect(nameA).not.toBe(nameB);
    groupA.querySelector('input')!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onA).toHaveBeenCalledWith(3);
    expect(onB).not.toHaveBeenCalled();
  });

  it('seçim yalnızca renkle değil: seçili pul göstergesi ve kenarlık sınıfı farklıdır, gösterge aria-hidden', () => {
    render(<Controlled initial={3} />);
    const selectedCard = screen.getByRole('radio', { name: /^3 El/ }).closest('label')!;
    const otherCard = screen.getByRole('radio', { name: /Tek El/ }).closest('label')!;
    const selectedPul = selectedCard.querySelector('span[aria-hidden="true"]')!;
    const otherPul = otherCard.querySelector('span[aria-hidden="true"]')!;
    expect(selectedPul).toHaveClass('bg-action-primary');
    expect(otherPul).toHaveClass('bg-transparent');
    expect(selectedCard).toHaveClass('border-line-selected');
    expect(otherCard).toHaveClass('border-line-control');
  });

  it('focus gösterimi seçili durumdan ayrıdır: aynı focus-visible sınıfları tüm kartlarda vardır', () => {
    render(<Controlled initial={3} />);
    screen.getAllByRole('radio').forEach((r) => {
      expect(r.closest('label')).toHaveClass('has-focus-visible:outline-line-focus');
    });
  });

  it('columns: 3 varsayılan, 2 seçilebilir', () => {
    const { container, rerender } = render(<OptionGroup legend="G" options={bestOf} value={1} onChange={() => {}} />);
    expect(container.querySelector('.grid')).toHaveClass('grid-cols-3');
    rerender(<OptionGroup legend="G" options={bestOf.slice(0, 2)} value={1} onChange={() => {}} columns={2} />);
    expect(container.querySelector('.grid')).toHaveClass('grid-cols-2');
  });

  it('disabled grup: hiçbir seçenek seçilemez ve onChange çağrılmaz', async () => {
    const onChange = vi.fn();
    render(<OptionGroup legend="G" options={bestOf} value={1} onChange={onChange} disabled />);
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled());
    await userEvent.click(screen.getByText('5 El'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tek seçenek disabled: o seçenek seçilemez, diğerleri çalışır', async () => {
    const onChange = vi.fn();
    const opts: OptionItem<string>[] = [
      { value: 'Easy', label: 'Kolay' },
      { value: 'Master', label: 'Usta', disabled: true },
    ];
    render(<OptionGroup legend="Bot" options={opts} value="Easy" onChange={onChange} columns={2} />);
    expect(screen.getByRole('radio', { name: 'Usta' })).toBeDisabled();
    await userEvent.click(screen.getByText('Usta'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('string değerlerle de çalışır ve değeri string olarak geri verir', async () => {
    const onChange = vi.fn();
    const opts: OptionItem<string>[] = [
      { value: 'Easy', label: 'Kolay', hint: 'Çırak Bot' },
      { value: 'Master', label: 'Usta', hint: 'Usta Bot' },
    ];
    render(<OptionGroup legend="Bot zorluğu" options={opts} value="Easy" onChange={onChange} columns={2} />);
    await userEvent.click(screen.getByRole('radio', { name: /Usta/ }));
    expect(onChange).toHaveBeenCalledWith('Master');
  });

  it('hint olmayan seçenek yalnızca etiketini gösterir', () => {
    render(<OptionGroup legend="G" options={[{ value: 'a', label: 'Sadece Etiket' }]} value="a" onChange={() => {}} columns={2} />);
    expect(screen.getByRole('radio', { name: 'Sadece Etiket' })).toBeInTheDocument();
  });
});
