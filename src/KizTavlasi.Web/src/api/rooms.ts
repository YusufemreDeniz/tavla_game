import { apiRequest } from './client';
import type {
  BotDifficulty,
  CreateRoomResult,
  JoinRoomResult,
  PublicConfigDto,
  RoomSnapshotDto,
  WatchRoomResult,
} from '../types/game';

export function createRoom(
  displayName: string,
  bestOf: number,
  turnTimeLimitSeconds: number | null = null,
): Promise<CreateRoomResult> {
  return apiRequest('/api/rooms', {
    method: 'POST',
    body: { displayName, bestOf, turnTimeLimitSeconds },
  });
}

/** Yapay zekâya karşı oda: bot misafir koltuğuna oturur, maç lobiden hemen başlatılabilir. */
export function createBotRoom(
  displayName: string,
  bestOf: number,
  difficulty: BotDifficulty,
  turnTimeLimitSeconds: number | null = null,
): Promise<CreateRoomResult> {
  return apiRequest('/api/rooms/bot', {
    method: 'POST',
    body: { displayName, bestOf, difficulty, turnTimeLimitSeconds },
  });
}

/** Dolu odayı salt okunur izlemek için izleyici token'ı alır. */
export function watchRoom(roomCode: string): Promise<WatchRoomResult> {
  return apiRequest(`/api/rooms/${encodeURIComponent(roomCode)}/watch`, { method: 'POST' });
}

export function joinRoom(roomCode: string, displayName: string): Promise<JoinRoomResult> {
  return apiRequest(`/api/rooms/${encodeURIComponent(roomCode)}/join`, {
    method: 'POST',
    body: { displayName },
  });
}

export function getPublicRoomInfo(roomCode: string): Promise<RoomSnapshotDto> {
  return apiRequest(`/api/rooms/${encodeURIComponent(roomCode)}`);
}

export function getRoomState(roomCode: string, token: string): Promise<RoomSnapshotDto> {
  return apiRequest(`/api/rooms/${encodeURIComponent(roomCode)}/state`, { token });
}

export function leaveRoom(roomCode: string, token: string): Promise<void> {
  return apiRequest(`/api/rooms/${encodeURIComponent(roomCode)}/leave`, { method: 'POST', token });
}

export function getPublicConfig(): Promise<PublicConfigDto> {
  return apiRequest('/api/config/public');
}
