import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BookOpen, DoorOpen, Volume2, VolumeX, Zap } from 'lucide-react';
import { z } from 'zod';
import { getPublicRoomInfo, joinRoom, leaveRoom } from '../api/rooms';
import { ApiError } from '../api/client';
import { clearPlayerToken, getPlayerToken, playerIdFromToken, savePlayerToken } from '../lib/session';
import { GameHubClient } from '../realtime/gameHubClient';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import ConnectionBadge from '../components/ConnectionBadge';
import RulesModal from '../components/RulesModal';
import ShareLinkCard from '../components/ShareLinkCard';
import { FloatingReactions } from '../components/ReactionsBar';
import LobbyView from './LobbyView';
import GameView from './GameView';
import { PRODUCT_NAME } from '../config/branding';

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Oyuncu adı en az 2 karakter olmalıdır.')
  .max(30, 'Oyuncu adı en fazla 30 karakter olabilir.');

const ERROR_MESSAGES: Record<string, string> = {
  ROOM_NOT_FOUND: 'Böyle bir oda bulunamadı. Kodu kontrol et.',
  ROOM_FULL: 'Bu oda dolu; en fazla iki oyuncu katılabilir.',
  ROOM_EXPIRED: 'Bu odanın süresi dolmuş. Yeni bir oda oluşturabilirsin.',
};

export default function RoomPage() {
  const { roomCode: rawRoomCode } = useParams<{ roomCode: string }>();
  const roomCode = (rawRoomCode ?? '').toUpperCase();
  const navigate = useNavigate();

  const [token, setToken] = useState<string | null>(() => getPlayerToken(roomCode));

  if (!roomCode) {
    navigate('/');
    return null;
  }

  return token ? (
    <ConnectedRoom
      roomCode={roomCode}
      token={token}
      onSessionInvalid={() => {
        clearPlayerToken(roomCode);
        setToken(null);
      }}
    />
  ) : (
    <JoinRoomView roomCode={roomCode} onJoined={setToken} />
  );
}

function JoinRoomView({ roomCode, onJoined }: { roomCode: string; onJoined: (token: string) => void }) {
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const roomInfo = useQuery({
    queryKey: ['room-info', roomCode],
    queryFn: () => getPublicRoomInfo(roomCode),
    retry: false,
  });

  const joinMutation = useMutation({
    mutationFn: () => joinRoom(roomCode, name.trim()),
    onSuccess: (result) => {
      savePlayerToken(result.roomCode, result.playerToken);
      onJoined(result.playerToken);
    },
    onError: (error) => {
      const message =
        error instanceof ApiError
          ? (error.errorCode && ERROR_MESSAGES[error.errorCode]) || error.message
          : 'Odaya katılınamadı.';
      showToast(message, 'error');
    },
  });

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0].message);
      return;
    }
    setNameError(null);
    joinMutation.mutate();
  };

  if (roomInfo.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-cream-300" role="status">
          Oda bilgisi yükleniyor…
        </p>
      </main>
    );
  }

  if (roomInfo.isError) {
    const error = roomInfo.error;
    const message =
      error instanceof ApiError
        ? (error.errorCode && ERROR_MESSAGES[error.errorCode]) || error.message
        : 'Oda bilgisi alınamadı.';
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg text-cream-100">{message}</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="min-h-11 rounded-xl bg-bordo-600 px-6 py-3 font-semibold text-cream-50"
        >
          Ana Sayfaya Dön
        </button>
      </main>
    );
  }

  const host = roomInfo.data?.players.find((p) => p.isHost);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-gold-500/20 bg-night-800 p-6 shadow-xl"
      >
        <h1 className="mb-1 font-display text-2xl text-cream-50">{PRODUCT_NAME}</h1>
        <p className="mb-6 text-sm text-cream-300">
          {host ? (
            <>
              <strong className="text-gold-400">{host.displayName}</strong> seni{' '}
              <span className="font-mono font-bold text-gold-400">{roomCode}</span> odasına davet
              etti.
            </>
          ) : (
            <>
              <span className="font-mono font-bold text-gold-400">{roomCode}</span> odasına
              katılıyorsun.
            </>
          )}
        </p>
        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label htmlFor="join-name" className="mb-1.5 block text-sm text-cream-300">
              Oyuncu adın
            </label>
            <input
              id="join-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              placeholder="Örn. Fatma"
              className="w-full rounded-xl border border-night-600 bg-night-900 px-4 py-3 text-cream-50 placeholder:text-cream-400/50"
            />
            {nameError && (
              <p role="alert" className="mt-1.5 text-xs text-rose-400">
                {nameError}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={joinMutation.isPending}
            className="min-h-11 w-full rounded-xl bg-gradient-to-r from-bordo-600 to-bordo-700 px-4 py-3 font-semibold text-cream-50 shadow-lg disabled:opacity-60"
          >
            {joinMutation.isPending ? 'Katılıyor…' : 'Odaya Katıl'}
          </button>
        </form>
      </motion.div>
    </main>
  );
}

function ConnectedRoom({
  roomCode,
  token,
  onSessionInvalid,
}: {
  roomCode: string;
  token: string;
  onSessionInvalid: () => void;
}) {
  const navigate = useNavigate();
  const snapshot = useGameStore((s) => s.snapshot);
  const connectionStatus = useGameStore((s) => s.connectionStatus);
  const setMyPlayerId = useGameStore((s) => s.setMyPlayerId);
  const reset = useGameStore((s) => s.reset);
  const showToast = useUiStore((s) => s.showToast);
  const setRulesOpen = useUiStore((s) => s.setRulesModalOpen);
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const toggleSound = useUiStore((s) => s.toggleSound);
  const fastMode = useUiStore((s) => s.fastMode);
  const toggleFastMode = useUiStore((s) => s.toggleFastMode);

  const hubRef = useRef<GameHubClient | null>(null);
  const [connectFailed, setConnectFailed] = useState(false);

  useEffect(() => {
    setMyPlayerId(playerIdFromToken(token));
    const hub = new GameHubClient(token);
    hubRef.current = hub;
    let cancelled = false;

    hub.start().catch(() => {
      if (!cancelled) setConnectFailed(true);
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void hubRef.current?.refreshState();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void hub.stop();
      hubRef.current = null;
      reset();
    };
  }, [token, setMyPlayerId, reset]);

  const invoke = useCallback(
    async (action: (hub: GameHubClient) => Promise<void>) => {
      const hub = hubRef.current;
      if (!hub) return;
      try {
        await action(hub);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('INVALID_SESSION') || message.includes('PLAYER_NOT_IN_ROOM')) {
          onSessionInvalid();
          return;
        }
        if (message.includes('Sıra sizde değil') || message.includes('NOT_YOUR_TURN')) {
          showToast('Sıra sende değil.', 'error');
        } else if (message.includes('güncel değil') || message.includes('STALE_STATE')) {
          void hub.refreshState();
          showToast('Oyun durumu senkronize edildi, hamleni tekrar yapabilirsin.', 'info');
        } else if (message.length > 0) {
          const cleaned = message.replace(/^.*HubException: /, '');
          showToast(cleaned, 'error');
        }
      }
    },
    [onSessionInvalid, showToast],
  );

  const handleLeave = useCallback(async () => {
    try {
      await leaveRoom(roomCode, token);
    } catch {
      // Oda zaten kapanmış olabilir; yine de çıkıyoruz.
    }
    clearPlayerToken(roomCode);
    navigate('/');
  }, [roomCode, token, navigate]);

  const header = useMemo(
    () => (
      <header className="mb-3 flex items-center justify-between gap-2 md:mb-4">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg border border-gold-500/30 bg-night-800 px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-gold-400">
            {roomCode}
          </span>
          <ConnectionBadge status={connectionStatus} />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleFastMode}
            aria-label={fastMode ? 'Normal animasyon hızına geç' : 'Hızlı animasyon modunu aç'}
            aria-pressed={fastMode}
            title={fastMode ? 'Hızlı animasyon açık' : 'Normal animasyon hızı'}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border p-2.5 transition-colors ${
              fastMode
                ? 'border-gold-500/60 bg-gold-500/15 text-gold-400'
                : 'border-night-600 text-cream-300 hover:bg-night-800'
            }`}
          >
            <Zap size={16} />
          </button>
          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundEnabled ? 'Sesi kapat' : 'Sesi aç'}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-night-600 p-2.5 text-cream-300 hover:bg-night-800"
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            aria-label="Kuralları göster"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-night-600 p-2.5 text-cream-300 hover:bg-night-800"
          >
            <BookOpen size={16} />
          </button>
          <button
            type="button"
            onClick={handleLeave}
            aria-label="Odadan çık"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-bordo-600/50 p-2.5 text-rose-400 hover:bg-bordo-700/30"
          >
            <DoorOpen size={16} />
          </button>
        </div>
      </header>
    ),
    [
      roomCode,
      connectionStatus,
      fastMode,
      toggleFastMode,
      soundEnabled,
      toggleSound,
      setRulesOpen,
      handleLeave,
    ],
  );

  if (connectFailed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg text-cream-100">Sunucuya bağlanılamadı.</p>
        <p className="max-w-sm text-sm text-cream-300">
          Oturumun geçersiz olabilir veya oda kapanmış olabilir.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-xl bg-bordo-600 px-6 py-3 font-semibold text-cream-50"
          >
            Tekrar Dene
          </button>
          <button
            type="button"
            onClick={() => {
              clearPlayerToken(roomCode);
              navigate('/');
            }}
            className="min-h-11 rounded-xl border border-night-600 px-6 py-3 font-semibold text-cream-300"
          >
            Ana Sayfa
          </button>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-cream-300" role="status">
          Odaya bağlanılıyor…
        </p>
      </main>
    );
  }

  const inLobby = snapshot.status === 'Waiting' || snapshot.status === 'InLobby';

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-2.5 py-3 md:px-4 md:py-6">
      {header}

      {connectionStatus === 'reconnecting' && (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-gold-500/40 bg-night-800 px-4 py-2.5 text-sm text-gold-400"
        >
          Bağlantı kesildi. Oyun durumu korunuyor, yeniden bağlanılıyor…
        </div>
      )}

      {inLobby ? (
        <LobbyView snapshot={snapshot} onStartMatch={() => invoke((h) => h.startMatch())} />
      ) : (
        <GameView
          snapshot={snapshot}
          onRollDice={(version) => invoke((h) => h.rollDice(version))}
          onPlayMove={(pointNumber, version) => invoke((h) => h.playMove(pointNumber, version))}
          onSendReaction={(emoji) => invoke((h) => h.sendReaction(emoji))}
          onRequestRematch={() => invoke((h) => h.requestRematch())}
          onAcceptRematch={() => invoke((h) => h.acceptRematch())}
          onDeclineRematch={() => invoke((h) => h.declineRematch())}
          onLeave={handleLeave}
        />
      )}

      {inLobby && <ShareSection roomCode={roomCode} />}
      <RulesModal />
      <FloatingReactions />
    </main>
  );
}

function ShareSection({ roomCode }: { roomCode: string }) {
  return (
    <div className="mt-4">
      <ShareLinkCard roomCode={roomCode} />
    </div>
  );
}
