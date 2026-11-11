import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dices, Eye, Home, RotateCcw, Sparkles, Trophy, WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { MatchStatsDto, RoomSnapshotDto } from '../types/game';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import Die from '../components/Die';
import DiceArena, { type DiceImpact } from '../components/DiceArena';
import TurnTimer from '../components/TurnTimer';
import MatchStatsPanel from '../components/MatchStatsPanel';
import BackgammonBoard, { type PointFlash } from '../components/BackgammonBoard';
import { DiceStatus } from '../components/game/DiceStatus';
import { PlayerCard } from '../components/game/PlayerCard';
import { Badge, Button, Notice, Panel } from '../components/ui';
import ShareLinkCard from '../components/ShareLinkCard';
import MarsCelebration from '../components/MarsCelebration';
import { ReactionsBar } from '../components/ReactionsBar';
import {
  playCollectSound,
  playDiceImpact,
  playDoubleChord,
  playLoseSound,
  playMarsFanfare,
  playPieceSound,
  playWinSound,
} from '../lib/sound';
import { flightTouchdownMs, scaleDuration, useMotionPrefs } from '../lib/motion';
import { MIN_SHAKE_MS, SECOND_DIE_DELAY_MS, THROW_MS } from '../lib/diceThrow';
import { diceUsage } from '../lib/diceUsage';
import { useBoardOrientation } from '../lib/useBoardOrientation';

const NOT_USED: [boolean, boolean] = [false, false];

interface GameViewProps {
  snapshot: RoomSnapshotDto;
  onRollDice: (expectedStateVersion: number) => void;
  onPlayMove: (pointNumber: number, expectedStateVersion: number) => void;
  onSendReaction: (emoji: string) => void;
  onRequestRematch: () => void;
  onAcceptRematch: () => void;
  onDeclineRematch: () => void;
  onLeave: () => void;
  /** Salt okunur izleyici: tahta 1. koltuğun bakışından gösterilir, komut düğmeleri yoktur. */
  spectator?: boolean;
  /** Maç sonu analitiği (sunucuda hesaplanır). Verilmezse yalnızca özet gösterilir. */
  loadStats?: () => Promise<MatchStatsDto>;
}

export default function GameView({
  snapshot,
  onRollDice,
  onPlayMove,
  onSendReaction,
  onRequestRematch,
  onAcceptRematch,
  onDeclineRematch,
  onLeave,
  spectator = false,
  loadStats,
}: GameViewProps) {
  const navigate = useNavigate();
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const pendingRoll = useGameStore((s) => s.pendingRoll);
  const setPendingRoll = useGameStore((s) => s.setPendingRoll);
  const lastMovePlayed = useGameStore((s) => s.lastMovePlayed);
  const clearMovePlayed = useGameStore((s) => s.clearMovePlayed);
  const rollingPlayerId = useGameStore((s) => s.rollingPlayerId);
  const startingRoll = useGameStore((s) => s.startingRoll);
  const lastRoundEnded = useGameStore((s) => s.lastRoundEnded);
  const lastMatchEnded = useGameStore((s) => s.lastMatchEnded);
  const setRoundEnded = useGameStore((s) => s.setRoundEnded);
  const history = useGameStore((s) => s.history);
  const addHistory = useGameStore((s) => s.addHistory);
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const { fast: fastMode, reduced: reducedMotion } = useMotionPrefs();
  const orientation = useBoardOrientation();

  const [displayedDice, setDisplayedDice] = useState<[number, number] | null>(null);
  const [rollInProgress, setRollInProgress] = useState(false);
  const [moveInProgressVersion, setMoveInProgressVersion] = useState<number | null>(null);
  const [moveFlash, setMoveFlash] = useState<(PointFlash & { playerId: string }) | null>(null);
  const [rollToken, setRollToken] = useState(0);
  const [shakeToken, setShakeToken] = useState<number | null>(null);
  /** Son zarı atan oyuncu: zarlar onun tarafından fırlatılır. */
  const [rollerId, setRollerId] = useState<string | null>(null);
  /** Zarlar masaya oturdu (atış animasyonu bitti). */
  const [diceSettled, setDiceSettled] = useState(false);
  /** Zarların ekrana konduğu an (sonraki atış, bunlar inip okunana kadar bekler). */
  const diceShownAtRef = useRef<number | null>(null);
  const [holdTick, setHoldTick] = useState(0);
  const rollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const soundTimers = soundTimersRef.current;
    return () => {
      if (rollTimeoutRef.current) {
        clearTimeout(rollTimeoutRef.current);
      }
      soundTimers.forEach(clearTimeout);
      soundTimers.clear();
    };
  }, []);

  // Ekranda zar yokken bekleme süresi de yok (örn. kendi atışımda eski zarlar temizlenmiştir).
  useEffect(() => {
    if (displayedDice === null) diceShownAtRef.current = null;
  }, [displayedDice]);

  /** Ekrandaki zarların atış animasyonu + okunma süresi bitene kadar kalan ms. */
  const diceHoldRemaining = useCallback(() => {
    if (diceShownAtRef.current === null) return 0;
    const prefs = { fast: fastMode, reduced: reducedMotion };
    const total =
      scaleDuration(MIN_SHAKE_MS + THROW_MS + SECOND_DIE_DELAY_MS, prefs) +
      scaleDuration(1500, prefs);
    return Math.max(0, diceShownAtRef.current + total - performance.now());
  }, [fastMode, reducedMotion]);

  /** Sesi animasyonla eşzamanlamak için gecikmeli çalar (pul masaya değdiğinde). */
  const playLater = useCallback((play: () => void, delayMs: number) => {
    if (delayMs <= 0) {
      play();
      return;
    }
    const timer = setTimeout(() => {
      soundTimersRef.current.delete(timer);
      play();
    }, delayMs);
    soundTimersRef.current.add(timer);
  }, []);

  const match = snapshot.match;
  const round = match?.currentRound ?? null;
  const players = snapshot.players;
  // İzleyici bir oyuncu değildir: tahtayı 1. koltuğun bakışından görür.
  const me =
    players.find((p) => p.id === myPlayerId) ??
    (spectator ? (players.find((p) => p.seat === 1) ?? null) : null);
  const viewerId = me?.id ?? null;
  const opponent = players.find((p) => p.id !== viewerId) ?? null;
  const currentPlayer = players.find((p) => p.id === round?.currentPlayerId) ?? null;

  const myBoard = round?.boards.find((b) => b.playerId === viewerId) ?? null;
  const opponentBoard = round?.boards.find((b) => b.playerId !== viewerId) ?? null;

  const isMyTurn =
    !spectator && round?.currentPlayerId === myPlayerId && round?.status === 'InProgress';
  const matchCompleted = match?.status === 'Completed';
  const roundPendingDice = round?.pendingDice;
  const pendingDice = useMemo(() => roundPendingDice ?? [], [roundPendingDice]);
  const pendingPicks = round?.pendingBonusPicks ?? 0;
  const hasPendingMoves = pendingDice.length > 0 || pendingPicks > 0;
  const moveInProgress = moveInProgressVersion === snapshot.stateVersion;
  const iMustMove = isMyTurn && hasPendingMoves;
  const opponentMoving = !isMyTurn && hasPendingMoves && round?.status === 'InProgress';

  /**
   * Tıklanabilir haneler:
   * - Bekleyen zar varsa o zarlar arasından şu anki aşamada oynanabilir olanlar
   *   (aynı zar turunda son indirme tamamlandığında diğer zar hemen ardından parlar).
   * - Serbest çift bonusu varsa oynanabilir tüm haneler.
   */
  const clickablePoints = useMemo(() => {
    if (!iMustMove || moveInProgress || !myBoard || matchCompleted) return [];
    const canPlayPoint = (pointNumber: number) => {
      const pt = myBoard.points.find((p) => p.pointNumber === pointNumber);
      if (!pt) return false;
      return myBoard.isCollecting ? pt.backCount + pt.frontCount > 0 : pt.backCount > 1;
    };

    if (pendingDice.length > 0) {
      const currentlyPlayable = [...new Set(pendingDice)].filter(canPlayPoint);
      return currentlyPlayable.length > 0 ? currentlyPlayable : [...new Set(pendingDice)];
    }

    return myBoard.points.filter((p) => canPlayPoint(p.pointNumber)).map((p) => p.pointNumber);
  }, [iMustMove, moveInProgress, myBoard, matchCompleted, pendingDice]);

  // Zar sonucu geldiğinde: ses, geçmiş ve zar yüzleri.
  useEffect(() => {
    if (!pendingRoll) return;

    // Önceki zarlar henüz inmediyse veya okunacak kadar görünmediyse yeni atış bekler
    // (boş gelen atışta sıra hemen rakibe geçer; zarlar yok olmamalı).
    const wait = diceHoldRemaining();
    if (wait > 0) {
      const timer = setTimeout(() => setHoldTick((n) => n + 1), wait);
      return () => clearTimeout(timer);
    }

    if (rollTimeoutRef.current) {
      clearTimeout(rollTimeoutRef.current);
      rollTimeoutRef.current = null;
    }

    const roller = players.find((p) => p.id === pendingRoll.playerId);
    const rollerName = roller?.displayName ?? 'Oyuncu';
    diceShownAtRef.current = performance.now();
    setDisplayedDice([pendingRoll.die1, pendingRoll.die2]);
    setRollToken((t) => t + 1);
    setRollerId(pendingRoll.playerId);
    setDiceSettled(false);
    setRollInProgress(false);
    // Zar sesi ve çift zar sarsıntısı, DiceArena'nın masaya değme anlarında tetiklenir (handleDiceImpact).

    pendingRoll.wastedSteps.forEach((step) => addHistory(`${step.die} zarı boşa gitti`));
    if (pendingRoll.isDouble && pendingRoll.bonusPicksGranted > 0) {
      addHistory(`Çift! Toplam ${pendingRoll.bonusPicksGranted + 1} hamle hakkı`);
    }
    if (pendingRoll.turnWasted) {
      addHistory(`${rollerName} oynayamadı, sıra geçti`);
    }
    // En yeni kayıt (tek satırlık geçmişte görünen) her zaman atışın kendisidir.
    addHistory(
      `${rollerName} ${pendingRoll.die1}-${pendingRoll.die2} attı${pendingRoll.isDouble ? ' (çift!)' : ''}`,
    );

    setPendingRoll(null);
  }, [pendingRoll, players, addHistory, setPendingRoll, holdTick, diceHoldRemaining]);

  // Rakip zar atmaya başlayınca önceki zarlar tahtadan kalkar; yeni atış elde sallanarak başlar.
  useEffect(() => {
    if (!rollingPlayerId) return;
    const timer = setTimeout(() => setDisplayedDice(null), diceHoldRemaining());
    return () => clearTimeout(timer);
  }, [rollingPlayerId, diceHoldRemaining]);

  // Oynanan hamle: ses + geçmiş + hane vurgusu.
  useEffect(() => {
    if (!lastMovePlayed) return;
    const mover = players.find((p) => p.id === lastMovePlayed.playerId);
    const moverName = mover?.displayName ?? 'Oyuncu';

    if (soundEnabled) {
      const isCollect = lastMovePlayed.action === 'Collect';
      // Ses, pul masaya DEĞDİĞİ anda çalar (uçuşun sonunda küçük sekme/oturma kalır).
      const railCount =
        round?.boards.find((b) => b.playerId === lastMovePlayed.playerId)?.collectedCount ?? 0;
      playLater(
        isCollect ? () => playCollectSound(railCount) : playPieceSound,
        flightTouchdownMs(isCollect ? 'collect' : 'advance', { fast: fastMode, reduced: reducedMotion }),
      );
    }

    // Oynanan hanede altın flaş göster.
    setMoveFlash({
      playerId: lastMovePlayed.playerId,
      point: lastMovePlayed.pointNumber,
      token: lastMovePlayed.stateVersion,
    });

    addHistory(
      lastMovePlayed.action === 'Collect'
        ? `${moverName} ${lastMovePlayed.pointNumber}. haneden pul topladı`
        : `${moverName} ${lastMovePlayed.pointNumber}. haneden pul indirdi`,
    );
    lastMovePlayed.wastedDice.forEach((die) => addHistory(`${die} zarı boşa gitti`));

    clearMovePlayed();
  }, [lastMovePlayed, players, soundEnabled, addHistory, clearMovePlayed, playLater, fastMode, reducedMotion, round]);

  // Flaş kısa süre sonra sönsün.
  useEffect(() => {
    if (!moveFlash) return;
    const timer = setTimeout(() => setMoveFlash(null), fastMode ? 450 : 900);
    return () => clearTimeout(timer);
  }, [moveFlash, fastMode]);

  // El sonucu bildirimi.
  useEffect(() => {
    if (!lastRoundEnded) return;
    if (soundEnabled) {
      // İzleyici için her el sonu bir kutlamadır.
      const iWon = spectator || lastRoundEnded.winnerPlayerId === myPlayerId;
      if (iWon && lastRoundEnded.isMars) playMarsFanfare();
      else if (iWon) playWinSound();
      else playLoseSound();
    }
    if (!lastRoundEnded.matchCompleted) {
      const duration = fastMode
        ? lastRoundEnded.isMars
          ? 2400
          : 1700
        : lastRoundEnded.isMars
          ? 4600
          : 3200;
      const timer = setTimeout(() => setRoundEnded(null), duration);
      return () => clearTimeout(timer);
    }
  }, [lastRoundEnded, myPlayerId, soundEnabled, fastMode, setRoundEnded, spectator]);

  // Hamleler bitince zarlar bir süre tahtada kalır, sonra kalkar. Zarlar masaya oturmadan (atış
  // animasyonu sürerken) kaldırılmaz; oturma bildirimi gelmezse güvenlik payıyla yine kaldırılır.
  useEffect(() => {
    if (!hasPendingMoves && displayedDice !== null) {
      const rest = fastMode ? 900 : 1600;
      const timer = setTimeout(() => setDisplayedDice(null), diceSettled ? rest : rest + 2500);
      return () => clearTimeout(timer);
    }
  }, [hasPendingMoves, displayedDice, diceSettled, fastMode, round?.currentPlayerId]);

  /** Zar her sekmesinde: sesi masaya değme anıyla eşzamanlar; çift zarda ilk değmede masa sarsılır. */
  const handleDiceImpact = useCallback(
    ({ strength, first }: DiceImpact) => {
      if (soundEnabled) playDiceImpact(strength);
      if (first && displayedDice && displayedDice[0] === displayedDice[1]) {
        setShakeToken(Date.now());
      }
    },
    [soundEnabled, displayedDice],
  );

  const handleDiceSettled = useCallback(
    ({ isDouble }: { isDouble: boolean }) => {
      setDiceSettled(true);
      if (isDouble && soundEnabled) playDoubleChord();
    },
    [soundEnabled],
  );

  const handleRoll = () => {
    if (!isMyTurn || rollInProgress || iMustMove) return;
    setRollInProgress(true);
    setDisplayedDice(null);
    onRollDice(snapshot.stateVersion);
    if (rollTimeoutRef.current) {
      clearTimeout(rollTimeoutRef.current);
    }
    rollTimeoutRef.current = setTimeout(() => setRollInProgress(false), 4000);
  };

  const handlePickPoint = (pointNumber: number) => {
    if (!iMustMove || moveInProgress) return;
    setMoveInProgressVersion(snapshot.stateVersion);
    onPlayMove(pointNumber, snapshot.stateVersion);
  };

  const scoreLabel = useMemo(() => {
    if (!match) return '';
    return `${match.player1Score} - ${match.player2Score}`;
  }, [match]);

  const winnerPlayer = matchCompleted
    ? players.find((p) => p.id === match?.winnerPlayerId)
    : null;

  const roundWinner = lastRoundEnded
    ? players.find((p) => p.id === lastRoundEnded.winnerPlayerId)
    : null;

  const rematchRequestedByMe = snapshot.rematchRequestedByPlayerId === myPlayerId;
  const rematchRequestedByOpponent =
    snapshot.rematchRequestedByPlayerId !== null && !rematchRequestedByMe;

  const seatOf = (playerId: string | null | undefined) =>
    players.find((p) => p.id === playerId)?.seat ?? 0;

  const showMars = Boolean(
    (lastRoundEnded?.isMars && !lastRoundEnded.matchCompleted) ||
      (matchCompleted && lastMatchEnded?.isMars),
  );
  const marsWon =
    spectator ||
    (lastRoundEnded?.isMars === true
      ? lastRoundEnded.winnerPlayerId === myPlayerId
      : winnerPlayer?.id === myPlayerId);

  const totalRemainingMoves = pendingDice.length + pendingPicks;

  // Zarlar, atan oyuncunun tarafından fırlatılır: benim atışım alttan, rakibinki üstten.
  const throwerId = rollInProgress ? myPlayerId : (rollingPlayerId ?? rollerId);
  // Zarlar boş kanada atılır: yatayda soldaki kanat, dikeyde üstteki kanat.
  const mySide = orientation === 'landscape' ? 'bottom' : 'left';
  const theirSide = orientation === 'landscape' ? 'top' : 'right';
  const diceSide = throwerId !== null && throwerId !== viewerId ? theirSide : mySide;
  const diceZone =
    orientation === 'landscape' ? { cx: 0.24, cy: 0.5, spread: 0.1 } : { cx: 0.5, cy: 0.22 };
  const diceUsed = displayedDice
    ? diceUsage(displayedDice, pendingDice, hasPendingMoves)
    : NOT_USED;

  const currentName = currentPlayer?.displayName ?? 'Oyuncu';
  const statusText = matchCompleted
    ? 'Maç bitti'
    : spectator
      ? hasPendingMoves
        ? `${currentName} hamlesini oynuyor…`
        : `${currentName} zar atıyor…`
      : !isMyTurn && opponent?.isBot
        ? `${opponent.displayName} düşünüyor…`
        : iMustMove
      ? pendingDice.length > 0
        ? `Hanelere dokun: ${[...new Set(pendingDice)].join(' ve ')}`
        : `${pendingPicks} serbest hamle hakkın var`
      : opponentMoving
        ? `${opponent?.displayName} hamlesini oynuyor…`
        : isMyTurn
          ? 'Sıra sende — zar at!'
          : `${opponent?.displayName} zar atıyor…`;

  const showTimer =
    Boolean(snapshot.turnTimeLimitSeconds) &&
    Boolean(round?.turnDeadlineUtc) &&
    round?.status === 'InProgress' &&
    !matchCompleted &&
    currentPlayer !== null &&
    !currentPlayer.isBot;

  const renderSeatCard = (seat: number) => {
    const player = players.find((p) => p.seat === seat);
    return (
      <PlayerCard
        seat={seat}
        name={player?.displayName ?? '—'}
        isConnected={player?.isConnected ?? false}
        isActive={seatOf(round?.currentPlayerId) === seat && !matchCompleted}
        isMe={player?.id === myPlayerId}
        isBot={Boolean(player?.isBot)}
        checkerColor={player?.id === viewerId ? '#8e2f3c' : '#f2e8d2'}
        alignRight={seat === 2}
      />
    );
  };

  // Kontroller tahtanın dışında: telefonda ekranın altına yapışık, masaüstünde tahtanın altında.
  const controlBar = (
    <Panel
      padding="none"
      className="sticky bottom-2 z-30 flex w-full items-center justify-between gap-2 border-line-accent/60 bg-surface-raised/95 px-3 py-2.5 font-ui shadow-plate backdrop-blur md:static md:gap-4 md:px-4"
    >
      {showTimer && round?.turnDeadlineUtc && (
        <TurnTimer
          key={round.turnDeadlineUtc}
          deadlineUtc={round.turnDeadlineUtc}
          serverTimeUtc={snapshot.serverTimeUtc}
          limitSeconds={snapshot.turnTimeLimitSeconds ?? 30}
          isMine={isMyTurn}
          soundEnabled={soundEnabled}
        />
      )}
      {displayedDice && <DiceStatus dice={displayedDice} used={diceUsed} />}
      <div className="min-w-0 flex-1">
        <p className="text-caption font-medium text-fg-primary [overflow-wrap:anywhere] md:text-ui" role="status">
          {statusText}
        </p>
        {totalRemainingMoves > 0 && (
          <p className="mt-0.5 text-micro font-semibold text-fg-accent">Kalan hamle hakkı: {totalRemainingMoves}</p>
        )}
      </div>

      {!matchCompleted && spectator && (
        <Badge tone="accent" icon={<Eye size={13} />} className="shrink-0 font-semibold">
          İzleyici
        </Badge>
      )}
      {!matchCompleted && !spectator && (
        <Button
          onClick={handleRoll}
          disabled={!isMyTurn || rollInProgress || Boolean(rollingPlayerId) || iMustMove}
          size="sm"
          loading={rollInProgress}
          loadingLabel="Atılıyor…"
          icon={<Dices size={18} />}
          aria-label="Zar at"
          className="shrink-0 md:min-h-(--size-button) md:px-6 md:text-body"
        >
          Zar At
        </Button>
      )}
    </Panel>
  );

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Skor çubuğu */}
      {match && (
        <Panel
          as="section"
          aria-label="Skor"
          padding="none"
          className="grid grid-cols-2 items-center gap-1 border-line-accent/50 px-2 py-2 shadow-plate sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:px-4"
        >
          {renderSeatCard(1)}
          {/* Dar ekranda skor üst satıra alınır (yalnızca görsel sıra; DOM sırası kart · skor · kart kalır). */}
          <div className="order-first col-span-2 px-1 text-center sm:order-none sm:col-span-1 md:px-3">
            <p
              className="font-brand text-heading-md leading-none font-semibold text-fg-accent md:text-heading-lg"
              aria-label={`Skor: ${scoreLabel}`}
            >
              {scoreLabel}
            </p>
            <p className="mt-1 text-micro whitespace-nowrap text-fg-secondary">
              {match.bestOf === 1 ? 'Tek el' : `${match.requiredWins} puana`} ·{' '}
              {round ? `${round.roundNumber}. el · Tur ${round.turnNumber}` : 'Maç bitti'}
            </p>
          </div>
          {renderSeatCard(2)}
        </Panel>
      )}

      {/* Rakip bağlantı kesintisi bilgi çubuğu */}
      <AnimatePresence>
        {opponent && !opponent.isConnected && !matchCompleted && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} role="status">
            <Notice icon={<WifiOff size={16} />} className="border-line-accent py-2.5 text-ui-sm">
              <span>
                <strong>{opponent.displayName}</strong> bağlantısı koptu. Odaya yeniden bağlanması bekleniyor…
              </span>
            </Notice>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Başlangıç zarı sonucu */}
      <AnimatePresence>
        {startingRoll && round?.turnNumber === 1 && round.status === 'InProgress' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-control border border-line-accent/60 bg-surface-raised px-4 py-3 text-center font-ui text-ui-sm text-fg-secondary"
            role="status"
          >
            {startingRoll.attempts.map((attempt, index) => (
              <span key={index} className="mx-1 inline-flex items-center gap-1">
                <Die value={attempt.player1Die} size={22} />
                <span className="text-fg-muted">–</span>
                <Die value={attempt.player2Die} size={22} />
                {attempt.isTie && <span className="text-micro text-fg-muted">(eşit, tekrar)</span>}
              </span>
            ))}
            <p className="mt-1 font-medium text-fg-accent">
              {players.find((p) => p.id === startingRoll.startingPlayerId)?.displayName} başlıyor!
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hamle uyarısı: kontrol çubuğu zaten gösteriyor; ekran okuyucular için görünmez duyuru. */}
      {iMustMove && (
        <p role="alert" className="sr-only">
          {pendingDice.length > 0
            ? `Zarını oyna: parlayan ${[...new Set(pendingDice)].join('. ve ')}. haneye dokun.`
            : `Çift bonusu! ${pendingPicks} hamle hakkın kaldı — istediğin parlayan haneye dokun.`}
        </p>
      )}

      {/* Tavla tahtası */}
      {myBoard && opponentBoard && me && opponent && (
        <BackgammonBoard
          myBoard={myBoard}
          opponentBoard={opponentBoard}
          myName={me.displayName}
          opponentName={opponent.displayName}
          isMyTurn={Boolean(isMyTurn) && !matchCompleted}
          clickablePoints={clickablePoints}
          myFlash={moveFlash && moveFlash.playerId === viewerId ? moveFlash : null}
          opponentFlash={moveFlash && moveFlash.playerId !== viewerId ? moveFlash : null}
          shakeToken={shakeToken}
          onPickPoint={handlePickPoint}
          orientation={orientation}
          overlay={
            <DiceArena
              dice={displayedDice}
              rolling={Boolean(rollingPlayerId) || rollInProgress}
              side={diceSide}
              zone={diceZone}
              rollToken={rollToken}
              used={diceUsed}
              onImpact={handleDiceImpact}
              onSettled={handleDiceSettled}
            />
          }
        />
      )}

      {myBoard && opponentBoard && me && opponent && controlBar}

      {/* Tepkiler */}
      {!matchCompleted && !spectator && <ReactionsBar onSend={onSendReaction} />}

      {/* Oyun geçmişi: yalnızca son olay görünür; isteyen genişletir. */}
      <HistoryTicker history={history} />

      {/* MARS kutlaması */}
      <AnimatePresence>{showMars && <MarsCelebration won={marsWon} />}</AnimatePresence>

      {/* El sonucu overlay */}
      <AnimatePresence>
        {lastRoundEnded && !lastRoundEnded.matchCompleted && roundWinner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-surface-overlay/70 p-4"
          >
            <motion.div
              initial={{ scale: 0.85, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              role="alertdialog"
              aria-label="El sonucu"
              className="max-w-full rounded-dialog bg-surface-raised px-6 py-6 text-center font-ui shadow-dialog md:px-8"
            >
              <Trophy size={36} className="mx-auto mb-2 text-fg-accent" aria-hidden="true" />
              <p className="font-brand text-heading-md font-semibold text-fg-primary">
                {lastRoundEnded.roundNumber}. eli {roundWinner.displayName} kazandı!
              </p>
              {lastRoundEnded.isMars && (
                <p className="mt-1 text-body-lg font-bold tracking-wider text-fg-accent">MARS — 2 PUAN! 😂</p>
              )}
              <p className="mt-1 text-ui text-fg-secondary">
                Skor: {lastRoundEnded.player1Score} - {lastRoundEnded.player2Score}
              </p>
              <p className="mt-3 text-caption text-fg-muted">Sonraki el başlıyor…</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Maç sonucu */}
      <AnimatePresence>
        {matchCompleted && winnerPlayer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-surface-overlay/85 p-4"
          >
            <motion.div
              initial={{ scale: 0.85, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              role="dialog"
              aria-label="Maç sonucu"
              className="relative max-h-full w-full max-w-md overflow-hidden overflow-y-auto rounded-dialog bg-surface-raised p-6 text-center font-ui shadow-dialog"
            >
              <Confetti />
              <Trophy size={48} className="mx-auto mb-3 text-fg-accent" aria-hidden="true" />
              <h2 className="font-brand text-heading-md font-semibold text-fg-primary">
                {!spectator && winnerPlayer.id === myPlayerId
                  ? 'Tebrikler, kazandın!'
                  : `${winnerPlayer.displayName} maçı kazandı`}
              </h2>
              {lastMatchEnded?.isMars && (
                <Badge tone="accent" icon={<Sparkles size={14} />} className="mt-1 text-ui-sm font-bold tracking-wider">
                  MARS'LA BİTTİ! (2 Puan)
                </Badge>
              )}
              <p className="mt-2 font-brand text-body-lg font-semibold text-fg-accent">
                Final skor: {match?.player1Score} - {match?.player2Score}
              </p>

              {/* Maç analitiği: şans vs. strateji ve kırılma anı */}
              {loadStats && match && (
                <MatchStatsPanel matchId={match.id} players={players} loadStats={loadStats} />
              )}

              {/* Maç İstatistik Özeti */}
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-control border border-line-subtle bg-surface-input p-3 text-caption">
                <div>
                  <span className="block text-micro uppercase text-fg-muted">Maç No</span>
                  <span className="font-code text-ui-sm font-semibold text-fg-primary">#{match?.matchNumber ?? 1}</span>
                </div>
                <div>
                  <span className="block text-micro uppercase text-fg-muted">Format</span>
                  <span className="font-semibold text-fg-primary">
                    {match?.bestOf === 1 ? 'Tek El' : `${match?.requiredWins} Puana`}
                  </span>
                </div>
                <div>
                  <span className="block text-micro uppercase text-fg-muted">Sonuç</span>
                  <span className="font-semibold text-fg-accent">
                    {lastMatchEnded?.isMars ? 'Mars (2P)' : 'Normal'}
                  </span>
                </div>
              </div>

              <div className="mt-6 space-y-2.5">
                {spectator ? (
                  <Notice role="status">
                    Maçı izlediğin için teşekkürler! Oyuncular rövanşa karar verirse yeni maç burada başlar.
                  </Notice>
                ) : rematchRequestedByOpponent ? (
                  <>
                    <p className="text-ui font-medium text-fg-accent">Rakibin rövanş istiyor!</p>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={onAcceptRematch} className="flex-1">
                        Kabul Et
                      </Button>
                      <Button variant="ghost" onClick={onDeclineRematch} className="min-h-(--size-button) flex-1">
                        Reddet
                      </Button>
                    </div>
                  </>
                ) : rematchRequestedByMe ? (
                  <Notice role="status">
                    {opponent?.isBot
                      ? `${opponent.displayName} rövanşı kabul ediyor…`
                      : 'Rövanş isteği gönderildi, rakip bekleniyor…'}
                  </Notice>
                ) : (
                  <Button variant="primary" fullWidth icon={<RotateCcw size={18} />} onClick={onRequestRematch}>
                    Rövanş İste
                  </Button>
                )}

                <Button
                  variant="ghost"
                  fullWidth
                  icon={<Home size={18} />}
                  className="min-h-(--size-button)"
                  onClick={() => {
                    onLeave();
                    navigate('/');
                  }}
                >
                  Ana Sayfaya Dön
                </Button>
              </div>

              <div className="mt-4">
                <ShareLinkCard roomCode={snapshot.roomCode} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Basit CSS/SVG konfeti — harici görsel kullanılmaz. */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        left: (i * 41) % 100,
        delay: (i % 8) * 0.15,
        color: ['#d4af37', '#8e2f3c', '#cf8f5e', '#f0e6d2'][i % 4],
        rotate: (i * 73) % 360,
      })),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((piece, index) => (
        <motion.span
          key={index}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{ y: 400, opacity: [1, 1, 0], rotate: piece.rotate }}
          transition={{ duration: 2.6, delay: piece.delay, ease: 'easeIn' }}
          className="absolute top-0 block h-2.5 w-1.5"
          style={{ left: `${piece.left}%`, backgroundColor: piece.color }}
        />
      ))}
    </div>
  );
}

function HistoryTicker({ history }: { history: string[] }) {
  const [open, setOpen] = useState(false);
  if (history.length === 0) return null;

  return (
    <section aria-label="Oyun geçmişi" className="px-1 font-ui text-caption text-fg-secondary">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-(--size-touch-min) w-full cursor-pointer items-center gap-2 rounded-control-sm px-2 text-left text-fg-secondary transition-colors duration-(--duration-fast) hover:bg-surface-hover focus-visible:outline-3 focus-visible:outline-line-focus"
      >
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-gold-400" />
        <span className="min-w-0 flex-1 truncate">{history[0]}</span>
        <span className="shrink-0 text-micro uppercase tracking-wider text-fg-muted">
          {open ? 'Gizle' : 'Geçmiş'}
        </span>
      </button>
      {open && (
        <ul className="mt-1 space-y-1 rounded-control border border-line-subtle bg-surface-raised p-2.5">
          {history.slice(1, 6).map((entry, index) => (
            <li key={index} className="opacity-80">
              {entry}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
