import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Dices, Users, BookOpen, Volume2, VolumeX } from 'lucide-react';
import { z } from 'zod';
import { createRoom } from '../api/rooms';
import { ApiError } from '../api/client';
import { savePlayerToken } from '../lib/session';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../config/branding';
import { useUiStore } from '../store/uiStore';
import RulesModal from '../components/RulesModal';

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
  { value: 1, label: 'Tek El' },
  { value: 3, label: '3 El' },
  { value: 5, label: '5 El' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const setRulesOpen = useUiStore((s) => s.setRulesModalOpen);
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const toggleSound = useUiStore((s) => s.toggleSound);

  const [createName, setCreateName] = useState('');
  const [bestOf, setBestOf] = useState(3);
  const [joinCode, setJoinCode] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createRoom(createName.trim(), bestOf),
    onSuccess: (result) => {
      savePlayerToken(result.roomCode, result.playerToken);
      navigate(`/oda/${result.roomCode}`);
    },
    onError: (error) => {
      showToast(error instanceof ApiError ? error.message : 'Oda oluşturulamadı.', 'error');
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = nameSchema.safeParse(createName);
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0].message);
      return;
    }
    setCreateError(null);
    createMutation.mutate();
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

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center px-4 py-10">
      <div className="mb-2 flex w-full justify-end gap-2">
        <button
          type="button"
          onClick={toggleSound}
          aria-label={soundEnabled ? 'Sesi kapat' : 'Sesi aç'}
          className="rounded-xl border border-night-600 p-2.5 text-cream-300 hover:bg-night-800"
        >
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button
          type="button"
          onClick={() => setRulesOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-night-600 px-4 py-2.5 text-sm text-cream-300 hover:bg-night-800"
        >
          <BookOpen size={16} aria-hidden="true" />
          Kurallar
        </button>
      </div>

      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10 text-center"
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border-2 border-gold-500/40 bg-gradient-to-br from-walnut-700 to-walnut-900 shadow-xl"
        >
          <Dices size={40} className="text-gold-400" />
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-cream-50 md:text-5xl">
          {PRODUCT_NAME}
        </h1>
        <p className="mt-3 max-w-md text-sm text-cream-300 md:text-base">{PRODUCT_TAGLINE}</p>
      </motion.header>

      <div className="grid w-full gap-6 md:grid-cols-2">
        <motion.section
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          aria-labelledby="create-room-heading"
          className="rounded-2xl border border-gold-500/15 bg-night-800 p-6 shadow-xl"
        >
          <h2 id="create-room-heading" className="mb-4 flex items-center gap-2 font-display text-lg text-gold-400">
            <Dices size={20} aria-hidden="true" />
            Oda Oluştur
          </h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="create-name" className="mb-1.5 block text-sm text-cream-300">
                Oyuncu adın
              </label>
              <input
                id="create-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                maxLength={30}
                placeholder="Örn. Ayşe"
                className="w-full rounded-xl border border-night-600 bg-night-900 px-4 py-3 text-cream-50 placeholder:text-cream-400/50"
              />
              {createError && (
                <p role="alert" className="mt-1.5 text-xs text-rose-400">
                  {createError}
                </p>
              )}
            </div>
            <fieldset>
              <legend className="mb-1.5 block text-sm text-cream-300">Oyun formatı</legend>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Oyun formatı">
                {BEST_OF_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={bestOf === option.value}
                    onClick={() => setBestOf(option.value)}
                    className={`min-h-11 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      bestOf === option.value
                        ? 'border-gold-500 bg-bordo-600 text-cream-50'
                        : 'border-night-600 bg-night-900 text-cream-300 hover:border-night-600 hover:bg-night-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="min-h-11 w-full rounded-xl bg-gradient-to-r from-bordo-600 to-bordo-700 px-4 py-3 font-semibold text-cream-50 shadow-lg transition-transform hover:scale-[1.02] disabled:opacity-60"
            >
              {createMutation.isPending ? 'Oda oluşturuluyor…' : 'Oda Oluştur'}
            </button>
          </form>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          aria-labelledby="join-room-heading"
          className="rounded-2xl border border-gold-500/15 bg-night-800 p-6 shadow-xl"
        >
          <h2 id="join-room-heading" className="mb-4 flex items-center gap-2 font-display text-lg text-gold-400">
            <Users size={20} aria-hidden="true" />
            Odaya Katıl
          </h2>
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label htmlFor="join-code" className="mb-1.5 block text-sm text-cream-300">
                Oda kodu
              </label>
              <input
                id="join-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="Örn. 7K9M2X"
                autoCapitalize="characters"
                className="w-full rounded-xl border border-night-600 bg-night-900 px-4 py-3 font-mono text-lg tracking-[0.3em] text-cream-50 placeholder:tracking-normal placeholder:text-cream-400/50"
              />
              {joinError && (
                <p role="alert" className="mt-1.5 text-xs text-rose-400">
                  {joinError}
                </p>
              )}
            </div>
            <p className="text-xs leading-relaxed text-cream-400">
              Arkadaşının paylaştığı bağlantıya tıkladıysan doğrudan odaya yönlendirilirsin. Elinde
              yalnızca kod varsa buraya yaz.
            </p>
            <button
              type="submit"
              className="min-h-11 w-full rounded-xl border border-gold-500/40 bg-night-700 px-4 py-3 font-semibold text-gold-400 transition-colors hover:bg-night-600"
            >
              Odaya Katıl
            </button>
          </form>
        </motion.section>
      </div>

      <footer className="mt-12 text-xs text-cream-400/60">
        Üyelik gerekmez — misafir olarak oyna. Zarlar sunucuda güvenle atılır.
      </footer>

      <RulesModal />
    </main>
  );
}
