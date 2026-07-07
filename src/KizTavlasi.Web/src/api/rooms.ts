import { apiRequest } from './client';
import type {
  CreateRoomResult,
  JoinRoomResult,
  PublicConfigDto,
  RoomSnapshotDto,
} from '../types/game';

export function createRoom(displayName: string, bestOf: number): Promise<CreateRoomResult> {
  return apiRequest('/api/rooms', { method: 'POST', body: { displayName, bestOf } });
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
