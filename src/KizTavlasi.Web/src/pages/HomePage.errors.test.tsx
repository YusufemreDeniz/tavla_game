/**
 * HomePage oda oluşturma hata sunumu (Aşama 3.10A). Davranış referansı `HomePage.test.tsx` (değişmedi).
 * Mock: ../api/rooms (fixture; gerçek REST DEĞİL). HomePage, Toast, uiStore GERÇEK.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomePage from './HomePage';
import Toast from '../components/Toast';
import { ApiError } from '../api/client';
import { useUiStore } from '../store/uiStore';

const createRoomMock = vi.fn();
const createBotRoomMock = vi.fn();

vi.mock('../api/rooms', () => ({
  createRoom: (...args: unknown[]) => createRoomMock(...args),
  createBotRoom: (...args: unknown[]) => createBotRoomMock(...args),
}));

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
        <Toast />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function submitCreate() {
  const user = userEvent.setup();
  renderHome();
  await user.type(screen.getByLabelText(/oyuncu adın/i), 'Ayşe');
  await user.click(screen.getByRole('button', { name: 'Oda Oluştur' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  useUiStore.setState({ toast: null });
});

describe('HomePage oda oluşturma hataları', () => {
  it('Türkçe istemci mesajı (ağ yok) aynen gösterilir ve role="alert" taşır', async () => {
    createRoomMock.mockRejectedValue(new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.', null));
    await submitCreate();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'));
  });

  it('kodsuz 404/400 çerçeve başlığı ham gösterilmez; "Oda oluşturulamadı." gösterilir', async () => {
    createRoomMock.mockRejectedValueOnce(new ApiError(404, 'Not Found', null));
    await submitCreate();
    await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: 'Oda oluşturulamadı.', kind: 'error' }));
    expect(document.body.textContent).not.toContain('Not Found');
  });

  it('ApiError olmayan teknik hata ("Failed to fetch") ham gösterilmez', async () => {
    createRoomMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await submitCreate();
    await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: 'Oda oluşturulamadı.', kind: 'error' }));
    expect(document.body.textContent).not.toContain('Failed to fetch');
  });

  it('tanınan kod + istemci eşlemesi yok: sunucu başlığı (Türkçe olsa bile) gösterilmez; bağlam fallback\'i (3.10C)', async () => {
    // 3.10B'deki eski beklenti 'Hamle süresi geçersiz.' sunucu başlığını gösteriyordu.
    createRoomMock.mockRejectedValueOnce(new ApiError(400, 'Hamle süresi geçersiz.', 'INVALID_COMMAND'));
    await submitCreate();
    await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: 'Oda oluşturulamadı.', kind: 'error' }));
    expect(document.body.textContent).not.toContain('Hamle süresi geçersiz.');
  });

  it('kodsuz 403/409/500/503 ve tanınmayan kodlu sunucu başlıkları gösterilmez', async () => {
    for (const [status, code] of [[403, null], [409, null], [500, null], [503, null], [400, 'SOME_NEW_CODE']] as const) {
      createRoomMock.mockRejectedValueOnce(new ApiError(status, 'Ham sunucu başlığı XYZ', code as never));
      const { unmount } = renderHome();
      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/oyuncu adın/i), 'Ayşe');
      await user.click(screen.getByRole('button', { name: 'Oda Oluştur' }));
      await waitFor(() => expect(useUiStore.getState().toast).toEqual({ message: 'Oda oluşturulamadı.', kind: 'error' }));
      expect(document.body.textContent).not.toContain('Ham sunucu başlığı XYZ');
      unmount();
      useUiStore.setState({ toast: null });
    }
  });
});
