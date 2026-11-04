import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomePage from './HomePage';

const createRoomMock = vi.fn();
const createBotRoomMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('../api/rooms', () => ({
  createRoom: (...args: unknown[]) => createRoomMock(...args),
  createBotRoom: (...args: unknown[]) => createBotRoomMock(...args),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

function renderHomePage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('başlık ve iki kart görünür', () => {
    renderHomePage();

    expect(screen.getByRole('heading', { name: /kız tavlası online/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /oda oluştur/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /odaya katıl/i })).toBeInTheDocument();
  });

  it('kısa oyuncu adı ile oda oluşturulamaz', async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.type(screen.getByLabelText(/oyuncu adın/i), 'A');
    await user.click(screen.getByRole('button', { name: 'Oda Oluştur' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/en az 2 karakter/i);
    expect(createRoomMock).not.toHaveBeenCalled();
  });

  it('geçerli ad ile oda oluşturulur, token saklanır ve yönlendirilir', async () => {
    createRoomMock.mockResolvedValue({
      roomCode: '7K9M2X',
      sharePath: '/oda/7K9M2X',
      playerToken: 'test-token',
      player: { id: 'p1', displayName: 'Ayşe', seat: 1, isConnected: false, isHost: true },
      roomState: {},
    });

    const user = userEvent.setup();
    renderHomePage();

    await user.type(screen.getByLabelText(/oyuncu adın/i), 'Ayşe');
    await user.click(screen.getByRole('radio', { name: '5 El' }));
    await user.click(screen.getByRole('button', { name: 'Oda Oluştur' }));

    await vi.waitFor(() => {
      expect(createRoomMock).toHaveBeenCalledWith('Ayşe', 5, null);
      expect(navigateMock).toHaveBeenCalledWith('/oda/7K9M2X');
    });
    expect(sessionStorage.getItem('kiztavlasi:token:7K9M2X')).toBe('test-token');
  });

  it('hamle süresi seçilerek oda oluşturulur', async () => {
    createRoomMock.mockResolvedValue({ roomCode: 'HJKMNP', playerToken: 't', roomState: {} });
    const user = userEvent.setup();
    renderHomePage();

    await user.type(screen.getByLabelText(/oyuncu adın/i), 'Ayşe');
    await user.click(screen.getByRole('radio', { name: /30 sn/ }));
    await user.click(screen.getByRole('button', { name: 'Oda Oluştur' }));

    await vi.waitFor(() => expect(createRoomMock).toHaveBeenCalledWith('Ayşe', 3, 30));
  });

  it('yapay zekâya karşı oyna: seçilen zorluk, format ve süreyle bot odası açılır', async () => {
    createBotRoomMock.mockResolvedValue({ roomCode: 'BOT234', playerToken: 'bot-room-token', roomState: {} });
    const user = userEvent.setup();
    renderHomePage();

    await user.type(screen.getByLabelText(/oyuncu adın/i), 'Ayşe');
    await user.click(screen.getByRole('radio', { name: 'Tek El' }));
    await user.click(screen.getByRole('radio', { name: /15 sn/ }));
    await user.click(screen.getByRole('radio', { name: /Usta/ }));
    await user.click(screen.getByRole('button', { name: /yapay zekâya karşı oyna/i }));

    await vi.waitFor(() => {
      expect(createBotRoomMock).toHaveBeenCalledWith('Ayşe', 1, 'Master', 15);
      expect(navigateMock).toHaveBeenCalledWith('/oda/BOT234');
    });
    expect(createRoomMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('kiztavlasi:token:BOT234')).toBe('bot-room-token');
  });

  it('bot modunda da ad doğrulaması yapılır', async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.click(screen.getByRole('button', { name: /yapay zekâya karşı oyna/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(createBotRoomMock).not.toHaveBeenCalled();
  });

  it('geçersiz oda kodu hata gösterir', async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.type(screen.getByLabelText(/oda kodu/i), 'AB');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/6-8 karakterli/i);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('geçerli oda kodu ile oda sayfasına yönlendirilir', async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.type(screen.getByLabelText(/oda kodu/i), '7k9m2x');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));

    expect(navigateMock).toHaveBeenCalledWith('/oda/7K9M2X');
  });
});
