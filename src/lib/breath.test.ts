// The breathing guide's rhythm: box (four equal sides, rest included) and calm (4·4·6·2), from
// Settings; where the breath is at any moment; and a running guide keeping its own rhythm.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { breath, breathAt, describeRhythm, phaseSpans, rhythm, rhythmLength, rhythmOf } from './breath.svelte';
import { DEFAULT_SETTINGS, settings } from './stores/settings.svelte';

describe('rhythm', () => {
  it('box breathing by default: four sides of 4 s, rest included, four rounds', () => {
    const r = rhythmOf(DEFAULT_SETTINGS.breathe);
    expect(r.pattern).toBe('box');
    expect(r.phases.map((p) => [p.id, p.ms])).toEqual([
      ['in', 4000],
      ['hold', 4000],
      ['out', 4000],
      ['rest', 4000],
    ]);
    expect(r.cycleMs).toBe(16_000);
    expect(r.rounds).toBe(4);
    expect(r.totalMs).toBe(64_000);
    expect(rhythmLength(r)).toBe('1 min');
    expect(describeRhythm(r)).toBe('in for 4, hold for 4, out for 4, rest for 4');
  });

  it('box sides follow the seconds setting; calm keeps its long out-breath', () => {
    expect(rhythmOf({ pattern: 'box', seconds: 6, rounds: 5 }).phases.every((p) => p.ms === 6000)).toBe(true);
    expect(rhythmOf({ pattern: 'box', seconds: 6, rounds: 5 }).totalMs).toBe(120_000);
    const calm = rhythmOf({ pattern: 'calm', seconds: 6, rounds: 4 });
    expect(calm.phases.map((p) => p.ms)).toEqual([4000, 4000, 6000, 2000]);
    expect(calm.totalMs).toBe(64_000);
  });

  it('odd values fall back or are kept in range', () => {
    expect(rhythmOf({ seconds: 99 }).phases[0].ms).toBe(6000);
    expect(rhythmOf({ seconds: 1 }).phases[0].ms).toBe(3000);
    expect(rhythmOf({ seconds: Number.NaN, rounds: Number.NaN }).totalMs).toBe(64_000);
    expect(rhythmOf({ pattern: 'square' as never }).pattern).toBe('box');
    expect(rhythmOf({ rounds: 0 }).rounds).toBe(1);
  });

  it('knows where the breath is, rest counting too', () => {
    const r = rhythmOf({ pattern: 'box', seconds: 4, rounds: 2 });
    expect(breathAt(0, r)).toMatchObject({ id: 'in', round: 1, secondsLeft: 4, msLeft: 4000, ms: 4000 });
    expect(breathAt(3999, r)).toMatchObject({ id: 'in', secondsLeft: 1 });
    expect(breathAt(4000, r)).toMatchObject({ id: 'hold', secondsLeft: 4 });
    expect(breathAt(12_500, r)).toMatchObject({ id: 'rest', secondsLeft: 4, word: 'Rest' });
    expect(breathAt(16_000, r)).toMatchObject({ id: 'in', round: 2 });
    expect(breathAt(31_999, r)).toMatchObject({ id: 'rest', round: 2, secondsLeft: 1 });
    expect(breathAt(32_000, r)).toBeNull();
    expect(breathAt(-1, r)).toBeNull();
    const calm = rhythmOf({ pattern: 'calm', rounds: 1 });
    expect(breathAt(8000, calm)).toMatchObject({ id: 'out', secondsLeft: 6 });
    expect(breathAt(14_500, calm)).toMatchObject({ id: 'rest', secondsLeft: 2 });
  });

  it('phase spans cover the cycle in order', () => {
    const s = phaseSpans(rhythmOf({ pattern: 'calm' }));
    expect(s.in).toEqual({ from: 0, to: 0.25 });
    expect(s.hold).toEqual({ from: 0.25, to: 0.5 });
    expect(s.out).toEqual({ from: 0.5, to: 0.875 });
    expect(s.rest).toEqual({ from: 0.875, to: 1 });
  });
});

describe('the live guide', () => {
  const saved = structuredClone(settings.value.breathe);
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    breath.watch(0);
    settings.value.breathe = structuredClone(saved);
    vi.useRealTimers();
  });

  it('follows Settings until a guide starts, then keeps the rhythm it started with', () => {
    settings.value.breathe = { pattern: 'box', seconds: 5, rounds: 3, sound: 'off' };
    expect(breath.rhythm.cycleMs).toBe(20_000);
    expect(rhythm().totalMs).toBe(60_000);
    breath.watch(Date.now());
    expect(breath.state).toMatchObject({ id: 'in', secondsLeft: 5, round: 1 });
    settings.value.breathe = { pattern: 'calm', seconds: 4, rounds: 4, sound: 'off' };
    vi.advanceTimersByTime(5_100);
    expect(breath.state).toMatchObject({ id: 'hold', secondsLeft: 5 });
    expect(breath.rhythm.cycleMs).toBe(20_000);
    vi.advanceTimersByTime(56_000);
    expect(breath.state).toBeNull();
    // Over, it still tells how long it was; unwatched, it follows Settings again.
    expect(breath.rhythm.totalMs).toBe(60_000);
    breath.watch(0);
    expect(breath.rhythm.pattern).toBe('calm');
  });

  it('steps on whole seconds, so the count is never late', () => {
    settings.value.breathe = { pattern: 'box', seconds: 4, rounds: 1, sound: 'off' };
    breath.watch(Date.now());
    vi.advanceTimersByTime(1_020);
    expect(breath.state?.secondsLeft).toBe(3);
    vi.advanceTimersByTime(12_000);
    expect(breath.state).toMatchObject({ id: 'rest', secondsLeft: 3 });
    breath.watch(0);
    expect(breath.state).toBeNull();
  });
});
