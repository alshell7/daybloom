import { describe, expect, it } from 'vitest';
import { migrateAlef } from '../addons/alef/alef.svelte';
import { migrateLandings } from '../addons/landings/pad.svelte';
import { migrateRetro } from '../addons/retro/retro.svelte';
import { DEFAULT_AI, migrateAi } from '../ai/hub.svelte';
import { applySharedAlef, mergeAiFiles, mergeAlefFiles, mergeKeyed, mergeLandingsFiles, mergeRecords, mergeRetroFiles, pickSharedAlef, pickSharedLandings } from './extra';

const rec = (id: string, v: number, at = v) => ({ id, v, at });

describe('mergeRecords', () => {
  it('keeps additions from both sides and edits from the side that made them', () => {
    const base = [rec('a', 1), rec('b', 1)];
    const local = [rec('a', 2), rec('b', 1), rec('c', 1)];
    const remote = [rec('a', 1), rec('b', 5), rec('d', 1)];
    expect(mergeRecords(base, local, remote, (x) => x.id, (x) => x.at).map((x) => `${x.id}${x.v}`).sort()).toEqual(['a2', 'b5', 'c1', 'd1']);
  });

  it('a removal holds unless the other side edited the record', () => {
    const base = [rec('a', 1), rec('b', 1)];
    const local = [rec('b', 1)]; // removed a here
    const remote = [rec('a', 1), rec('b', 2)];
    expect(mergeRecords(base, local, remote, (x) => x.id).map((x) => x.id)).toEqual(['b']);
    const edited = [rec('a', 9), rec('b', 1)]; // edited a there
    expect(mergeRecords(base, local, edited, (x) => x.id).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('both changed one record: the newer stamp wins', () => {
    expect(mergeRecords([rec('a', 1, 1)], [rec('a', 2, 5)], [rec('a', 3, 9)], (x) => x.id, (x) => x.at)[0].v).toBe(3);
    expect(mergeKeyed({ k: { at: 1 } }, { k: { at: 7 } }, { k: { at: 3 } }, (v) => v.at).k.at).toBe(7);
  });
});

describe('addon files', () => {
  it('Alef: days and words from both, highest counts, volume stays per device', () => {
    const a = migrateAlef({ met: '2026-10-01', bond: { days: ['2026-10-01', '2026-10-02'], pets: 4, chats: 2 }, recent: [{ who: 'you', text: 'hi', at: 1 }], settings: { volume: 0.2 } });
    const b = migrateAlef({ met: '2026-09-30', bond: { days: ['2026-10-02', '2026-10-03'], pets: 1, chats: 7 }, recent: [{ who: 'alef', text: 'hello!', at: 2 }], settings: { volume: 0.9, you: { name: 'Sam' } } });
    const merged = mergeAlefFiles(null, pickSharedAlef(a), pickSharedAlef(b));
    expect(merged.met).toBe('2026-09-30');
    expect(merged.bond).toMatchObject({ days: ['2026-10-01', '2026-10-02', '2026-10-03'], pets: 4, chats: 7 });
    expect(merged.recent?.map((m) => m.text)).toEqual(['hi', 'hello!']);
    expect(applySharedAlef(a, merged).settings.volume).toBe(0.2);
    expect(applySharedAlef(a, merged).settings.you.name).toBe('Sam');
  });

  it('Retro: journals join, notes merge per period', () => {
    const base = migrateRetro({ notes: { w1: { keep: 'walks', change: '', try: '' } } });
    const l = migrateRetro({ journal: [{ at: 1, taskId: 't', title: 'x', kind: 'moved' }], notes: { w1: { keep: 'walks', change: 'less email', try: '' } } });
    const r = migrateRetro({ journal: [{ at: 2, taskId: 'u', title: 'y', kind: 'dropped' }], notes: { w1: { keep: 'walks', change: '', try: 'mornings' } } });
    const m = mergeRetroFiles(base, l, r);
    expect(m.journal.map((j) => j.taskId)).toEqual(['t', 'u']);
    expect(m.notes.w1).toEqual({ keep: 'walks', change: 'less email', try: 'mornings' });
  });

  it('Landings: logs join; recent stones stay local', () => {
    const l = migrateLandings({ log: [{ at: 1, run: 1, stone: null }], recent: ['water'] });
    const r = migrateLandings({ log: [{ at: 2, run: 1, stone: 'step' }] });
    const m = mergeLandingsFiles(null, pickSharedLandings(l), pickSharedLandings(r));
    expect(m.log.map((x) => x.at)).toEqual([1, 2]);
    expect('recent' in m).toBe(false);
  });

  it('AI setup: a route changed on one device wins over defaults', () => {
    const base = migrateAi(DEFAULT_AI);
    const local = migrateAi(DEFAULT_AI);
    const remote = structuredClone(base);
    (remote.use.smaller.think as any) = { via: 'service', service: 'openai', model: 'gpt-test' };
    const m = mergeAiFiles(base, local, remote);
    expect(m.use.smaller.think).toEqual(remote.use.smaller.think);
  });
});
