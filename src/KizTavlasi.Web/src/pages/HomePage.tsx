import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Bot, BookOpen, Volume2, VolumeX } from 'lucide-react';
import { z } from 'zod';
import { createBotRoom, createRoom } from '../api/rooms';
import { toUserMessage } from '../lib/userError';
import { savePlayerToken } from '../lib/session';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../config/branding';
import { useUiStore } from '../store/uiStore';
import RulesModal from '../components/RulesModal';
import { Button, IconButton, OptionGroup, TextField } from '../components/ui';
import { BoardPlate, BrandMark, WoodRail } from '../components/home/HomeDecor';
import type { BotDifficulty } from '../types/game';

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Oyuncu adı en az 2 karakter olmalıdır.')
  .max(30, 'Oyuncu adı en fazla 30 karakter olabilir.');

const codeSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9]{6,8}$/, 'Oda kodu 6-8 karakterli harf ve rakamlardan oluşur.');

const BEST_OF_OPTIONS = [
  { value: 1, label: 'Tek El', hint: '1 Puan' },
  { value: 3, label: '3 El', hint: '2 Puana' },
  { value: 5, label: '5 El', hint: '3 Puana' },
];

/** 0 = süresiz (sunucuya null gönderilir). */
const TURN_TIMER_OPTIONS = [
  { value: 0, label: 'Süresiz', hint: 'Rahat oyun' },
  { value: 30, label: '30 sn', hint: 'Turnuva' },
  { value: 15, label: '15 sn', hint: 'Hızlı mod' },
];

const BOT_DIFFICULTY_OPTIONS: { value: BotDifficulty; label: string; hint: string }[] = [
  { value: 'Easy', label: 'Kolay', hint: 'Çırak Bot' },
  { value: 'Master', label: 'Usta', hint: 'Usta Bot' },
];

const HOW_TO_STEPS = [
  { title: 'Odayı Kur & Paylaş', text: 'Adını yazıp odayı oluştur, davet linkini arkadaşına gönder.' },
  { title: 'İndir, Sonra Topla', text: 'Önce hanelerdeki pulları son pula kadar indir, ardından 15 pulu topla.' },
  { title: 'Çift Zar & Mars', text: 'Çift zar 2×zar hamle verir; rakip indirmedeyken bitirirsen Mars (2 puan)!' },
];

const sectionHeading =
  'mb-4.5 font-brand text-heading-md font-medium tracking-heading text-fg-primary md:mb-5.5 md:text-heading-lg';

export default function HomePage() {
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const setRulesOpen = useUiStore((s) => s.setRulesModalOpen);
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const toggleSound = useUiStore((s) => s.toggleSound);

  const [createName, setCreateName] = useState('');
  const [bestOf, setBestOf] = useState(3);
  const [turnTimer, setTurnTimer] = useState(0);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('Easy');
  const [joinCode, setJoinCode] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (mode: 'friend' | 'bot') =>
      mode === 'bot'
        ? createBotRoom(createName.trim(), bestOf, botDifficulty, turnTimer || null)
        : createRoom(createName.trim(), bestOf, turnTimer || null),
    onSuccess: (result) => {
      savePlayerToken(result.roomCode, result.playerToken);
      navigate(`/oda/${result.roomCode}`);
    },
    onError: (error) => {
      showToast(toUserMessage(error, { fallback: 'Oda oluşturulamadı.' }), 'error');
    },
  });

  const submitCreate = (mode: 'friend' | 'bot') => {
    const parsed = nameSchema.safeParse(createName);
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0].message);
      return;
    }
    setCreateError(null);
    createMutation.mutate(mode);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    submitCreate('friend');
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = codeSchema.safeParse(joinCode);
    if (!parsed.success) {
      setJoinError(parsed.error.issues[0].message);
      return;
    }
    setJoinError(null);
    navigate(`/oda/${parsed.data.toUpperCase()}`);
  };

  const pending = createMutation.isPending;

  return (
    <>
      {/*
        Yeni fontlar (Fraunces / Inter / IBM Plex Mono) yalnızca bu sayfanın kapsamındadır: html/body font-family
        değişmedi, oda ve oyun ekranları mevcut yazı tipini korur.
      */}
      <div className="flex min-h-screen flex-col bg-surface-page font-ui text-fg-primary">
        <div className="mx-auto flex w-full max-w-page flex-1 flex-col px-5 md:px-10 desk:px-24">
          <div className="flex h-16 items-center justify-between md:h-22">
            <BrandMark />
            <div className="flex gap-2">
              <IconButton
                label={soundEnabled ? 'Sesi kapat' : 'Sesi aç'}
                icon={soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                onClick={toggleSound}
              />
              <Button variant="ghost" size="sm" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
                Kurallar
              </Button>
            </div>
          </div>

          <header className="flex items-center justify-between gap-10 pt-3 pb-6.5 md:pt-7 md:pb-13">
            <div>
              <div aria-hidden="true" className="mb-4.5 h-0.5 w-12 bg-action-primary md:mb-6.5" />
              <h1 className="font-brand text-display-md font-medium tracking-display text-fg-primary md:text-display-lg desk:text-display-xl">
                {PRODUCT_NAME}
              </h1>
              <p className="mt-3.5 max-w-115 text-body text-fg-secondary md:mt-5.5 md:text-body-lg">{PRODUCT_TAGLINE}</p>
            </div>
            <BoardPlate className="w-75 shrink-0 desk:w-110" />
          </header>

          <WoodRail />

          <main className="grid grid-cols-1 gap-10 pt-8 pb-10 md:grid-cols-2 md:gap-x-11 md:pt-12 md:pb-14 desk:gap-x-20">
            <section aria-labelledby="create-room-heading">
              <h2 id="create-room-heading" className={sectionHeading}>
                Oda Oluştur
              </h2>
              <form onSubmit={handleCreate} className="flex flex-col gap-5.5 md:gap-6">
                <TextField
                  id="create-name"
                  label="Oyuncu adın"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  maxLength={30}
                  placeholder="Örn. Ayşe"
                  error={createError}
                />
                <OptionGroup
                  legend="Oyun formatı"
                  name="best-of"
                  options={BEST_OF_OPTIONS}
                  value={bestOf}
                  onChange={setBestOf}
                />
                <OptionGroup
                  legend="Hamle süresi"
                  name="turn-timer"
                  options={TURN_TIMER_OPTIONS}
                  value={turnTimer}
                  onChange={setTurnTimer}
                />
                <Button
                  type="submit"
                  fullWidth
                  disabled={pending}
                  loading={pending && createMutation.variables === 'friend'}
                  loadingLabel="Oda oluşturuluyor…"
                >
                  Oda Oluştur
                </Button>

                {/* Arkadaş beklemeden: aynı ad, format ve süreyle yapay zekâya karşı. */}
                <div className="flex flex-col gap-4 border-t border-line-subtle pt-6">
                  <p className="flex items-center gap-2.5 text-body font-semibold text-fg-primary">
                    <Bot size={20} className="text-fg-accent" aria-hidden="true" />
                    Arkadaşın yok mu? Hemen dene
                  </p>
                  <OptionGroup
                    legend="Bot zorluğu"
                    name="bot-difficulty"
                    options={BOT_DIFFICULTY_OPTIONS}
                    value={botDifficulty}
                    onChange={setBotDifficulty}
                    columns={2}
                  />
                  <Button
                    variant="tertiary"
                    fullWidth
                    icon={<Bot size={18} />}
                    onClick={() => submitCreate('bot')}
                    disabled={pending}
                    loading={pending && createMutation.variables === 'bot'}
                    loadingLabel="Masa hazırlanıyor…"
                  >
                    Yapay Zekâya Karşı Oyna
                  </Button>
                </div>
              </form>
            </section>

            <div className="flex flex-col gap-10 md:gap-13">
              <section aria-labelledby="join-room-heading">
                <h2 id="join-room-heading" className={sectionHeading}>
                  Odaya Katıl
                </h2>
                <form onSubmit={handleJoin} className="flex flex-col gap-4.5">
                  <TextField
                    id="join-code"
                    label="Oda kodu"
                    mono
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={8}
                    placeholder="Örn. 7K9M2X"
                    autoCapitalize="characters"
                    aria-describedby="join-code-help"
                    error={joinError}
                  />
                  <p id="join-code-help" className="text-ui-sm text-fg-muted">
                    Arkadaşının paylaştığı bağlantıya tıkladıysan doğrudan odaya yönlendirilirsin. Elinde yalnızca kod
                    varsa buraya yaz.
                  </p>
                  <Button type="submit" variant="secondary" fullWidth>
                    Odaya Katıl
                  </Button>
                </form>
              </section>

              {/* 3 Adımda Nasıl Oynanır rehberi */}
              <section aria-labelledby="how-to-heading" className="border-t border-line-subtle pt-6.5">
                <h2 id="how-to-heading" className={`${sectionHeading} md:mb-5`}>
                  Nasıl oynanır
                </h2>
                <ol className="flex flex-col gap-5">
                  {HOW_TO_STEPS.map((step, index) => (
                    <li key={step.title} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start">
                      <span
                        aria-hidden="true"
                        className="flex size-9 items-center justify-center rounded-pill bg-linear-to-b from-action-primary-from to-action-primary-to font-brand text-xl font-semibold text-fg-on-gold ring-3 ring-surface-selected"
                      >
                        {index + 1}
                      </span>
                      <div>
                        <strong className="mb-1 block text-ui font-semibold text-fg-primary">{step.title}</strong>
                        <span className="text-ui-sm text-fg-secondary">{step.text}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </main>

          <footer className="mt-auto border-t border-line-subtle pt-5.5 pb-7 text-center text-caption text-fg-muted">
            Üyelik gerekmez — misafir olarak oyna. Zarlar sunucuda güvenle atılır.
          </footer>
        </div>
      </div>

      {/* Mevcut modal bu aşamada değişmez; yeni font kapsamının dışında, eski görünümüyle kalır. */}
      <RulesModal />
    </>
  );
}
