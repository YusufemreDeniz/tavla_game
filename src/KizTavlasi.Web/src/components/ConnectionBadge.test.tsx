/**
 * ConnectionBadge ve ConnectionDot KARAKTERİZASYON testleri (Aşama 3.8A): mevcut davranışı belgeler.
 * Gerçek bileşenler render edilir; mock yoktur.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ConnectionBadge from './ConnectionBadge';
import ConnectionDot from './ConnectionDot';
import type { ConnectionStatus } from '../types/game';

const LABELS: Record<ConnectionStatus, string> = {
  idle: 'Bağlı değil',
  connecting: 'Bağlanıyor…',
  connected: 'Bağlı',
  reconnecting: 'Yeniden bağlanıyor…',
  disconnected: 'Bağlantı kesildi',
};

describe('ConnectionBadge', () => {
  it.each(Object.entries(LABELS) as Array<[ConnectionStatus, string]>)('%s durumu "%s" metnini gösterir', (status, label) => {
    render(<ConnectionBadge status={status} />);
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });

  it('role="status" ve aria-live="polite" ile durum değişikliklerini duyurur', () => {
    render(<ConnectionBadge status="connected" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-live', 'polite');
  });

  it('durum yalnızca renkle ifade edilmez: her durumun kendine özgü metni vardır', () => {
    const texts = new Set<string>();
    for (const status of Object.keys(LABELS) as ConnectionStatus[]) {
      const { unmount } = render(<ConnectionBadge status={status} />);
      texts.add(screen.getByRole('status').textContent ?? '');
      unmount();
    }
    expect(texts.size).toBe(Object.keys(LABELS).length);
  });

  it('ikon dekoratiftir (aria-hidden); durum bilgisi metin içeriğindedir (role=status ayrıca ad/etiket taşımaz)', () => {
    const { container } = render(<ConnectionBadge status="reconnecting" />);
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('Yeniden bağlanıyor…');
    expect(badge).not.toHaveAttribute('aria-label');
    expect(badge).not.toHaveAttribute('aria-labelledby');
  });

  it('durum değişince metin güncellenir (aynı öğe, yeni içerik)', () => {
    const { rerender } = render(<ConnectionBadge status="connecting" />);
    expect(screen.getByRole('status')).toHaveTextContent('Bağlanıyor…');

    rerender(<ConnectionBadge status="connected" />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Bağlı$/);

    rerender(<ConnectionBadge status="reconnecting" />);
    expect(screen.getByRole('status')).toHaveTextContent('Yeniden bağlanıyor…');

    rerender(<ConnectionBadge status="disconnected" />);
    expect(screen.getByRole('status')).toHaveTextContent('Bağlantı kesildi');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});

describe('ConnectionDot', () => {
  it('bağlı oyuncu için "Bağlı", bağlantısı kopmuş oyuncu için "Çevrimdışı" metnini gösterir', () => {
    const { rerender } = render(<ConnectionDot isConnected />);
    expect(screen.getByText('Bağlı')).toBeInTheDocument();
    expect(screen.queryByText('Çevrimdışı')).not.toBeInTheDocument();

    rerender(<ConnectionDot isConnected={false} />);
    expect(screen.getByText('Çevrimdışı')).toBeInTheDocument();
    expect(screen.queryByText('Bağlı')).not.toBeInTheDocument();
  });

  it('renkli nokta dekoratiftir (aria-hidden); durum metinle de verilir ve ayrı bir ARIA rolü yoktur', () => {
    const { container } = render(<ConnectionDot isConnected={false} />);
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).not.toBeNull();
    expect(dot).toBeEmptyDOMElement();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('Çevrimdışı');
  });
});
