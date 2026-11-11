import { describe, expect, it } from 'vitest';
import { diceUsage } from './diceUsage';

describe('diceUsage', () => {
  it('bekleyen zarlar oynanmadıkça ikisi de canlıdır', () => {
    expect(diceUsage([3, 5], [3, 5], true)).toEqual([false, false]);
  });

  it('oynanan zar kullanılmış sayılır, diğeri canlı kalır', () => {
    expect(diceUsage([3, 5], [5], true)).toEqual([true, false]);
    expect(diceUsage([3, 5], [3], true)).toEqual([false, true]);
  });

  it('boşa giden zar da (bekleyenlerde yoksa) soluklaşır; tur boşa giderse ikisi de', () => {
    expect(diceUsage([2, 6], [6], true)).toEqual([true, false]);
    expect(diceUsage([2, 6], [], false)).toEqual([true, true]);
  });

  it('çift zarda hak ve hamle bitene kadar iki zar da canlı, sonra ikisi birden soluklaşır', () => {
    expect(diceUsage([4, 4], [], true)).toEqual([false, false]);
    expect(diceUsage([4, 4], [4], true)).toEqual([false, false]);
    expect(diceUsage([4, 4], [], false)).toEqual([true, true]);
  });
});
