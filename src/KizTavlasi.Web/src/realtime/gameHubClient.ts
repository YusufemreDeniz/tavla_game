import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { useGameStore } from '../store/gameStore';
import type {
  DiceRollResultDto,
  MatchEndedDto,
  MovePlayedDto,
  RoomSnapshotDto,
  RoundEndedDto,
  StartingRollDto,
} from '../types/game';

interface EnvelopeBase {
  roomCode: string;
  stateVersion: number;
  serverTimeUtc: string;
}

/**
 * SignalR bağlantı ve event yönetimi tek bu servistedir.
 * React bileşenleri connection.on(...) çağırmaz; store'u okur.
 */
export class GameHubClient {
  private connection: HubConnection | null = null;
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async start(): Promise<void> {
    const store = useGameStore.getState();
    store.setConnectionStatus('connecting');

    this.connection = new HubConnectionBuilder()
      .withUrl('/hubs/game', {
        accessTokenFactory: () => this.token,
      })
      .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 15000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    this.registerHandlers(this.connection);

    this.connection.onreconnecting(() => {
      useGameStore.getState().setConnectionStatus('reconnecting');
    });

    this.connection.onreconnected(() => {
      useGameStore.getState().setConnectionStatus('connected');
      // Reconnect sonrası authoritative snapshot iste.
      void this.connection?.invoke('RejoinRoom');
    });

    this.connection.onclose(() => {
      useGameStore.getState().setConnectionStatus('disconnected');
    });

    await this.connection.start();
    store.setConnectionStatus('connected');
    await this.connection.invoke('JoinRoom');
  }

  private registerHandlers(connection: HubConnection): void {
    const store = () => useGameStore.getState();

    connection.on('RoomSnapshotReceived', (snapshot: RoomSnapshotDto) => {
      store().applyAuthoritativeSnapshot(snapshot);
    });

    connection.on('GameStateUpdated', (snapshot: RoomSnapshotDto) => {
      store().applySnapshot(snapshot);
    });

    connection.on('StartingRollStarted', () => {
      store().setStartingRoll(null);
    });

    connection.on(
      'StartingRollResolved',
      (payload: EnvelopeBase & { startingRoll: StartingRollDto }) => {
        if (payload.stateVersion >= store().stateVersion) {
          store().setStartingRoll(payload.startingRoll);
        }
      },
    );

    connection.on('DiceRollStarted', (payload: { playerId: string }) => {
      store().setRollingPlayer(payload.playerId);
      // Komut sunucuda reddedilirse DiceRollResolved gelmez; animasyon takılı kalmasın.
      window.setTimeout(() => {
        const state = store();
        if (state.rollingPlayerId === payload.playerId) {
          state.setRollingPlayer(null);
        }
      }, 2500);
    });

    connection.on(
      'DiceRollResolved',
      (payload: EnvelopeBase & { roll: DiceRollResultDto }) => {
        const s = store();
        // Animasyon kuyruğuna al; eski roll eventlerini stateVersion ile reddet.
        if (payload.roll.stateVersion >= s.stateVersion) {
          s.setRollingPlayer(null);
          s.setPendingRoll(payload.roll);
        }
      },
    );

    connection.on(
      'MovePlayed',
      (payload: EnvelopeBase & { movePlayed: MovePlayedDto }) => {
        if (payload.movePlayed.stateVersion >= store().stateVersion) {
          store().addMovePlayed(payload.movePlayed);
        }
      },
    );

    connection.on(
      'RoundEnded',
      (payload: EnvelopeBase & { roundEnded: RoundEndedDto }) => {
        if (payload.stateVersion >= store().stateVersion) {
          store().setRoundEnded(payload.roundEnded);
        }
      },
    );

    connection.on(
      'MatchEnded',
      (payload: EnvelopeBase & { matchEnded: MatchEndedDto }) => {
        if (payload.stateVersion >= store().stateVersion) {
          store().setMatchEnded(payload.matchEnded);
        }
      },
    );

    connection.on(
      'ReactionReceived',
      (payload: { fromPlayerId: string; emoji: string }) => {
        store().addReaction(payload.fromPlayerId, payload.emoji);
      },
    );

    connection.on(
      'PlayerConnectionChanged',
      (payload: EnvelopeBase & { playerId: string; isConnected: boolean }) => {
        store().setPlayerConnection(payload.playerId, payload.isConnected, payload.stateVersion);
      },
    );

    connection.on('SpectatorCountChanged', (payload: { roomCode: string; count: number }) => {
      store().setSpectatorCount(payload.count);
    });

    // Snapshot zaten GameStateUpdated ile geliyor; bu eventler ayrıca bir işlem gerektirmiyor.
    connection.on('PlayerJoined', () => {});
    connection.on('PlayerLeft', () => {});
    connection.on('MatchStarted', () => {});
    connection.on('TurnStarted', () => {});
    connection.on('RematchRequested', () => {});
    connection.on('RematchAccepted', () => {
      const s = store();
      s.setMatchEnded(null);
      s.setRoundEnded(null);
      s.setStartingRoll(null);
    });
    connection.on('RematchDeclined', () => {});
  }

  private ensureConnected(): HubConnection {
    if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
      throw new Error('Sunucu bağlantısı yok.');
    }
    return this.connection;
  }

  async refreshState(): Promise<void> {
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      await this.connection.invoke('RejoinRoom');
    }
  }

  startMatch(): Promise<void> {
    return this.ensureConnected().invoke('StartMatch', { commandId: crypto.randomUUID() });
  }

  rollDice(expectedStateVersion: number): Promise<void> {
    return this.ensureConnected().invoke('RollDice', {
      commandId: crypto.randomUUID(),
      expectedStateVersion,
    });
  }

  playMove(pointNumber: number, expectedStateVersion: number): Promise<void> {
    return this.ensureConnected().invoke('PlayMove', {
      pointNumber,
      expectedStateVersion,
      commandId: crypto.randomUUID(),
    });
  }

  requestRematch(): Promise<void> {
    return this.ensureConnected().invoke('RequestRematch');
  }

  acceptRematch(): Promise<void> {
    return this.ensureConnected().invoke('AcceptRematch');
  }

  declineRematch(): Promise<void> {
    return this.ensureConnected().invoke('DeclineRematch');
  }

  sendReaction(emoji: string): Promise<void> {
    return this.ensureConnected().invoke('SendReaction', { emoji });
  }

  async stop(): Promise<void> {
    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
    }
    useGameStore.getState().setConnectionStatus('idle');
  }
}
