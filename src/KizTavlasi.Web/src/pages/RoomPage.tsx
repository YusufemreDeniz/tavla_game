import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BookOpen, DoorOpen, Eye, RefreshCw, Volume2, VolumeX, Zap } from 'lucide-react';
import { z } from 'zod';
import {
  createBotRoom,
  getMatchStats,
  getPublicRoomInfo,
  joinRoom,
  leaveRoom,
  watchRoom,
} from '../api/rooms';
import { ApiError } from '../api/client';
import {
  clearPlayerToken,
  clearSpectatorToken,
  getPlayerToken,
  getSpectatorToken,
  playerIdFromToken,
  savePlayerToken,
  saveSpectatorToken,
} from '../lib/session';
import type { BotDifficulty } from '../types/game';
import { GameHubClient } from '../realtime/gameHubClient';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import ConnectionBadge from '../components/ConnectionBadge';
import RulesModal from '../components/RulesModal';
import ShareLinkCard from '../components/ShareLinkCard';
import { FloatingReactions } from '../components/ReactionsBar';
import { Button, LoadingScreen, Notice, StateScreen, TextField } from '../components/ui';
import { RoomHeader } from '../components/room/RoomHeader';
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
  SPECTATOR_READ_ONLY: 'İzleyiciler hamle yapamaz; maçı yalnızca izleyebilirsin.',
};

export default function RoomPage() {
  const { roomCode: rawRoomCode } = useParams<{ roomCode: string }>();
  const roomCode = (rawRoomCode ?? '').toUpperCase();
  // Başka bir odaya geçildiğinde (ör. "bota karşı oyna") tüm oda durumu sıfırlansın.
  return <RoomScreen key={roomCode} roomCode={roomCode} />;
}

function RoomScreen({ roomCode }: { roomCode: string }) {
  const navigate = useNavigate();

  const [token, setToken] = useState<string | null>(() => getPlayerToken(roomCode));
  const [spectatorToken, setSpectatorToken] = useState<string | null>(() =>
    getPlayerToken(roomCode) ? null : getSpectatorToken(roomCode),
  );

  if (!roomCode) {
    navigate('/');
    return null;
  }

  if (token) {
    return (
      <ConnectedRoom
        roomCode={roomCode}
        token={token}
        onSessionInvalid={() => {
          clearPlayerToken(roomCode);
          setToken(null);
        }}
      />
    );
  }

  if (spectatorToken) {
    return (
      <ConnectedRoom
        roomCode={roomCode}
        token={spectatorToken}
        spectator
        onSessionInvalid={() => {
          clearSpectatorToken(roomCode);
          setSpectatorToken(null);
        }}
      />
    );
  }

  return <JoinRoomView roomCode={roomCode} onJoined={setToken} onWatch={setSpectatorToken} />;
}

function JoinRoomView({
  roomCode,
  onJoined,
  onWatch,
}: {
  roomCode: string;
  onJoined: (token: string) => void;
  onWatch: (token: string) => void;
}) {
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [roomFull, setRoomFull] = useState(false);

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
      if (error instanceof ApiError && error.errorCode === 'ROOM_FULL') {
        // Koltuklar doldu: atmak yerine izleme seçeneği sun.
        setRoomFull(true);
        return;
      }
      const message =
        error instanceof ApiError
          ? (error.errorCode && ERROR_MESSAGES[error.errorCode]) || error.message
          : 'Odaya katılınamadı.';
      showToast(message, 'error');
    },
  });

  const watchMutation = useMutation({
    mutationFn: () => watchRoom(roomCode),
    onSuccess: (result) => {
      saveSpectatorToken(result.roomCode, result.spectatorToken);
      onWatch(result.spectatorToken);
    },
    onError: (error) => {
      showToast(error instanceof ApiError ? error.message : 'Maç izlenemedi.', 'error');
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
    return <LoadingScreen>Oda bilgisi yükleniyor…</LoadingScreen>;
  }

  if (roomInfo.isError) {
    const error = roomInfo.error;
    const message =
      error instanceof ApiError
        ? (error.errorCode && ERROR_MESSAGES[error.errorCode]) || error.message
        : 'Oda bilgisi alınamadı.';
    return <StateScreen title={message} actions={<Button onClick={() => navigate('/')}>Ana Sayfaya Dön</Button>} />;
  }

  const host = roomInfo.data?.players.find((p) => p.isHost);
  const isFull = roomFull || (roomInfo.data?.players.length ?? 0) >= 2;

  if (isFull) {
    const names = roomInfo.data?.players.map((p) => p.displayName).join(' ve ');
    return (
      <StateScreen
        icon={<Eye size={36} />}
        title="Masa dolu"
        description={
          names ? (
            <>
              <strong className="font-semibold text-fg-accent">{names}</strong> oynuyor. Maçı canlı olarak izleyebilirsin.
            </>
          ) : (
            'Bu odadaki iki koltuk da dolu. Maçı canlı olarak izleyebilirsin.'
          )
        }
        actions={
          <>
            <Button
              icon={<Eye size={18} />}
              onClick={() => watchMutation.mutate()}
              disabled={watchMutation.isPending}
              loading={watchMutation.isPending}
              loadingLabel="Bağlanıyor…"
            >
              Maçı İzle
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>
              Ana Sayfaya Dön
            </Button>
          </>
        }
      />
    );
  }

  const codeClass = 'font-code font-medium tracking-code text-fg-accent';

  return (
    <StateScreen
      align="start"
      title={PRODUCT_NAME}
      description={
        host ? (
          <>
            <strong className="font-semibold text-fg-accent">{host.displayName}</strong> seni{' '}
            <span className={codeClass}>{roomCode}</span> odasına davet etti.
          </>
        ) : (
          <>
            <span className={codeClass}>{roomCode}</span> odasına katılıyorsun.
          </>
        )
      }
    >
      <form onSubmit={handleJoin} className="flex flex-col gap-5">
        <TextField
          id="join-name"
          label="Oyuncu adın"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="Örn. Fatma"
          error={nameError}
        />
        <Button type="submit" fullWidth loading={joinMutation.isPending} loadingLabel="Katılıyor…">
          Odaya Katıl
        </Button>
      </form>
    </StateScreen>
  );
}

function ConnectedRoom({
  roomCode,
  token,
  onSessionInvalid,
  spectator = false,
}: {
  roomCode: string;
  token: string;
  onSessionInvalid: () => void;
  /** Salt okunur izleyici bağlantısı: komut göndermez, odadan çıkış yalnızca yereldir. */
  spectator?: boolean;
}) {
  const navigate = useNavigate();
  const snapshot = useGameStore((s) => s.snapshot);
  const connectionStatus = useGameStore((s) => s.connectionStatus);
  const spectatorCount = useGameStore((s) => s.spectatorCount);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
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
    setMyPlayerId(spectator ? null : playerIdFromToken(token));
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
  }, [token, spectator, setMyPlayerId, reset]);

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
    if (spectator) {
      clearSpectatorToken(roomCode);
      navigate('/');
      return;
    }
    try {
      await leaveRoom(roomCode, token);
    } catch {
      // Oda zaten kapanmış olabilir; yine de çıkıyoruz.
    }
    clearPlayerToken(roomCode);
    navigate('/');
  }, [roomCode, token, navigate, spectator]);

  /** Rakip beklerken: bu odayı kapatıp aynı ad/format/süreyle bota karşı yeni masa aç. */
  const handlePlayBot = useCallback(
    async (difficulty: BotDifficulty) => {
      const me = snapshot?.players.find((p) => p.id === myPlayerId);
      if (!snapshot || !me) return;
      try {
        const result = await createBotRoom(
          me.displayName,
          snapshot.bestOf,
          difficulty,
          snapshot.turnTimeLimitSeconds ?? null,
        );
        try {
          await leaveRoom(roomCode, token);
        } catch {
          // Eski oda zaten kapanmış olabilir.
        }
        clearPlayerToken(roomCode);
        savePlayerToken(result.roomCode, result.playerToken);
        navigate(`/oda/${result.roomCode}`);
      } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Bot masası açılamadı.', 'error');
      }
    },
    [snapshot, myPlayerId, roomCode, token, navigate, showToast],
  );

  /**
   * Komut katmanı koruması: bağlantı 'connected' değilse StartMatch gönderilmez. Durum çağrı ANINDA store'dan okunur
   * (render'daki değer değil) → stale closure olmaz. Sunucu yetkilendirmesinin yerini almaz; UI'daki disabled ile aynı kaynağı kullanır.
   */
  const handleStartMatch = useCallback(() => {
    if (useGameStore.getState().connectionStatus !== 'connected') return Promise.resolve();
    return invoke((h) => h.startMatch());
  }, [invoke]);

  const matchActive = snapshot?.status === 'Playing' || snapshot?.status === 'Completed';

  // Lobi (inLobby ile aynı koşul) A3 başlığını kullanır; oyun durumları mevcut başlığı AYNEN korur.
  const lobbyHeader = snapshot?.status === 'Waiting' || snapshot?.status === 'InLobby';

  const header = useMemo(
    () =>
      lobbyHeader ? (
        <RoomHeader
          roomCode={roomCode}
          connectionStatus={connectionStatus}
          spectatorCount={spectatorCount}
          spectator={spectator}
          fastMode={fastMode}
          soundEnabled={soundEnabled}
          onToggleFastMode={toggleFastMode}
          onToggleSound={toggleSound}
          onOpenRules={() => setRulesOpen(true)}
          onLeave={handleLeave}
        />
      ) : (
        <header className="mb-3 flex items-center justify-between gap-2 md:mb-4">
          <div className="flex items-center gap-2.5">
            {/* Oyun sürerken oda kodu ve "Bağlı" rozeti gizlenir; bağlantı sorunu olursa rozet görünür. */}
            {(!matchActive || connectionStatus !== 'connected') && (
              <>
                <span className="rounded-lg border border-gold-500/30 bg-night-800 px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-gold-400">
                  {roomCode}
                </span>
                <ConnectionBadge status={connectionStatus} />
              </>
            )}
            {spectatorCount > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-night-600 px-2 py-0.5 text-[11px] text-cream-300"
                aria-label={`${spectatorCount} izleyici`}
                title="Maçı izleyenler"
              >
                <Eye size={12} aria-hidden="true" />
                {spectatorCount}
              </span>
            )}
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
              aria-label={spectator ? 'İzlemeyi bırak' : 'Odadan çık'}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-bordo-600/50 p-2.5 text-rose-400 hover:bg-bordo-700/30"
            >
              <DoorOpen size={16} />
            </button>
          </div>
        </header>
      ),
    [
      lobbyHeader,
      roomCode,
      connectionStatus,
      matchActive,
      spectatorCount,
      spectator,
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
      <StateScreen
        title="Sunucuya bağlanılamadı."
        description="Oturumun geçersiz olabilir veya oda kapanmış olabilir."
        actions={
          <>
            <Button onClick={() => window.location.reload()}>Tekrar Dene</Button>
            <Button
              variant="ghost"
              onClick={() => {
                clearPlayerToken(roomCode);
                navigate('/');
              }}
            >
              Ana Sayfa
            </Button>
            {/* Hata türü istemcide ayırt edilemez: token otomatik silinmez; kullanıcı açıkça seçer.
                onSessionInvalid yalnızca BU odanın, BU oturum türünün token'ını siler ve katılma/izleme akışına döner. */}
            <Button variant="tertiary" onClick={onSessionInvalid}>
              {spectator ? 'Bu Odadaki İzleme Oturumunu Sıfırla' : 'Bu Odadaki Oturumu Sıfırla'}
            </Button>
          </>
        }
      >
        <p className="text-center text-ui-sm text-fg-muted">
          {spectator
            ? 'Tekrar Dene sorunu çözmezse izleme oturumun artık geçersiz olabilir. Oturumu sıfırlarsan bu odayı yeniden izlemeyi seçebilirsin.'
            : 'Tekrar Dene sorunu çözmezse oturumun artık geçersiz olabilir. Oturumu sıfırlarsan oyuncu koltuğuna otomatik geri dönemezsin; oda doluysa yalnızca izleyebilirsin.'}
        </p>
      </StateScreen>
    );
  }

  if (!snapshot) {
    return <LoadingScreen>Odaya bağlanılıyor…</LoadingScreen>;
  }

  const inLobby = snapshot.status === 'Waiting' || snapshot.status === 'InLobby';

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-2.5 py-3 md:px-4 md:py-6">
      {header}

      {connectionStatus === 'reconnecting' &&
        (inLobby ? (
          <Notice
            role="alert"
            icon={<RefreshCw size={16} />}
            className="mb-3 justify-start border-line-accent text-left text-fg-accent"
          >
            Bağlantı kesildi. Oyun durumu korunuyor, yeniden bağlanılıyor…
          </Notice>
        ) : (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-gold-500/40 bg-night-800 px-4 py-2.5 text-sm text-gold-400"
          >
            Bağlantı kesildi. Oyun durumu korunuyor, yeniden bağlanılıyor…
          </div>
        ))}

      {inLobby ? (
        <LobbyView
          snapshot={snapshot}
          spectator={spectator}
          onStartMatch={handleStartMatch}
          onPlayBot={spectator ? undefined : handlePlayBot}
        />
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
          spectator={spectator}
          loadStats={() => getMatchStats(roomCode, token)}
        />
      )}

      {/* Bot odasına davet edilecek kimse yok; izleyici de lobide paylaşım yapmaz. */}
      {inLobby && !spectator && !snapshot.players.some((p) => p.isBot) && (
        <ShareSection roomCode={roomCode} />
      )}
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
