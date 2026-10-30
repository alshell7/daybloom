import { describe, expect, it } from 'vitest';
import type { Task } from './engine/types';
import { byQuadrant, isUrgent, parseMatrix, patchFor, quadrantOf } from './matrix';
import { deal, EMPTY_STATS, frame, minutesFor, HOOK_BY_ID, parseCards, recordDeal, recordPass, recordStart, rng, scoreTask, DEFAULT_PICK, type PickContext } from './pick';

const T0 = Date.parse('2026-10-31T09:00:00');
const task = (id: string, p: Partial<Task> = {}): Task => ({
  id, title: id, icon: 'laptop', category: 'focus', date: null, start: null, duration: 30, notes: '', subtasks: [], recurrence: null, completions: [], skips: [], overrides: {}, alerts: [],
  createdAt: T0, updatedAt: T0, list: 'inbox', priority: null, due: null, energy: null, order: 0, doneAt: null, ...p,
}) as Task;
const ctx = (p: Partial<PickContext> = {}): PickContext => ({ now: T0, today: '2026-10-31', freeMin: 45, energy: 2, stats: EMPTY_STATS, ...p });

describe('Eisenhower matrix', () => {
  it('reads urgency from the due date and importance from the priority', () => {
    expect(quadrantOf(task('a', { due: '2026-11-01', priority: 1 }), '2026-10-31')).toBe('do');
    expect(quadrantOf(task('b', { priority: 2 }), '2026-10-31')).toBe('plan');
    expect(quadrantOf(task('c', { due: '2026-10-30' }), '2026-10-31')).toBe('quick');
    expect(quadrantOf(task('d', { due: '2026-11-20', priority: 3 }), '2026-10-31')).toBe('drop');
  });
  it('what you set yourself wins', () => {
    expect(quadrantOf(task('a', { ...patchFor('drop'), due: '2026-10-31', priority: 1 }), '2026-10-31')).toBe('drop');
    expect(isUrgent(task('a', { urgent: true }), '2026-10-31')).toBe(true);
  });
  it('groups the backlog, most pressing first', () => {
    const g = byQuadrant([task('late', { due: '2026-11-02', priority: 1 }), task('soon', { due: '2026-10-31', priority: 1 })], '2026-10-31');
    expect(g.do.map((t) => t.id)).toEqual(['soon', 'late']);
  });
  it('reads an AI answer, keeping only known tasks', () => {
    const r = parseMatrix('ok {"tasks":[{"id":"a","urgent":true,"important":false,"why":"due soon"},{"id":"zz","urgent":true,"important":true}]}', new Set(['a']));
    expect(r).toEqual([{ taskId: 'a', urgent: true, important: false, why: 'due soon' }]);
  });
});

describe('Pick for me', () => {
  it('prefers what is pressing and fits the free time, with honest reasons', () => {
    const s = scoreTask(task('a', { due: '2026-11-01', priority: 1, duration: 30 }), ctx());
    const t = scoreTask(task('b', { duration: 120 }), ctx());
    expect(s.score).toBeGreaterThan(t.score);
    expect(s.reasons.slice(0, 2)).toEqual(['Due tomorrow', 'A must']);
  });
  it('what was just dealt or passed over steps back', () => {
    const fresh = scoreTask(task('a'), ctx()).score;
    expect(scoreTask(task('a'), ctx({ stats: { ...EMPTY_STATS, passed: { a: T0 - 60_000 } } })).score).toBeLessThan(fresh - 1);
  });
  it('deals distinct cards, varied in kind, the same way for the same seed', () => {
    const items = [task('a'), task('b', { category: 'care' }), task('c', { category: 'move' }), task('d'), task('e')];
    const one = deal(items, ctx(), 3, rng(7)).map((x) => x.task.id);
    expect(new Set(one).size).toBe(3);
    expect(deal(items, ctx(), 3, rng(7)).map((x) => x.task.id)).toEqual(one);
    expect(deal(items.slice(0, 2), ctx(), 3, rng(1))).toHaveLength(2);
  });
  it('frames each card differently, and only plainly when playful framings are off', () => {
    const cards = deal([task('a'), task('b'), task('c')], ctx(), 3, rng(3));
    const hooks = frame(cards, ctx(), DEFAULT_PICK, rng(3));
    expect(new Set(hooks).size).toBe(3);
    const calm = frame(cards, ctx(), { ...DEFAULT_PICK, playful: false }, rng(3));
    expect(calm.every((h) => !HOOK_BY_ID[h].playful)).toBe(true);
  });
  it('learns which framings you start', () => {
    let s = recordDeal(EMPTY_STATS, [{ task: task('a'), hook: 'dare' }, { task: task('b'), hook: 'two' }], T0);
    s = recordStart(s, { task: task('a'), hook: 'dare' });
    expect(s.hooks.dare).toEqual([1, 1]);
    expect(s.hooks.two).toEqual([1, 0]);
    expect(s.seen.a).toBe(T0);
    expect(recordPass(s, 'b', T0).passed.b).toBe(T0);
    // Over many deals, a framing that's always started wins most draws.
    let st = EMPTY_STATS;
    for (let i = 0; i < 30; i++) {
      st = recordDeal(st, [{ task: task('x'), hook: 'two' }, { task: task('y'), hook: 'badly' }], T0);
      st = recordStart(st, { task: task('x'), hook: 'two' });
    }
    const r = rng(11);
    let twos = 0;
    for (let i = 0; i < 40; i++) if (frame([scoreTask(task('z'), ctx())], ctx({ stats: st }), DEFAULT_PICK, r)[0] === 'two') twos++;
    expect(twos).toBeGreaterThan(25);
  });
  it('keeps a start within the free time', () => {
    expect(minutesFor(HOOK_BY_ID.dare, task('a'), 6)).toBe(6);
    expect(minutesFor(HOOK_BY_ID.race, task('a', { duration: 60 }), 120)).toBe(40);
  });
  it('drops an AI line that pushes or blames', () => {
    const r = parseCards('{"cards":[{"id":"a","step":"Open the doc","line":"You should finally do this"},{"id":"b","step":"Fill the bottle","line":"A small sip of progress."}]}', new Set(['a', 'b']));
    expect(r).toEqual([{ id: 'a', step: 'Open the doc', line: '' }, { id: 'b', step: 'Fill the bottle', line: 'A small sip of progress.' }]);
  });
});
