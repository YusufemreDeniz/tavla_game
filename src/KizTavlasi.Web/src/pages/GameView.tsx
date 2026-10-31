import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, RotateCcw, Sparkles, Trophy, WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { RoomSnapshotDto } from '../types/game';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import Die from '../components/Die';
import BackgammonBoard, { type PointFlash } from '../components/BackgammonBoard';
import ConnectionDot from '../components/ConnectionDot';
import ShareLinkCard from '../components/ShareLinkCard';
import MarsCelebration from '../components/MarsCelebration';
import { ReactionsBar } from '../components/ReactionsBar';
import {
  playCollectSound,
  playDiceSound,
  playDoubleSound,
  playLoseSound,
  playPieceSound,
  playWinSound,
} from '../lib/sound';

interface GameViewProps {
  snapshot: RoomSnapshotDto;
  onRollDice: (expectedStateVersion: number) => void;
  onPlayMove: (pointNumber: number, expectedStateVersion: number) => void;
  onSendReaction: (emoji: string) => void;
  onRequestRematch: () => void;
  onAcceptRematch: () => void;
  onDeclineRematch: () => void;
  onLeave: () => void;
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
  const fastMode = useUiStore((s) => s.fastMode);

  const [displayedDice, setDisplayedDice] = useState<[number, number] | null>(null);
  const [rollInProgress, setRollInProgress] = useState(false);
  const [moveInProgressVersion, setMoveInProgressVersion] = useState<number | null>(null);
  const [moveFlash, setMoveFlash] = useState<(PointFlash & { playerId: string }) | null>(null);
  const rollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (rollTimeoutRef.current) {
        clearTimeout(rollTimeoutRef.current);
      }
    };
  }, []);

  const match = snapshot.match;
  const round = match?.currentRound ?? null;
  const players = snapshot.players;
  const me = players.find((p) => p.id === myPlayerId) ?? null;
  const opponent = players.find((p) => p.id !== myPlayerId) ?? null;

  const myBoard = round?.boards.find((b) => b.playerId === myPlayerId) ?? null;
  const opponentBoard = round?.boards.find((b) => b.playerId !== myPlayerId) ?? null;

  const isMyTurn = round?.currentPlayerId === myPlayerId && round?.status === 'InProgress';
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

    if (rollTimeoutRef.current) {
      clearTimeout(rollTimeoutRef.current);
      rollTimeoutRef.current = null;
    }

    const roller = players.find((p) => p.id === pendingRoll.playerId);
    const rollerName = roller?.displayName ?? 'Oyuncu';
    setDisplayedDice([pendingRoll.die1, pendingRoll.die2]);
    setRollInProgress(false);

    if (soundEnabled) {
      if (pendingRoll.isDouble) playDoubleSound();
      else playDiceSound();
    }

    addHistory(
      `${rollerName} ${pendingRoll.die1}-${pendingRoll.die2} attı${pendingRoll.isDouble ? ' (çift!)' : ''}`,
    );
    pendingRoll.wastedSteps.forEach((step) => addHistory(`${step.die} zarı boşa gitti`));
    if (pendingRoll.isDouble && pendingRoll.bonusPicksGranted > 0) {
      addHistory(`Çift! Toplam ${pendingRoll.bonusPicksGranted + 1} hamle hakkı`);
    }
    if (pendingRoll.turnWasted) {
      addHistory(`${rollerName} oynayamadı, sıra geçti`);
    }

    setPendingRoll(null);
  }, [pendingRoll, players, soundEnabled, addHistory, setPendingRoll]);

  // Oynanan hamle: ses + geçmiş + hane vurgusu.
  useEffect(() => {
    if (!lastMovePlayed) return;
    const mover = players.find((p) => p.id === lastMovePlayed.playerId);
    const moverName = mover?.displayName ?? 'Oyuncu';

    if (soundEnabled) {
      if (lastMovePlayed.action === 'Collect') playCollectSound();
      else playPieceSound();
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
  }, [lastMovePlayed, players, soundEnabled, addHistory, clearMovePlayed]);

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
      if (lastRoundEnded.winnerPlayerId === myPlayerId) playWinSound();
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
  }, [lastRoundEnded, myPlayerId, soundEnabled, fastMode, setRoundEnded]);

  // Sıra el değiştirince gösterilen zarları temizle.
  useEffect(() => {
    if (!hasPendingMoves && displayedDice !== null) {
      const timer = setTimeout(() => setDisplayedDice(null), fastMode ? 900 : 1600);
      return () => clearTimeout(timer);
    }
  }, [hasPendingMoves, displayedDice, fastMode, round?.currentPlayerId]);

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
    lastRoundEnded?.isMars === true
      ? lastRoundEnded.winnerPlayerId === myPlayerId
      : winnerPlayer?.id === myPlayerId;

  const totalRemainingMoves = pendingDice.length + pendingPicks;

  const statusText = matchCompleted
    ? 'Maç bitti'
    : iMustMove
      ? pendingDice.length > 0
        ? `Hanelere dokun: ${[...new Set(pendingDice)].join(' ve ')}`
        : `${pendingPicks} serbest hamle hakkın var`
      : opponentMoving
        ? `${opponent?.displayName} hamlesini oynuyor…`
        : isMyTurn
          ? 'Sıra sende — zar at!'
          : `${opponent?.displayName} zar atıyor…`;

  const centerContent = (
    <div className="flex w-full items-center justify-between gap-2 md:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-cream-100 md:text-sm" role="status">
          {statusText}
        </p>
        {totalRemainingMoves > 0 && (
          <p className="mt-0.5 text-[10px] font-semibold text-gold-400">
            Kalan hamle hakkı: {totalRemainingMoves}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 md:gap-2.5">
        {rollingPlayerId || rollInProgress ? (
          <>
            <Die value={1} rolling size={42} />
            <Die value={6} rolling size={42} />
          </>
        ) : displayedDice ? (
          <>
            <Die
              value={displayedDice[0]}
              size={42}
              highlight={displayedDice[0] === displayedDice[1]}
            />
            <Die
              value={displayedDice[1]}
              size={42}
              highlight={displayedDice[0] === displayedDice[1]}
            />
          </>
        ) : null}
      </div>

      {!matchCompleted && (
        <button
          type="button"
          onClick={handleRoll}
          disabled={!isMyTurn || rollInProgress || Boolean(rollingPlayerId) || iMustMove}
          aria-label="Zar at"
          className={`min-h-11 shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold shadow-lg transition-all md:px-6 md:text-base ${
            isMyTurn && !rollInProgress && !iMustMove
              ? 'bg-gradient-to-r from-copper-500 via-bordo-600 to-bordo-700 text-cream-50 ring-1 ring-gold-500/40 hover:scale-[1.03]'
              : 'cursor-not-allowed bg-night-900/70 text-cream-400/50'
          }`}
        >
          {rollInProgress ? 'Atılıyor…' : 'Zar At'}
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Skor çubuğu */}
      {match && (
        <section
          aria-label="Skor"
          className="flex items-center justify-between rounded-2xl border border-gold-500/20 bg-gradient-to-b from-night-800 to-night-900 px-3.5 py-3 shadow-lg md:px-5"
        >
          <PlayerScore
            name={players.find((p) => p.seat === 1)?.displayName ?? '—'}
            isConnected={players.find((p) => p.seat === 1)?.isConnected ?? false}
            isTurn={seatOf(round?.currentPlayerId) === 1 && !matchCompleted}
            isMe={players.find((p) => p.seat === 1)?.id === myPlayerId}
          />
          <div className="px-2 text-center">
            <p className="font-display text-2xl font-bold text-gold-400 md:text-3xl" aria-label={`Skor: ${scoreLabel}`}>
              {scoreLabel}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-cream-300">
              {match.bestOf === 1 ? 'Tek el' : `${match.requiredWins} puana`} ·{' '}
              {round ? `${round.roundNumber}. el · Tur ${round.turnNumber}` : 'Maç bitti'}
            </p>
          </div>
          <PlayerScore
            name={players.find((p) => p.seat === 2)?.displayName ?? '—'}
            isConnected={players.find((p) => p.seat === 2)?.isConnected ?? false}
            isTurn={seatOf(round?.currentPlayerId) === 2 && !matchCompleted}
            isMe={players.find((p) => p.seat === 2)?.id === myPlayerId}
            alignRight
          />
        </section>
      )}

      {/* Rakip bağlantı kesintisi bilgi çubuğu */}
      <AnimatePresence>
        {opponent && !opponent.isConnected && !matchCompleted && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            role="status"
            className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/35 bg-amber-950/40 px-4 py-2 text-xs text-amber-200"
          >
            <WifiOff size={14} className="shrink-0 text-amber-400" aria-hidden="true" />
            <span>
              <strong>{opponent.displayName}</strong> bağlantısı koptu. Odaya yeniden bağlanması bekleniyor…
            </span>
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
            className="overflow-hidden rounded-xl border border-gold-500/25 bg-night-800 px-4 py-3 text-center text-sm text-cream-200"
            role="status"
          >
            {startingRoll.attempts.map((attempt, index) => (
              <span key={index} className="mx-1 inline-flex items-center gap-1">
                <Die value={attempt.player1Die} size={22} />
                <span className="text-cream-400">–</span>
                <Die value={attempt.player2Die} size={22} />
                {attempt.isTie && <span className="text-xs text-cream-400">(eşit, tekrar)</span>}
              </span>
            ))}
            <p className="mt-1 font-medium text-gold-400">
              {players.find((p) => p.id === startingRoll.startingPlayerId)?.displayName} başlıyor!
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hamle uyarısı */}
      <AnimatePresence>
        {iMustMove && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            role="alert"
            className="rounded-xl border-2 border-gold-500/70 bg-gradient-to-r from-bordo-700/80 via-bordo-600/70 to-bordo-700/80 px-4 py-3 text-center text-sm font-semibold text-cream-50 shadow-md"
          >
            {pendingDice.length > 0 ? (
              <>
                Zarını oyna: parlayan <span className="text-gold-400">{[...new Set(pendingDice)].join('. ve ')}.</span>{' '}
                haneye dokun.
              </>
            ) : (
              <>
                Çift bonusu! <span className="text-gold-400">{pendingPicks}</span> hamle hakkın kaldı —
                istediğin parlayan haneye dokun.
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tavla tahtası */}
      {myBoard && opponentBoard && me && opponent && (
        <BackgammonBoard
          myBoard={myBoard}
          opponentBoard={opponentBoard}
          myName={me.displayName}
          opponentName={opponent.displayName}
          isMyTurn={Boolean(isMyTurn) && !matchCompleted}
          clickablePoints={clickablePoints}
          myFlash={moveFlash && moveFlash.playerId === myPlayerId ? moveFlash : null}
          opponentFlash={moveFlash && moveFlash.playerId !== myPlayerId ? moveFlash : null}
          onPickPoint={handlePickPoint}
          centerContent={centerContent}
        />
      )}

      {/* Tepkiler */}
      {!matchCompleted && <ReactionsBar onSend={onSendReaction} />}

      {/* Oyun geçmişi */}
      {history.length > 0 && (
        <section
          aria-label="Oyun geçmişi"
          className="rounded-xl border border-gold-500/15 bg-night-800/75 p-3 shadow-inner"
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gold-400/90">
              Son Hamleler
            </span>
            <span className="text-[10px] text-cream-400">Canlı Akış</span>
          </div>
          <ul className="space-y-1 text-xs text-cream-300">
            {history.slice(0, 5).map((entry, index) => (
              <li
                key={index}
                className={`flex items-center gap-2 rounded-md px-2 py-0.5 ${
                  index === 0 ? 'bg-night-700/70 font-medium text-cream-50' : 'opacity-75'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    index === 0 ? 'bg-gold-400' : 'bg-cream-400/50'
                  }`}
                />
                <span>{entry}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* MARS kutlaması */}
      <AnimatePresence>{showMars && <MarsCelebration won={marsWon} />}</AnimatePresence>

      {/* El sonucu overlay */}
      <AnimatePresence>
        {lastRoundEnded && !lastRoundEnded.matchCompleted && roundWinner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-night-950/70 p-4"
          >
            <motion.div
              initial={{ scale: 0.85, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              role="alertdialog"
              aria-label="El sonucu"
              className="rounded-2xl border border-gold-500/30 bg-night-800 px-8 py-6 text-center shadow-2xl"
            >
              <Trophy size={36} className="mx-auto mb-2 text-gold-400" aria-hidden="true" />
              <p className="font-display text-xl font-bold text-cream-50">
                {lastRoundEnded.roundNumber}. eli {roundWinner.displayName} kazandı!
              </p>
              {lastRoundEnded.isMars && (
                <p className="mt-1 text-lg font-black tracking-wider text-gold-400">MARS — 2 PUAN! 😂</p>
              )}
              <p className="mt-1 text-sm text-cream-300">
                Skor: {lastRoundEnded.player1Score} - {lastRoundEnded.player2Score}
              </p>
              <p className="mt-3 text-xs text-cream-400">Sonraki el başlıyor…</p>
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
            className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-night-950/85 p-4"
          >
            <motion.div
              initial={{ scale: 0.85, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              role="dialog"
              aria-label="Maç sonucu"
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gold-500/35 bg-night-800 p-6 text-center shadow-2xl"
            >
              <Confetti />
              <Trophy size={48} className="mx-auto mb-3 text-gold-400" aria-hidden="true" />
              <h2 className="font-display text-2xl font-bold text-cream-50">
                {winnerPlayer.id === myPlayerId ? 'Tebrikler, kazandın!' : `${winnerPlayer.displayName} maçı kazandı`}
              </h2>
              {lastMatchEnded?.isMars && (
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-gold-500/20 px-3 py-1 text-sm font-black tracking-wider text-gold-400">
                  <Sparkles size={14} aria-hidden="true" />
                  MARS'LA BİTTİ! (2 Puan)
                </p>
              )}
              <p className="mt-2 text-lg font-bold text-gold-400">
                Final skor: {match?.player1Score} - {match?.player2Score}
              </p>

              {/* Maç İstatistik Özeti */}
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-night-600 bg-night-900/80 p-3 text-xs">
                <div>
                  <span className="block text-[10px] uppercase text-cream-400">Maç No</span>
                  <span className="font-mono text-sm font-bold text-cream-100">#{match?.matchNumber ?? 1}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-cream-400">Format</span>
                  <span className="font-semibold text-cream-100">
                    {match?.bestOf === 1 ? 'Tek El' : `${match?.requiredWins} Puana`}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-cream-400">Sonuç</span>
                  <span className="font-semibold text-gold-400">
                    {lastMatchEnded?.isMars ? 'Mars (2P)' : 'Normal'}
                  </span>
                </div>
              </div>

              <div className="mt-6 space-y-2.5">
                {rematchRequestedByOpponent ? (
                  <>
                    <p className="text-sm font-medium text-gold-400">Rakibin rövanş istiyor!</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={onAcceptRematch}
                        className="min-h-11 flex-1 rounded-xl bg-bordo-600 px-4 py-3 font-semibold text-cream-50 hover:bg-bordo-500"
                      >
                        Kabul Et
                      </button>
                      <button
                        type="button"
                        onClick={onDeclineRematch}
                        className="min-h-11 flex-1 rounded-xl border border-night-600 px-4 py-3 font-semibold text-cream-300 hover:bg-night-700"
                      >
                        Reddet
                      </button>
                    </div>
                  </>
                ) : rematchRequestedByMe ? (
                  <p className="rounded-xl border border-night-600 px-4 py-3 text-sm text-cream-300" role="status">
                    Rövanş isteği gönderildi, rakip bekleniyor…
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={onRequestRematch}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-bordo-600 to-bordo-700 px-4 py-3 font-semibold text-cream-50 hover:scale-[1.01]"
                  >
                    <RotateCcw size={18} aria-hidden="true" />
                    Rövanş İste
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onLeave();
                    navigate('/');
                  }}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-night-600 px-4 py-3 font-semibold text-cream-300 hover:bg-night-700"
                >
                  <Home size={18} aria-hidden="true" />
                  Ana Sayfaya Dön
                </button>
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

function PlayerScore({
  name,
  isConnected,
  isTurn,
  isMe = false,
  alignRight = false,
}: {
  name: string;
  isConnected: boolean;
  isTurn: boolean;
  isMe?: boolean;
  alignRight?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${alignRight ? 'items-end text-right' : 'items-start'}`}>
      <span className={`flex items-center gap-1.5 text-sm font-semibold ${isTurn ? 'text-gold-400' : 'text-cream-100'}`}>
        {isTurn && <span className="anim-turn-dot inline-block h-2 w-2 rounded-full bg-gold-400" aria-hidden="true" />}
        <span className="truncate">{name}</span>
        {isMe && <span className="text-[10px] font-normal text-cream-400">(sen)</span>}
      </span>
      <ConnectionDot isConnected={isConnected} />
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
