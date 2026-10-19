import { describe, expect, it } from 'vitest';
import { MINUTE } from '../../engine/time';
import { durationMs, findOverlaps, matchesTarget, mergeActivity, mergeEntries, overlapping, splitEntry, targetOf, validateSpan } from './entries';
import type { Entry } from './types';

const T0 = Date.UTC(2026, 9, 19, 9, 0);
const e = (id: string, startMin: number, endMin: number | null, extra: Partial<Entry> = {}): Entry => ({
  id,
  startMs: T0 + startMin * MINUTE,
  endMs: endMin == null ? null : T0 + endMin * MINUTE,
  source: 'tracker',
  ...extra,
});

describe('targets', () => {
  it('a task block key also names its task', () => {
    expect(targetOf({ blockKey: 'task:abc@2026-10-19' })).toEqual({ taskId: 'abc', blockKey: 'task:abc@2026-10-19' });
    expect(targetOf({ blockKey: 'cal:acc:ev1' })).toEqual({ blockKey: 'cal:acc:ev1' });
    expect(targetOf({ taskId: 'x', projectId: 'p' })).toEqual({ taskId: 'x', projectId: 'p' });
  });

  it('every field given must match; an empty ref matches anything', () => {
    const x = e('a', 0, 10, { taskId: 't1', blockKey: 'task:t1@2026-10-19', projectId: 'p1' });
    expect(matchesTarget(x, {})).toBe(true);
    expect(matchesTarget(x, { taskId: 't1' })).toBe(true);
    expect(matchesTarget(x, { taskId: 't1', projectId: 'p2' })).toBe(false);
    expect(matchesTarget(x, { blockKey: 'task:t1@2026-10-20' })).toBe(false);
  });
});

describe('overlaps', () => {
  it('touching ends do not overlap; a running entry runs until now', () => {
    const list = [e('a', 0, 30), e('b', 30, 60), e('c', 90, null)];
    expect(overlapping(list, T0 + 60 * MINUTE, T0 + 90 * MINUTE, T0 + 120 * MINUTE)).toEqual([]);
    expect(overlapping(list, T0 + 100 * MINUTE, T0 + 110 * MINUTE, T0 + 120 * MINUTE).map((x) => x.id)).toEqual(['c']);
    // Before the running entry reaches it, a later span is free.
    expect(overlapping(list, T0 + 130 * MINUTE, T0 + 140 * MINUTE, T0 + 120 * MINUTE)).toEqual([]);
  });

  it('finds every overlapping pair with the shared time', () => {
    const list = [e('a', 0, 60), e('b', 30, 45), e('c', 50, 80), e('d', 100, 110)];
    const pairs = findOverlaps(list, T0).map((o) => [o.a.id, o.b.id, o.ms / MINUTE]);
    expect(pairs).toEqual([
      ['a', 'b', 15],
      ['a', 'c', 10],
    ]);
  });

  it('validates a span: end after start, no overlap unless forced', () => {
    const list = [e('a', 0, 60)];
    expect(validateSpan(list, T0, T0, T0)).toMatchObject({ ok: false, error: 'invalid-range' });
    expect(validateSpan(list, T0 + 10, T0, T0)).toMatchObject({ ok: false, error: 'invalid-range' });
    expect(validateSpan(list, NaN, T0, T0)).toMatchObject({ ok: false, error: 'invalid-range' });
    const r = validateSpan(list, T0 + 30 * MINUTE, T0 + 90 * MINUTE, T0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.conflicts.map((x) => x.id)).toEqual(['a']);
    expect(validateSpan(list, T0 + 30 * MINUTE, T0 + 90 * MINUTE, T0, { force: true }).ok).toBe(true);
    expect(validateSpan(list, T0 + 30 * MINUTE, T0 + 90 * MINUTE, T0, { ignore: ['a'] }).ok).toBe(true);
  });
});

describe('split and merge', () => {
  it('splits at a point inside, sharing app and kept idle time by length', () => {
    const x = e('a', 0, 60, {
      taskId: 't',
      note: 'n',
      idle: { ms: 6 * MINUTE, droppedMs: MINUTE },
      activity: [{ app: 'Code', ms: 40 * MINUTE }, { app: 'Safari', ms: 20 * MINUTE }],
    });
    const parts = splitEntry(x, T0 + 15 * MINUTE, T0, 'b')!;
    expect(parts.map((p) => [p.id, (p.startMs - T0) / MINUTE, ((p.endMs as number) - T0) / MINUTE])).toEqual([
      ['a', 0, 15],
      ['b', 15, 60],
    ]);
    expect(parts[0].activity).toEqual([{ app: 'Code', ms: 10 * MINUTE }, { app: 'Safari', ms: 5 * MINUTE }]);
    expect(parts[1].activity).toEqual([{ app: 'Code', ms: 30 * MINUTE }, { app: 'Safari', ms: 15 * MINUTE }]);
    expect(parts[0].idle).toEqual({ ms: 1.5 * MINUTE });
    expect(parts[1].idle).toEqual({ ms: 4.5 * MINUTE, droppedMs: MINUTE });
    expect(parts[1]).toMatchObject({ taskId: 't', note: 'n', source: 'tracker' });
  });

  it('a running entry splits into a finished part and a running part', () => {
    const parts = splitEntry(e('a', 0, null), T0 + 10 * MINUTE, T0 + 30 * MINUTE, 'b')!;
    expect(parts[0].endMs).toBe(T0 + 10 * MINUTE);
    expect(parts[1].endMs).toBeNull();
  });

  it('refuses a split point on or outside the edges', () => {
    const x = e('a', 0, 60);
    expect(splitEntry(x, T0, T0, 'b')).toBeNull();
    expect(splitEntry(x, T0 + 60 * MINUTE, T0, 'b')).toBeNull();
    expect(splitEntry(x, T0 + 61 * MINUTE, T0, 'b')).toBeNull();
  });

  it('merges into one span, joining notes and summing app time', () => {
    const m = mergeEntries([
      e('b', 40, 60, { note: 'two', source: 'manual', activity: [{ app: 'Code', ms: 5 }] }),
      e('a', 0, 30, { taskId: 't', note: 'one', activity: [{ app: 'Code', ms: 10 }, { app: 'Mail', ms: 2 }], idle: { ms: 3 } }),
    ])!;
    expect(m).toMatchObject({ id: 'a', taskId: 't', startMs: T0, endMs: T0 + 60 * MINUTE, note: 'one · two', source: 'manual', idle: { ms: 3 } });
    expect(m.activity).toEqual([{ app: 'Code', ms: 15 }, { app: 'Mail', ms: 2 }]);
    expect(durationMs(m, T0)).toBe(60 * MINUTE);
    expect(mergeEntries([e('a', 0, 1)])).toBeNull();
  });

  it('a merge with a running entry keeps running', () => {
    expect(mergeEntries([e('a', 0, 30), e('b', 40, null)])!.endMs).toBeNull();
  });

  it('merges app time by name, keeping the newest title', () => {
    expect(
      mergeActivity([{ app: 'Code', ms: 10, title: 'a.ts' }], [
        { app: 'Code', ms: 5, title: 'b.ts' },
        { app: 'Slack', ms: 20 },
        { app: 'Code', ms: 1 },
        { app: '', ms: 9 },
        { app: 'X', ms: 0 },
      ]),
    ).toEqual([
      { app: 'Slack', ms: 20 },
      { app: 'Code', ms: 16, title: 'b.ts' },
    ]);
  });
});
