import { describe, expect, it } from 'vitest';
import { MINUTE } from '../engine/time';
import { timer, timerFile } from './timer.svelte';

describe('focus sessions', () => {
  it('one stretch is a single focus segment for the target', () => {
    timer.startSession({ minutes: 40, rhythm: 'single', label: 'Draft', icon: 'laptop', category: 'focus', target: { key: 'k1', taskId: 't1' } });
    const a = timerFile.value.active!;
    expect(a.kind).toBe('countdown');
    expect(a.segments).toEqual([{ kind: 'focus', label: 'Draft', ms: 40 * MINUTE }]);
    expect(a.target).toEqual({ key: 'k1', taskId: 't1' });
    timer.stop();
  });

  it('cycles alternate focus and breaks and end on focus', () => {
    timer.startSession({ minutes: 25, rhythm: 'cycles', label: 'Write', icon: 'pen', category: 'focus', cycles: { short: 5, long: 15, rounds: 4 } });
    const a = timerFile.value.active!;
    expect(a.kind).toBe('cycles');
    expect(a.segments.map((s) => s.kind)).toEqual(['focus', 'break', 'focus', 'break', 'focus', 'break', 'focus']);
    expect(a.segments.filter((s) => s.kind === 'break').map((s) => s.ms / MINUTE)).toEqual([5, 5, 5]);
    expect(Math.ceil(a.segments.length / 2)).toBe(4);
    timer.stop();
  });

  it('every fourth break is the long one when there are more rounds', () => {
    timer.startSession({ minutes: 25, rhythm: 'cycles', label: 'Write', icon: 'pen', category: 'focus', cycles: { short: 5, long: 15, rounds: 6 } });
    const breaks = timerFile.value.active!.segments.filter((s) => s.kind === 'break');
    expect(breaks.map((s) => s.ms / MINUTE)).toEqual([5, 5, 5, 15, 5]);
    timer.stop();
  });
});
