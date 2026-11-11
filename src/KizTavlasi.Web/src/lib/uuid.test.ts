import { afterEach, describe, expect, it, vi } from 'vitest';
import { newCommandId } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newCommandId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('güvenli olmayan bağlamda (randomUUID yok) getRandomValues ile geçerli v4 UUID üretir', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });

    const ids = new Set(Array.from({ length: 200 }, () => newCommandId()));

    ids.forEach((id) => expect(id).toMatch(V4));
    expect(ids.size).toBe(200);
  });

  it('randomUUID varsa onu kullanır', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '11111111-1111-4111-8111-111111111111',
      getRandomValues: () => {
        throw new Error('çağrılmamalı');
      },
    });

    expect(newCommandId()).toBe('11111111-1111-4111-8111-111111111111');
  });
});
