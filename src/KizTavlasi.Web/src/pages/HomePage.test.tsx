import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomePage from './HomePage';
import { ApiError } from '../api/client';
import { useUiStore } from '../store/uiStore';

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
    // Yeni native radyoda alt etiket de erişilebilir adın parçasıdır ("5 El 3 Puana").
    await user.click(screen.getByRole('radio', { name: '5 El 3 Puana' }));
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
    await user.click(screen.getByRole('radio', { name: 'Tek El 1 Puan' }));
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

describe('HomePage — A3 geçişi: davranış korumaları', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    useUiStore.setState({ soundEnabled: true, rulesModalOpen: false, toast: null });
  });

  it('varsayılan seçimler: 3 El, Süresiz, Kolay', () => {
    renderHomePage();
    expect(screen.getByRole('radio', { name: /^3 El/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Süresiz/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Kolay/ })).toBeChecked();
  });

  it('seçenek grupları adlandırılmıştır (fieldset/legend)', () => {
    renderHomePage();
    expect(screen.getByRole('group', { name: 'Oyun formatı' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Hamle süresi' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Bot zorluğu' })).toBeInTheDocument();
  });

  it('klavye ok tuşu hamle süresini değiştirir ve oda isteğine yansır', async () => {
    createRoomMock.mockResolvedValue({ roomCode: 'HJKMNP', playerToken: 't', roomState: {} });
    const user = userEvent.setup();
    renderHomePage();

    screen.getByRole('radio', { name: /^Süresiz/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: /^30 sn/ })).toBeChecked();

    await user.type(screen.getByLabelText(/oyuncu adın/i), 'Ayşe');
    await user.click(screen.getByRole('button', { name: 'Oda Oluştur' }));
    await vi.waitFor(() => expect(createRoomMock).toHaveBeenCalledWith('Ayşe', 3, 30));
  });

  it('oyuncu adı kırpılarak gönderilir ve alan en fazla 30 karakterdir', async () => {
    createRoomMock.mockResolvedValue({ roomCode: 'HJKMNP', playerToken: 't', roomState: {} });
    const user = userEvent.setup();
    renderHomePage();

    const input = screen.getByLabelText(/oyuncu adın/i);
    expect(input).toHaveAttribute('maxlength', '30');
    await user.type(input, '  Ayşe  ');
    await user.click(screen.getByRole('button', { name: 'Oda Oluştur' }));
    await vi.waitFor(() => expect(createRoomMock).toHaveBeenCalledWith('Ayşe', 3, null));
  });

  it('ad hatası alanı geçersiz işaretler ve mesajla ilişkilendirir', async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.click(screen.getByRole('button', { name: 'Oda Oluştur' }));

    const input = screen.getByLabelText(/oyuncu adın/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Oyuncu adı en az 2 karakter olmalıdır.');
  });

  it('oda kodu yazılırken büyük harfe çevrilir, 8 karakterle sınırlıdır ve hata/yardım metnine bağlıdır', async () => {
    const user = userEvent.setup();
    renderHomePage();

    const input = screen.getByLabelText(/oda kodu/i);
    expect(input).toHaveAttribute('maxlength', '8');
    await user.type(input, 'ab12');
    expect(input).toHaveValue('AB12');

    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/bağlantıya tıkladıysan.*6-8 karakterli/s);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('oda oluşturulurken: düğme yükleniyor, diğer eylem pasif, odaya katılma ENGELLENMEZ', async () => {
    createRoomMock.mockReturnValue(new Promise(() => {})); // hiç çözülmeyen istek
    const user = userEvent.setup();
    renderHomePage();

    await user.type(screen.getByLabelText(/oyuncu adın/i), 'Ayşe');
    await user.click(screen.getByRole('button', { name: 'Oda Oluştur' }));

    const creating = await screen.findByRole('button', { name: 'Oda oluşturuluyor…' });
    expect(creating).toBeDisabled();
    expect(creating).toHaveAttribute('aria-busy', 'true');
    const bot = screen.getByRole('button', { name: /yapay zekâya karşı oyna/i });
    expect(bot).toBeDisabled();
    expect(bot).not.toHaveAttribute('aria-busy');

    // Bağımsız eylem: kod girip odaya katılmak hâlâ çalışır.
    await user.type(screen.getByLabelText(/oda kodu/i), 'abc123');
    await user.click(screen.getByRole('button', { name: 'Odaya Katıl' }));
    expect(navigateMock).toHaveBeenCalledWith('/oda/ABC123');
  });

  it('bot odası açılırken "Masa hazırlanıyor…" gösterilir, oda oluşturma düğmesi pasif kalır', async () => {
    createBotRoomMock.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderHomePage();

    await user.type(screen.getByLabelText(/oyuncu adın/i), 'Ayşe');
    await user.click(screen.getByRole('button', { name: /yapay zekâya karşı oyna/i }));

    const preparing = await screen.findByRole('button', { name: 'Masa hazırlanıyor…' });
    expect(preparing).toBeDisabled();
    expect(preparing).toHaveAttribute('aria-busy', 'true');
    const create = screen.getByRole('button', { name: 'Oda Oluştur' });
    expect(create).toBeDisabled();
    expect(create).not.toHaveAttribute('aria-busy');
  });

  it('API hatası kullanıcıya gösterilir (ApiError mesajı) ve yönlendirme yapılmaz', async () => {
    createRoomMock.mockRejectedValue(new ApiError(500, 'Sunucu şu an yanıt vermiyor.', null));
    const user = userEvent.setup();
    renderHomePage();

    await user.type(screen.getByLabelText(/oyuncu adın/i), 'Ayşe');
    await user.click(screen.getByRole('button', { name: 'Oda Oluştur' }));

    await vi.waitFor(() =>
      expect(useUiStore.getState().toast).toEqual({ message: 'Sunucu şu an yanıt vermiyor.', kind: 'error' }),
    );
    expect(navigateMock).not.toHaveBeenCalled();
    // Hata sonrası düğme tekrar kullanılabilir.
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Oda Oluştur' })).toBeEnabled());
  });

  it('bilinmeyen hata için genel mesaj gösterilir', async () => {
    createBotRoomMock.mockRejectedValue(new Error('beklenmeyen'));
    const user = userEvent.setup();
    renderHomePage();

    await user.type(screen.getByLabelText(/oyuncu adın/i), 'Ayşe');
    await user.click(screen.getByRole('button', { name: /yapay zekâya karşı oyna/i }));

    await vi.waitFor(() =>
      expect(useUiStore.getState().toast).toEqual({ message: 'Oda oluşturulamadı.', kind: 'error' }),
    );
  });

  it('ses düğmesi store üzerinden açılıp kapanır ve adı güncellenir', async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.click(screen.getByRole('button', { name: 'Sesi kapat' }));
    expect(useUiStore.getState().soundEnabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Sesi aç' })).toBeInTheDocument();
  });

  it('Kurallar düğmesi mevcut kurallar penceresini açar', async () => {
    const user = userEvent.setup();
    renderHomePage();

    expect(screen.queryByRole('dialog', { name: 'Kız Tavlası Kuralları' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /kurallar/i }));
    expect(useUiStore.getState().rulesModalOpen).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'Kız Tavlası Kuralları' })).toBeInTheDocument();
  });

  it('içerik sırası: oda oluştur → bot → odaya katıl → nasıl oynanır', () => {
    renderHomePage();
    const create = screen.getByRole('heading', { name: 'Oda Oluştur' });
    const bot = screen.getByText('Arkadaşın yok mu? Hemen dene');
    const join = screen.getByRole('heading', { name: 'Odaya Katıl' });
    const how = screen.getByRole('heading', { name: 'Nasıl oynanır' });
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(create, bot)).toBe(true);
    expect(before(bot, join)).toBe(true);
    expect(before(join, how)).toBe(true);
  });

  it('"Nasıl oynanır" bölgesi üç adım içerir', () => {
    renderHomePage();
    const region = screen.getByRole('region', { name: 'Nasıl oynanır' });
    expect(region.querySelectorAll('li')).toHaveLength(3);
    expect(region).toHaveTextContent('Çift zar 2×zar hamle verir');
  });

  it('yeni fontlar yalnızca sayfa kapsamındadır: başlık Fraunces sınıfı, kök font değişmez', () => {
    renderHomePage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('font-brand');
    expect(document.documentElement.className).not.toMatch(/font-/);
    expect(document.body.className).not.toMatch(/font-/);
  });
});
