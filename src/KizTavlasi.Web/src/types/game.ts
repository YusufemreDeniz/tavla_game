export interface PlayerDto {
  id: string;
  displayName: string;
  seat: number;
  isConnected: boolean;
  isHost: boolean;
  /** Sunucu tarafında oynayan yapay zekâ rakibi. */
  isBot?: boolean;
}

export interface PointStateDto {
  pointNumber: number;
  backCount: number;
  frontCount: number;
}

export interface PlayerBoardDto {
  playerId: string;
  seat: number;
  points: PointStateDto[];
  collectedCount: number;
  isCollecting: boolean;
}

export interface RoundDto {
  id: string;
  roundNumber: number;
  status: 'NotStarted' | 'InProgress' | 'Completed';
  startingPlayerId: string | null;
  currentPlayerId: string | null;
  winnerPlayerId: string | null;
  turnNumber: number;
  pendingDice: number[];
  pendingBonusPicks: number;
  boards: PlayerBoardDto[];
  /** Sunucunun sıradaki oyuncu adına hareket edeceği an (bot / hamle süresi). */
  turnDeadlineUtc?: string | null;
}

export interface MatchDto {
  id: string;
  matchNumber: number;
  bestOf: number;
  requiredWins: number;
  status: 'NotStarted' | 'StartingRoll' | 'InProgress' | 'Completed';
  player1Score: number;
  player2Score: number;
  winnerPlayerId: string | null;
  currentRound: RoundDto | null;
}

export type RoomStatus = 'Waiting' | 'InLobby' | 'Playing' | 'Completed' | 'Expired' | 'Abandoned';

export interface RoomSnapshotDto {
  roomCode: string;
  status: RoomStatus;
  bestOf: number;
  hostPlayerId: string | null;
  players: PlayerDto[];
  match: MatchDto | null;
  rematchRequestedByPlayerId: string | null;
  stateVersion: number;
  serverTimeUtc: string;
  /** Opsiyonel hamle süresi (saniye); null = süresiz. */
  turnTimeLimitSeconds?: number | null;
}

export interface CreateRoomResult {
  roomCode: string;
  sharePath: string;
  playerToken: string;
  player: PlayerDto;
  roomState: RoomSnapshotDto;
}

export interface WatchRoomResult {
  roomCode: string;
  spectatorToken: string;
  roomState: RoomSnapshotDto;
}

export type BotDifficulty = 'Easy' | 'Master';

export interface JoinRoomResult {
  roomCode: string;
  playerToken: string;
  player: PlayerDto;
  roomState: RoomSnapshotDto;
}

export interface PointSnapshotDto {
  back: number;
  front: number;
  collected: number;
}

export type DiceStepAction = 'Advance' | 'Collect' | 'CollectAll' | 'Wasted';

export interface DiceStepDto {
  die: number;
  sourcePoint: number | null;
  action: DiceStepAction;
  collectedPieces: number;
  before: PointSnapshotDto;
  after: PointSnapshotDto;
}

export interface DiceRollResultDto {
  playerId: string;
  die1: number;
  die2: number;
  isDouble: boolean;
  wastedSteps: DiceStepDto[];
  playableDice: number[];
  bonusPicksGranted: number;
  turnWasted: boolean;
  stateVersion: number;
}

export interface MovePlayedDto {
  playerId: string;
  pointNumber: number;
  action: 'Advance' | 'Collect';
  remainingDice: number[];
  remainingBonusPicks: number;
  wastedDice: number[];
  roundCompleted: boolean;
  stateVersion: number;
}

export interface StartingRollAttemptDto {
  player1Die: number;
  player2Die: number;
  isTie: boolean;
}

export interface StartingRollDto {
  attempts: StartingRollAttemptDto[];
  startingPlayerId: string;
  startingSeat: number;
}

export interface RoundEndedDto {
  winnerPlayerId: string;
  roundNumber: number;
  player1Score: number;
  player2Score: number;
  pointsAwarded: number;
  isMars: boolean;
  matchCompleted: boolean;
}

export interface MatchEndedDto {
  winnerPlayerId: string;
  player1Score: number;
  player2Score: number;
  isMars: boolean;
}

export interface PlayerMatchStatsDto {
  playerId: string;
  rolls: number;
  /** Atış başına ortalama zar toplamı. */
  averageRoll: number;
  doubles: number;
  longestDoubleStreak: number;
  wastedDice: number;
  /** Son elde indirmeyi tamamladığı kendi zar atışı. */
  lastBringDownTurn: number | null;
  averageBringDownTurn: number | null;
  marsWins: number;
  points: number;
}

export interface MatchHighlightDto {
  kind: 'Mars' | 'PhaseShift' | 'DoubleStreak' | 'BigDouble' | 'FastBringDown';
  playerId: string | null;
  roundNumber: number;
  text: string;
}

export interface MatchStatsDto {
  matchId: string;
  roundsPlayed: number;
  totalRolls: number;
  players: PlayerMatchStatsDto[];
  highlight: MatchHighlightDto | null;
}

export interface PublicConfigDto {
  productName: string;
  supportedBestOf: number[];
  allowedReactions: string[];
  supportedTurnTimeLimits?: number[];
}

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

/** Backend ProblemDetails errorCode değerleri. */
export type GameErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_EXPIRED'
  | 'PLAYER_NOT_IN_ROOM'
  | 'INVALID_SESSION'
  | 'MATCH_ALREADY_STARTED'
  | 'MATCH_NOT_ACTIVE'
  | 'NOT_YOUR_TURN'
  | 'ROLL_ALREADY_IN_PROGRESS'
  | 'STALE_STATE'
  | 'INVALID_COMMAND'
  | 'REMATCH_NOT_AVAILABLE'
  | 'ROUND_ALREADY_COMPLETED'
  | 'NOT_HOST'
  | 'SPECTATOR_READ_ONLY';
