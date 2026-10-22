import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lock } from './lock.svelte';
import { platform } from './platform';

const kept = new Map<string, string>();

beforeEach(() => {
  kept.clear();
  vi.spyOn(platform.secrets, 'get').mockImplementation(async (a) => kept.get(a) ?? null);
  vi.spyOn(platform.secrets, 'set').mockImplementation(async (a, v) => void kept.set(a, v));
  vi.spyOn(platform.secrets, 'delete').mockImplementation(async (a) => void kept.delete(a));
});

describe('app lock', () => {
  it('keeps only a salted hash, opens with the right PIN and counts wrong ones', async () => {
    await lock.setPin('2468');
    expect(lock.on).toBe(true);
    expect(lock.length).toBe(4);
    expect(kept.get('app-lock')).not.toContain('2468');

    lock.lockNow();
    expect(lock.locked).toBe(true);
    expect(await lock.tryPin('1111')).toBe(false);
    expect(lock.misses).toBe(1);
    expect(lock.locked).toBe(true);
    expect(await lock.tryPin('2468')).toBe(true);
    expect(lock.locked).toBe(false);
    expect(lock.misses).toBe(0);
  });

  it('asks for a short wait after five wrong PINs in a row', async () => {
    await lock.setPin('13579');
    lock.lockNow();
    for (let i = 0; i < 5; i++) await lock.tryPin('00000');
    expect(lock.waitUntil).toBeGreaterThan(Date.now());
    // Even the right PIN waits.
    expect(await lock.tryPin('13579')).toBe(false);
  });

  it('refuses a PIN that is too short, and turning off forgets it', async () => {
    await expect(lock.setPin('12')).rejects.toThrow(/4 to 8 digits/);
    await lock.setPin('8642');
    await lock.turnOff();
    expect(lock.on).toBe(false);
    expect(kept.has('app-lock')).toBe(false);
    lock.lockNow();
    expect(lock.locked).toBe(false);
  });
});
