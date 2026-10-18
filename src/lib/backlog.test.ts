import { describe, expect, it } from 'vitest';
import {
  ageLabel,
  counts,
  dayWindow,
  dueNow,
  dueState,
  filterItems,
  freeTime,
  itemsIn,
  listOf,
  nextDuration,
  nextLevel,
  parseCapture,
  parseCaptureLine,
  planDay,
  planOrder,
  reorderIds,
  sortItems,
  type Span,
} from './backlog';
import { addDays, atMinutes, DAY, MINUTE } from './engine/time';
import type { Task } from './engine/types';

// Monday 2026-10-19, 10:40 in whatever zone the tests run in.
const TODAY = '2026-10-19';
const at = (h: number, m = 0, date = TODAY) => atMinutes(date, h * 60 + m);
const NOW = at(10, 40);
const hm = (ms: number) => {
  const d = Math.round((ms - atMinutes(TODAY, 0)) / MINUTE);
  return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
};

let n = 0;
function task(p: Partial<Task>): Task {
  n++;
  return {
    id: p.id ?? `t${n}`,
    title: p.title ?? `Task ${n}`,
    icon: 'laptop',
    category: 'focus',
    date: null,
    start: null,
    duration: 30,
    notes: '',
    subtasks: [],
    recurrence: null,
    completions: [],
    skips: [],
    overrides: {},
    alerts: [],
    createdAt: NOW - n * MINUTE,
    updatedAt: NOW,
    list: 'inbox',
    priority: null,
    due: null,
    energy: null,
    order: n,
    doneAt: null,
    ...p,
  };
}
const busy = (h1: number, m1: number, h2: number, m2: number): Span => ({ startMs: at(h1, m1), endMs: at(h2, m2) });
const ids = (ts: { id?: string; taskId?: string }[]) => ts.map((t) => t.taskId ?? t.id);

// ── Lists ─────────────────────────────────────────────────────────────────────

describe('lists', () => {
  const all = [
    task({ id: 'a' }),
    task({ id: 'b', list: undefined }),
    task({ id: 'c', list: 'next' }),
    task({ id: 'd', list: 'someday' }),
    task({ id: 'e', list: 'next', doneAt: NOW }),
    task({ id: 'f', date: TODAY, start: 600 }),
  ];

  it('undated tasks without a list are Inbox; finished ones are Done; dated ones are not in the backlog', () => {
    expect(listOf(all[1])).toBe('inbox');
    expect(listOf(all[4])).toBe('done');
    expect(ids(itemsIn(all, 'inbox'))).toEqual(['a', 'b']);
    expect(counts(all)).toEqual({ inbox: 2, next: 1, someday: 1, done: 1 });
  });

  it('dueNow finds open items due today or earlier', () => {
    const ts = [task({ id: 'x', due: TODAY }), task({ id: 'y', due: addDays(TODAY, -2) }), task({ id: 'z', due: addDays(TODAY, 1) }), task({ id: 'w', due: TODAY, doneAt: NOW })];
    expect(ids(dueNow(ts, TODAY))).toEqual(['x', 'y']);
  });
});

// ── Sorting ───────────────────────────────────────────────────────────────────

describe('sortItems', () => {
  const a = task({ id: 'a', order: 3, priority: 3, due: '2026-10-25', duration: 60, createdAt: 5 });
  const b = task({ id: 'b', order: 1, priority: null, due: null, duration: 15, createdAt: 9 });
  const c = task({ id: 'c', order: 2, priority: 1, due: '2026-10-21', duration: 45, createdAt: 1 });
  const d = task({ id: 'd', order: 4, priority: 1, due: '2026-10-20', duration: 30, createdAt: 3 });
  const xs = [a, b, c, d];

  it('manual follows `order`', () => expect(ids(sortItems(xs, 'manual'))).toEqual(['b', 'c', 'a', 'd']));
  it('priority: must first, ties by due date, unset last', () => expect(ids(sortItems(xs, 'priority'))).toEqual(['d', 'c', 'a', 'b']));
  it('due: soonest first, no due last', () => expect(ids(sortItems(xs, 'due'))).toEqual(['d', 'c', 'a', 'b']));
  it('shortest first', () => expect(ids(sortItems(xs, 'shortest'))).toEqual(['b', 'd', 'c', 'a']));
  it('oldest first', () => expect(ids(sortItems(xs, 'oldest'))).toEqual(['c', 'd', 'a', 'b']));
  it('done list is newest first whatever the mode', () => {
    const done = [task({ id: 'p', doneAt: 10 }), task({ id: 'q', doneAt: 30 }), task({ id: 'r', doneAt: 20 })];
    expect(ids(sortItems(done, 'shortest', 'done'))).toEqual(['q', 'r', 'p']);
  });
  it('does not mutate its input', () => {
    const copy = [...xs];
    sortItems(xs, 'priority');
    expect(xs).toEqual(copy);
  });

  it('reorderIds drops before / after a neighbour', () => {
    expect(reorderIds(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(reorderIds(['a', 'b', 'c', 'd'], 'a', null, 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderIds(['a', 'b', 'c', 'd'], 'b', null)).toEqual(['a', 'c', 'd', 'b']);
  });
});

// ── Filtering ─────────────────────────────────────────────────────────────────

describe('filterItems', () => {
  const xs = [
    task({ id: 'a', title: 'Book dentist', category: 'care', energy: 1, priority: 1 }),
    task({ id: 'b', title: 'Write the report', category: 'focus', energy: 3, priority: 2, notes: 'quarterly numbers' }),
    task({ id: 'c', title: 'Call the bank', category: 'social', energy: null, priority: null }),
  ];
  const f = (p: Partial<Parameters<typeof filterItems>[1]>) => ids(filterItems(xs, { query: '', categories: [], energy: [], priority: [], ...p }));

  it('search matches every word in title or notes, any case', () => {
    expect(f({ query: 'BOOK' })).toEqual(['a']);
    expect(f({ query: 'report quarterly' })).toEqual(['b']);
    expect(f({ query: 'the' })).toEqual(['b', 'c']);
    expect(f({ query: 'nothing here' })).toEqual([]);
  });
  it('category, energy and priority chips combine (and within a group, or)', () => {
    expect(f({ categories: ['care', 'social'] })).toEqual(['a', 'c']);
    expect(f({ energy: [3] })).toEqual(['b']);
    expect(f({ priority: [1, 2] })).toEqual(['a', 'b']);
    expect(f({ categories: ['care', 'focus'], energy: [1] })).toEqual(['a']);
  });
  it('no filters → everything', () => expect(f({})).toEqual(['a', 'b', 'c']));
});

// ── Chips and labels ──────────────────────────────────────────────────────────

describe('chip cycles and labels', () => {
  it('duration cycles 15/30/45/60/90 and snaps odd values up', () => {
    expect([15, 30, 45, 60, 90].map((d) => nextDuration(d))).toEqual([30, 45, 60, 90, 15]);
    expect(nextDuration(20)).toBe(30);
    expect(nextDuration(120)).toBe(15);
    expect(nextDuration(30, true)).toBe(15);
    expect(nextDuration(15, true)).toBe(90);
  });
  it('levels cycle null → 1 → 2 → 3 → null', () => {
    expect([null, 1, 2, 3].map((v) => nextLevel(v as never))).toEqual([1, 2, 3, null]);
  });
  it('due state is amber only today or earlier', () => {
    expect(dueState(addDays(TODAY, -1), TODAY)).toBe('overdue');
    expect(dueState(TODAY, TODAY)).toBe('today');
    expect(dueState(addDays(TODAY, 2), TODAY)).toBe('soon');
    expect(dueState(addDays(TODAY, 9), TODAY)).toBe('later');
    expect(dueState(null, TODAY)).toBeNull();
  });
  it('age hints start after a week', () => {
    expect(ageLabel(NOW - 3 * DAY, NOW)).toBeNull();
    expect(ageLabel(NOW - 8 * DAY, NOW)).toBe('1 week');
    expect(ageLabel(NOW - 15 * DAY, NOW)).toBe('2 weeks');
    expect(ageLabel(NOW - 70 * DAY, NOW)).toBe('2 months');
  });
});

// ── Capture ───────────────────────────────────────────────────────────────────

describe('parseCapture', () => {
  const p = (line: string) => parseCaptureLine(line, NOW);

  it('one item per non-empty line, bullets stripped', () => {
    const items = parseCapture('- Book dentist\n\n* Return the parcel 15m\n  3. Water plants  \n[ ] Read chapter 4', NOW);
    expect(items.map((i) => i.title)).toEqual(['Book dentist', 'Return the parcel', 'Water plants', 'Read chapter 4']);
    expect(items[1].duration).toBe(15);
    expect(items[0].duration).toBe(30);
  });

  it('durations through quick add', () => {
    expect(p('Deep clean kitchen 1h30')).toMatchObject({ title: 'Deep clean kitchen', duration: 90 });
    expect(p('Stretch for 10 minutes')).toMatchObject({ title: 'Stretch', duration: 10 });
  });

  it('due dates: by fri, due tomorrow, before oct 30, by end of week', () => {
    expect(p('Send invoice by fri')).toMatchObject({ title: 'Send invoice', due: '2026-10-23' });
    expect(p('Renew passport due tomorrow')).toMatchObject({ title: 'Renew passport', due: '2026-10-20' });
    expect(p('Taxes before oct 30')).toMatchObject({ title: 'Taxes', due: '2026-10-30' });
    expect(p('Report by end of week')).toMatchObject({ title: 'Report', due: '2026-10-23' });
    expect(p('Pay rent due today')).toMatchObject({ due: TODAY });
    expect(p('Visit gran by next mon')).toMatchObject({ due: '2026-10-26' });
    expect(p('Stand by me')).toMatchObject({ title: 'Stand by me', due: null });
  });

  it('a named date with no "by" still becomes the due date, and the item stays undated', () => {
    expect(p('Call mom tomorrow')).toMatchObject({ title: 'Call mom', due: '2026-10-20' });
  });

  it('times stay in the title (a dump, not a schedule) but the duration is kept', () => {
    const it = p('Dentist 3pm 45m');
    expect(it).toMatchObject({ duration: 45, due: null });
    expect(it?.title).toBe('Dentist 3pm');
  });

  it('priority: !! is must, ! is should, p1–p3', () => {
    expect(p('Pay rent !!')).toMatchObject({ title: 'Pay rent', priority: 1 });
    expect(p('Pay rent!')).toMatchObject({ title: 'Pay rent', priority: 2 });
    expect(p('!! Fix the boiler')).toMatchObject({ title: 'Fix the boiler', priority: 1 });
    expect(p('Tidy desk p3')).toMatchObject({ title: 'Tidy desk', priority: 3 });
    expect(p('Tidy desk')).toMatchObject({ priority: null });
  });

  it('energy: low / high energy', () => {
    expect(p('Sort photos low energy')).toMatchObject({ title: 'Sort photos', energy: 1 });
    expect(p('High-energy: rewrite intro')).toMatchObject({ title: 'Rewrite intro', energy: 3 });
    expect(p('Answer emails energy: medium')).toMatchObject({ title: 'Answer emails', energy: 2 });
  });

  it('everything at once, in any order', () => {
    expect(p('Write grant report 90m by thu high energy !!')).toMatchObject({
      title: 'Write grant report',
      duration: 90,
      due: '2026-10-22',
      energy: 3,
      priority: 1,
    });
  });

  it('"someday" files the line under Someday', () => {
    expect(p('Learn the cello someday')).toMatchObject({ title: 'Learn the cello', list: 'someday' });
    expect(p('Learn the cello')).toMatchObject({ list: null });
  });

  it('guesses an icon and category from the title', () => {
    expect(p('Call the vet')).toMatchObject({ icon: 'phone', category: 'social' });
    expect(p('Lunch with Sam')).toMatchObject({ category: 'care' });
  });

  it('a line of only metadata is skipped', () => {
    expect(parseCapture('30m !!\n   \nReal thing', NOW).map((i) => i.title)).toEqual(['Real thing']);
  });
});

// ── Plan my day ───────────────────────────────────────────────────────────────

describe('planDay', () => {
  const opts = (p: Partial<Parameters<typeof planDay>[2]> = {}) => ({ fromMs: NOW, toMs: at(23), today: TODAY, peakEndMs: at(13), ...p });

  it('starts on the 5-minute grid after now and fits around busy blocks with a 5-minute buffer', () => {
    const plan = planDay([task({ id: 'a', duration: 30 })], [busy(11, 0, 12, 0)], opts());
    // 10:40–10:55 is too short for 30m (needs a buffer before 11:00), so it lands after the meeting + 5m.
    expect(hm(plan.items[0].startMs)).toBe('12:05');
    expect(plan.items[0].endMs - plan.items[0].startMs).toBe(30 * MINUTE);
  });

  it('uses a short gap when the item fits inside it with its buffer', () => {
    const plan = planDay([task({ id: 'a', duration: 15 })], [busy(11, 0, 12, 0)], opts());
    expect(hm(plan.items[0].startMs)).toBe('10:40');
  });

  it('keeps a buffer between the blocks it places', () => {
    const plan = planDay([task({ id: 'a', duration: 30 }), task({ id: 'b', duration: 30 })], [], opts({ toMs: at(14) }));
    const [x, y] = plan.items;
    expect(hm(x.startMs)).toBe('10:40');
    expect(y.startMs - x.endMs).toBe(5 * MINUTE);
  });

  it('never places over a busy block', () => {
    const blocks = [busy(10, 0, 11, 30), busy(12, 0, 15, 0), busy(16, 0, 17, 0)];
    const plan = planDay(Array.from({ length: 8 }, (_, i) => task({ id: `x${i}`, duration: 30 })), blocks, opts({ toMs: at(19) }));
    for (const it of plan.items)
      for (const b of blocks) expect(it.endMs + 5 * MINUTE <= b.startMs || it.startMs >= b.endMs + 5 * MINUTE).toBe(true);
  });

  it('due soon goes first, then priority, then list (Next → Inbox → Someday)', () => {
    const all = [
      task({ id: 'some', list: 'someday', order: 1 }),
      task({ id: 'inbox', list: 'inbox', order: 1 }),
      task({ id: 'next', list: 'next', order: 1 }),
      task({ id: 'must', priority: 1, list: 'someday' }),
      task({ id: 'due', due: TODAY, priority: 3, list: 'someday' }),
      task({ id: 'tmrw', due: addDays(TODAY, 1) }),
    ];
    expect(ids(planOrder(all, TODAY))).toEqual(['due', 'tmrw', 'must', 'next', 'inbox', 'some']);
    const plan = planDay(all, [], opts());
    expect(plan.items[0].taskId).toBe('due');
    expect(plan.items[0].why).toBe('Due today');
  });

  it('when room is short, the due item wins over a higher priority one', () => {
    // 60m free → 48m budget: only one 30m block fits.
    const all = [task({ id: 'must', priority: 1 }), task({ id: 'due', due: TODAY, priority: 3 })];
    const plan = planDay(all, [], opts({ fromMs: at(14), toMs: at(15) }));
    expect(ids(plan.items)).toEqual(['due']);
    expect(plan.skipped).toEqual([{ taskId: 'must', reason: 'no-room' }]);
  });

  it('energy matching: high energy before ~13:00, low energy later', () => {
    const all = [
      task({ id: 'low', energy: 1, priority: 1 }), // tried first, but waits for the afternoon
      task({ id: 'high', energy: 3, priority: 2 }),
      task({ id: 'mid', energy: null, priority: 3 }),
    ];
    const plan = planDay(all, [], opts({ fromMs: at(9) }));
    const byId = Object.fromEntries(plan.items.map((i) => [i.taskId, i]));
    expect(byId.low.startMs).toBeGreaterThanOrEqual(at(13));
    expect(byId.high.startMs).toBeLessThan(at(13));
    expect(hm(byId.high.startMs)).toBe('09:00');
    expect(byId.low.why).toBe('Low energy · later');
  });

  it('high energy still gets placed after 13:00 if the morning is gone', () => {
    const plan = planDay([task({ id: 'high', energy: 3 })], [], opts({ fromMs: at(15) }));
    expect(hm(plan.items[0].startMs)).toBe('15:00');
  });

  it('fills at most 80% of free time', () => {
    // 10:00–12:00 = 120m free → 96m budget.
    const all = Array.from({ length: 6 }, (_, i) => task({ id: `x${i}`, duration: 30 }));
    const plan = planDay(all, [], opts({ fromMs: at(10), toMs: at(12) }));
    expect(plan.freeMs).toBe(120 * MINUTE);
    expect(plan.budgetMs).toBe(96 * MINUTE);
    expect(plan.items).toHaveLength(3);
    expect(plan.usedMs).toBeLessThanOrEqual(plan.budgetMs);
  });

  it('a smaller item can still use the room a bigger one could not', () => {
    const all = [task({ id: 'big', duration: 60, priority: 1 }), task({ id: 'small', duration: 15, priority: 2 })];
    // 50m free → 40m budget.
    const plan = planDay(all, [], opts({ fromMs: at(10), toMs: at(10, 50) }));
    expect(ids(plan.items)).toEqual(['small']);
  });

  it('skips items longer than any gap', () => {
    const plan = planDay([task({ id: 'huge', duration: 120 }), task({ id: 'ok', duration: 30 })], [busy(12, 0, 23, 0)], opts({ fromMs: at(10) }));
    expect(ids(plan.items)).toEqual(['ok']);
    expect(plan.skipped).toContainEqual({ taskId: 'huge', reason: 'too-long' });
  });

  it('ignores dated and finished tasks, and honours `only`', () => {
    const all = [task({ id: 'dated', date: TODAY, start: 600 }), task({ id: 'done', doneAt: NOW }), task({ id: 'a' }), task({ id: 'b' })];
    expect(ids(planDay(all, [], opts()).items)).toEqual(['a', 'b']);
    expect(ids(planDay(all, [], opts({ only: ['b'] })).items)).toEqual(['b']);
  });

  it('shuffle is repeatable per click and keeps due-today items first', () => {
    const all = [task({ id: 'due', due: TODAY }), ...Array.from({ length: 8 }, (_, i) => task({ id: `x${i}`, order: i }))];
    const one = planOrder(all, TODAY, 1);
    expect(planOrder(all, TODAY, 1)).toEqual(one);
    expect(one[0].id).toBe('due');
    const orders = [0, 1, 2, 3, 4].map((k) => ids(planOrder(all, TODAY, k)).join());
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it('nothing left of the day → an empty plan, not an error', () => {
    const plan = planDay([task({ id: 'a' })], [], opts({ fromMs: at(23), toMs: at(23) }));
    expect(plan.items).toEqual([]);
    expect(plan.freeMs).toBe(0);
  });

  it('freeTime and dayWindow', () => {
    expect(freeTime([busy(11, 0, 12, 0), busy(11, 30, 12, 30)], at(10), at(13))).toBe(90 * MINUTE);
    expect(dayWindow(TODAY, NOW, 7 * 60, 23 * 60)).toEqual({ fromMs: NOW, toMs: at(23) });
    expect(dayWindow(TODAY, at(5), 7 * 60, 23 * 60).fromMs).toBe(at(7));
    // Sleep after midnight belongs to the next calendar day.
    expect(dayWindow(TODAY, NOW, 8 * 60, 60).toMs).toBe(atMinutes(addDays(TODAY, 1), 60));
  });
});
