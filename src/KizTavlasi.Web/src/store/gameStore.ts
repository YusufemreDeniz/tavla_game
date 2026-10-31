import { create } from 'zustand';
import type {
  ConnectionStatus,
  DiceRollResultDto,
  MatchEndedDto,
  MovePlayedDto,
  RoomSnapshotDto,
  RoundEndedDto,
  StartingRollDto,
} from '../types/game';

export interface ReactionEvent {
  id: number;
  fromPlayerId: string;
  emoji: string;
}

interface GameStoreState {
  snapshot: RoomSnapshotDto | null;
  stateVersion: number;
  connectionStatus: ConnectionStatus;
  myPlayerId: string | null;

  /** Animasyon için sıradaki zar sonucu; animasyon bitince temizlenir. */
  pendingRoll: DiceRollResultDto | null;
  lastMovePlayed: MovePlayedDto | null;
  rollingPlayerId: string | null;
  startingRoll: StartingRollDto | null;
  lastRoundEnded: RoundEndedDto | null;
  lastMatchEnded: MatchEndedDto | null;
  reactions: ReactionEvent[];
  history: string[];

  setMyPlayerId: (id: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  applySnapshot: (snapshot: RoomSnapshotDto) => void;
  applyAuthoritativeSnapshot: (snapshot: RoomSnapshotDto) => void;
  setPlayerConnection: (playerId: string, isConnected: boolean, stateVersion?: number) => void;
  setRollingPlayer: (playerId: string | null) => void;
  setPendingRoll: (roll: DiceRollResultDto | null) => void;
  addMovePlayed: (move: MovePlayedDto) => void;
  clearMovePlayed: () => void;
  setStartingRoll: (roll: StartingRollDto | null) => void;
  setRoundEnded: (round: RoundEndedDto | null) => void;
  setMatchEnded: (match: MatchEndedDto | null) => void;
  addReaction: (fromPlayerId: string, emoji: string) => void;
  removeReaction: (id: number) => void;
  addHistory: (entry: string) => void;
  reset: () => void;
}

let reactionCounter = 0;

export const useGameStore = create<GameStoreState>((set, get) => ({
  snapshot: null,
  stateVersion: 0,
  connectionStatus: 'idle',
  myPlayerId: null,
  pendingRoll: null,
  lastMovePlayed: null,
  rollingPlayerId: null,
  startingRoll: null,
  lastRoundEnded: null,
  lastMatchEnded: null,
  reactions: [],
  history: [],

  setMyPlayerId: (id) => set({ myPlayerId: id }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  applySnapshot: (snapshot) => {
    // Eski veya aynı versiyonlu GameStateUpdated eventlerini reddet: stateVersion geriye gidemez.
    if (snapshot.stateVersion <= get().stateVersion && get().snapshot !== null) {
      return;
    }
    set({ snapshot, stateVersion: snapshot.stateVersion });
  },

  applyAuthoritativeSnapshot: (snapshot) => {
    // JoinRoom / RejoinRoom yanıtları: daha eski değilse (>=) tam durumu günceller.
    if (snapshot.stateVersion < get().stateVersion && get().snapshot !== null) {
      return;
    }
    set({ snapshot, stateVersion: snapshot.stateVersion });
  },

  setPlayerConnection: (playerId, isConnected, eventStateVersion) =>
    set((state) => {
      if (!state.snapshot) return state;
      if (eventStateVersion !== undefined && eventStateVersion < state.stateVersion) {
        return state;
      }
      return {
        snapshot: {
          ...state.snapshot,
          players: state.snapshot.players.map((p) =>
            p.id === playerId ? { ...p, isConnected } : p,
          ),
        },
      };
    }),

  setRollingPlayer: (playerId) => set({ rollingPlayerId: playerId }),
  setPendingRoll: (roll) => set({ pendingRoll: roll }),
  addMovePlayed: (move) => set({ lastMovePlayed: move }),
  clearMovePlayed: () => set({ lastMovePlayed: null }),
  setStartingRoll: (roll) => set({ startingRoll: roll }),
  setRoundEnded: (round) => set({ lastRoundEnded: round }),
  setMatchEnded: (match) => set({ lastMatchEnded: match }),

  addReaction: (fromPlayerId, emoji) => {
    const id = ++reactionCounter;
    set((state) => ({ reactions: [...state.reactions, { id, fromPlayerId, emoji }] }));
  },
  removeReaction: (id) =>
    set((state) => ({ reactions: state.reactions.filter((r) => r.id !== id) })),

  addHistory: (entry) =>
    set((state) => ({ history: [entry, ...state.history].slice(0, 8) })),

  reset: () =>
    set({
      snapshot: null,
      stateVersion: 0,
      connectionStatus: 'idle',
      pendingRoll: null,
      lastMovePlayed: null,
      rollingPlayerId: null,
      startingRoll: null,
      lastRoundEnded: null,
      lastMatchEnded: null,
      reactions: [],
      history: [],
    }),
}));
