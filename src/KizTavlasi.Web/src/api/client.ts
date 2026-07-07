import type { GameErrorCode } from '../types/game';

export class ApiError extends Error {
  readonly status: number;
  readonly errorCode: GameErrorCode | null;

  constructor(status: number, message: string, errorCode: GameErrorCode | null) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string | null;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.', null);
  }

  if (!response.ok) {
    let message = 'Beklenmeyen bir hata oluştu.';
    let errorCode: GameErrorCode | null = null;
    try {
      const problem = await response.json();
      if (typeof problem.title === 'string') message = problem.title;
      if (typeof problem.errorCode === 'string') errorCode = problem.errorCode as GameErrorCode;
    } catch {
      if (response.status === 429) message = 'Çok fazla istek gönderildi. Lütfen biraz bekleyin.';
    }
    throw new ApiError(response.status, message, errorCode);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
