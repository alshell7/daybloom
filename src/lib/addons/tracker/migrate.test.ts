import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, migrateTrackerFile, normalizeEntry } from './migrate';

describe('migrate', () => {
  it('turns anything unreadable into the default file', () => {
    for (const raw of [null, undefined, 42, 'x', [], true, { entries: 'nope', settings: 7 }]) {
      expect(migrateTrackerFile(raw)).toEqual({ version: 1, entries: [], settings: DEFAULT_SETTINGS });
    }
  });

  it('keeps good entries, drops broken ones, and sorts by start', () => {
    const f = migrateTrackerFile({
      version: 1,
      entries: [
        { id: 'b', startMs: 2000, endMs: 3000, source: 'tracker', taskId: 't', note: '  ' },
        { id: 'a', startMs: 1000, endMs: 1500, source: 'weird', projectId: 'p', blockKey: '' },
        { id: 'c', startMs: 4000, endMs: 3999 }, // ends before it starts
        { id: 'd', startMs: 'soon', endMs: 5000 },
        { id: 'e', startMs: -5, endMs: 10 },
        null,
        'junk',
        { id: 'f', startMs: Infinity, endMs: null },
      ],
    });
    expect(f.entries).toEqual([
      { id: 'a', startMs: 1000, endMs: 1500, source: 'manual', projectId: 'p' },
      { id: 'b', startMs: 2000, endMs: 3000, source: 'tracker', taskId: 't' },
    ]);
  });

  it('keeps one running entry: older ones end where the next begins', () => {
    const f = migrateTrackerFile({
      entries: [
        { id: 'a', startMs: 1000, endMs: null, source: 'tracker' },
        { id: 'b', startMs: 2000, endMs: 2500, source: 'tracker' },
        { id: 'c', startMs: 3000, endMs: 'later', source: 'tracker' },
      ],
    });
    expect(f.entries.map((e) => [e.id, e.endMs])).toEqual([
      ['a', 2000],
      ['b', 2500],
      ['c', null],
    ]);
  });

  it('gives missing or duplicate ids fresh ones', () => {
    const f = migrateTrackerFile({
      entries: [
        { id: 'x', startMs: 1000, endMs: 2000 },
        { id: 'x', startMs: 3000, endMs: 4000 },
        { startMs: 5000, endMs: 6000 },
      ],
    });
    const ids = f.entries.map((e) => e.id);
    expect(ids[0]).toBe('x');
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
  });

  it('cleans idle and activity notes, merging apps by name', () => {
    const e = normalizeEntry({
      id: 'a',
      startMs: 1000,
      endMs: 9000,
      source: 'focus',
      idle: { ms: -3, droppedMs: 400 },
      activity: [{ app: 'Code', ms: 100 }, { app: 'Code', ms: 50, title: 'x.ts' }, { app: '', ms: 5 }, { app: 'Mail', ms: 'lots' }, 'bad'],
    })!;
    expect(e.idle).toEqual({ ms: 0, droppedMs: 400 });
    expect(e.activity).toEqual([{ app: 'Code', ms: 150, title: 'x.ts' }]);
    expect(normalizeEntry({ id: 'b', startMs: 1, endMs: 2, idle: { ms: 0 }, activity: [] })).toEqual({ id: 'b', startMs: 1, endMs: 2, source: 'manual' });
  });

  it('validates every setting and fills in what is missing', () => {
    const f = migrateTrackerFile({ settings: { idleMinutes: 0.2, askOnIdle: 'yes', trackApps: true, roundTo: 7, dailyGoalMinutes: 99_999, extra: 1 } });
    expect(f.settings).toEqual({ ...DEFAULT_SETTINGS, idleMinutes: 1, trackApps: true, dailyGoalMinutes: 1440 });
    expect(migrateTrackerFile({ settings: { idleMinutes: 'ten', roundTo: 6 } }).settings).toEqual({ ...DEFAULT_SETTINGS, roundTo: 6 });
  });

  it('is stable: migrating twice changes nothing, and it survives JSON', () => {
    const once = migrateTrackerFile({
      entries: [
        { id: 'a', startMs: 1000, endMs: 2000, source: 'tracker', activity: [{ app: 'A', ms: 3 }], idle: { ms: 4 } },
        { id: 'b', startMs: 3000, endMs: null, source: 'focus', blockKey: 'task:t@2026-10-19', taskId: 't' },
      ],
      settings: { trackTitles: true },
    });
    expect(migrateTrackerFile(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});
