import { describe, expect, it } from 'vitest';
import { addDays, atMinutes, HOUR, MINUTE, setTimeZone, startOfDayMs } from './engine/time';
import type { ISODate, Task } from './engine/types';
import {
  ACHIEVEMENTS,
  buildHistory,
  computeInsights,
  evaluateAchievements,
  highlights,
  hourLabel,
  partOfHour,
} from './insights';

// Monday 19 October 2026, 18:00 in the active zone. The week is Tue 13 → Mon 19.
const TODAY = '2026-10-19';
const NOW = atMinutes(TODAY, 18 * 60);
const D = (n: number): ISODate => addDays(TODAY, n);

let seq = 0;
function task(p: Partial<Task>): Task {
  return {
    id: `t${++seq}`,
    title: 'Block',
    icon: 'laptop',
    category: 'focus',
    date: TODAY,
    start: 9 * 60,
    duration: 30,
    notes: '',
    subtasks: [],
    recurrence: null,
    completions: [],
    completedAt: {},
    skips: [],
    overrides: {},
    alerts: [],
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

/** Mark occurrences done, ticked `after` minutes past each one's start (default: well after the end). */
function tick(t: Task, dates: ISODate[], after?: number): Task {
  for (const d of dates) {
    t.completions.push(d);
    const start = t.overrides[d]?.start ?? t.start ?? 12 * 60;
    t.completedAt![d] = atMinutes(d, start + (after ?? (t.overrides[d]?.duration ?? t.duration) + 5));
  }
  return t;
}

/** A one-off block finished on a date. */
function doneBlock(date: ISODate, p: Partial<Task> = {}, after?: number): Task {
  const t = task({ date, ...p });
  return tick(t, [date], after);
}

function backlogDone(atMs: number, p: Partial<Task> = {}): Task {
  return task({ date: null, start: null, doneAt: atMs, ...p });
}

const ids = (tasks: Task[], unlocked: string[] = []) => evaluateAchievements(tasks, NOW, unlocked).map((a) => a.id);

// ---------------------------------------------------------------------------

function goodWeek(): Task[] {
  const meds = task({
    title: 'Meds',
    icon: 'pill',
    category: 'care',
    date: D(-30),
    start: 8 * 60,
    duration: 10,
    recurrence: { freq: 'daily', interval: 1 },
    // "Just this one": earlier and renamed on Saturday.
    overrides: { [D(-2)]: { start: 7 * 60, title: 'Meds (early)' } },
  });
  tick(meds, [D(-6), D(-5), D(-4), D(-2), D(-1), D(0)], 5);

  return [
    meds,
    doneBlock(D(-5), { title: 'Write', start: 9 * 60 + 30, duration: 90 }),
    doneBlock(D(-4), { title: 'Write', start: 9 * 60 + 30, duration: 90 }),
    doneBlock(D(-2), { title: 'Walk', category: 'move', icon: 'footprints', start: 17 * 60 + 30, duration: 30 }),
    task({ title: 'Walk', category: 'move', date: D(-1), start: 17 * 60 + 30, duration: 30 }), // passed, not done
    doneBlock(D(-1), { title: 'Call mum', category: 'social', start: 19 * 60, duration: 30 }, 10), // ticked 10m in
    // Anytime block, ticked mid-afternoon.
    (() => {
      const t = task({ title: 'Water plants', category: 'routine', date: D(-4), start: null, duration: 10 });
      t.completions.push(D(-4));
      t.completedAt![D(-4)] = atMinutes(D(-4), 14 * 60);
      return t;
    })(),
    task({ title: 'Read', category: 'learn', date: TODAY, start: 20 * 60, duration: 30 }), // still to come
    task({ title: 'Tidy', category: 'routine', date: D(-2), start: 11 * 60, duration: 30, acks: [D(-2)] }), // waved off
    backlogDone(atMinutes(D(-3), 10 * 60), { title: 'Book dentist', category: 'care' }),
    backlogDone(atMinutes(D(-1), 11 * 60), { title: 'Return parcel', category: 'routine' }),
    backlogDone(atMinutes(D(0), 9 * 60), { title: 'Renew library card', category: 'learn' }),
    backlogDone(atMinutes(D(-8), 9 * 60), { title: 'Older', category: 'routine' }), // previous week
    task({ date: null, start: null, title: 'Still waiting' }),
    // Previous week.
    doneBlock(D(-8), { title: 'Plan', start: 10 * 60, duration: 60 }),
    doneBlock(D(-9), { title: 'Plan', start: 10 * 60, duration: 60 }),
  ];
}

describe('insights metrics', () => {
  const s = computeInsights(goodWeek(), NOW);

  it('covers the last 7 days in the active zone', () => {
    expect(s.from).toBe(D(-6));
    expect(s.to).toBe(TODAY);
    expect(s.days.map((d) => d.date)).toEqual([D(-6), D(-5), D(-4), D(-3), D(-2), D(-1), D(0)]);
    expect(s.previous.from).toBe(D(-13));
    expect(s.previous.to).toBe(D(-7));
  });

  it('counts finished blocks and kept plans, leaving future and waved-off time out', () => {
    // meds 6 + write 2 + walk 1 + call 1 + water 1
    expect(s.finished).toBe(11);
    // + the missed meds and walk; "Read" (still to come) and "Tidy" (acknowledged) don't count
    expect(s.planned).toBe(13);
    expect(s.kept).toBe(11);
  });

  it('measures time well spent per category, up to the tick', () => {
    expect(s.spent.care).toBe(6 * 5 * MINUTE); // meds ticked 5 minutes in, every day
    expect(s.spent.focus).toBe(2 * 90 * MINUTE);
    expect(s.spent.move).toBe(30 * MINUTE);
    expect(s.spent.social).toBe(10 * MINUTE); // ticked 10 minutes into a 30-minute call
    expect(s.spent.routine).toBe(0); // anytime blocks count as done items, not time
    expect(s.spentTotal).toBe((30 + 180 + 30 + 10) * MINUTE);
  });

  it('counts backlog items finished in range only', () => {
    expect(s.backlogDone).toBe(3);
    expect(s.previous.backlogDone).toBe(1);
  });

  it('finds the best time of day and the steadiest routine', () => {
    expect(s.bestPart).toEqual({ id: 'morning', count: 8, category: 'care' });
    expect(s.bestHour).toBe(8);
    expect(s.byHour[14]).toBe(1); // the anytime block, by when it was ticked
    expect(s.routine).toMatchObject({ title: 'Meds', done: 6, total: 7, category: 'care' });
  });

  it('builds a per-day series with dial arcs that honour overrides', () => {
    const sat = s.days[4];
    expect(sat.date).toBe(D(-2));
    expect(sat.done).toBe(2);
    expect(sat.arcs.map((a) => [a.title, a.start, a.end])).toEqual([
      ['Meds (early)', 7 * 60, 7 * 60 + 5],
      ['Walk', 17 * 60 + 30, 18 * 60],
    ]);
    const thu = s.days[2];
    expect(thu.done).toBe(3); // meds, write, water (anytime)
    expect(thu.arcs).toHaveLength(2);
    expect(thu.focusMs).toBe(90 * MINUTE);
    expect(s.days[3].done).toBe(0);
    expect(s.days[3].backlog).toBe(1);
    expect(s.activeDays).toBe(7);
  });

  it('compares with the week before', () => {
    expect(s.previous.finished).toBe(2);
    expect(s.previous.planned).toBe(9); // 7 meds + 2 plans
  });

  it('can look at four weeks', () => {
    const m = computeInsights(goodWeek(), NOW, 28);
    expect(m.days).toHaveLength(28);
    expect(m.finished).toBe(13);
    expect(m.backlogDone).toBe(4);
  });

  it('counts a block ticked before it began as done early, in full', () => {
    const t = task({ date: D(-1), start: 15 * 60, duration: 45 });
    t.completions.push(D(-1));
    t.completedAt![D(-1)] = atMinutes(D(-1), 10 * 60);
    expect(computeInsights([t], NOW).spentTotal).toBe(45 * MINUTE);
  });
});

describe('highlights', () => {
  it('names specific wins in a good week', () => {
    const s = computeInsights(goodWeek(), NOW);
    expect(highlights(s, { hour12: true }).map((h) => h.text)).toEqual([
      'You kept 11 of 13 plans this week.',
      'Mornings work for you: 8 blocks finished before 11am.',
      'Meds: 6 of 7 days.',
      'You cleared 3 things from your backlog.',
    ]);
    expect(highlights(s, { hour12: false })[1].text).toBe('Mornings work for you: 8 blocks finished before 11:00.');
    expect(highlights(s)[2]).toMatchObject({ icon: 'pill', tone: 'care' });
  });

  it('is deterministic', () => {
    const a = highlights(computeInsights(goodWeek(), NOW));
    const b = highlights(computeInsights(goodWeek(), NOW));
    expect(a).toEqual(b);
  });

  it('reframes a light week kindly, with no failure counts', () => {
    const tasks = [
      doneBlock(D(-5), { start: 9 * 60, duration: 20 }),
      doneBlock(D(-3), { start: 10 * 60, duration: 20 }),
      doneBlock(D(0), { start: 15 * 60, duration: 20 }),
      ...[-6, -5, -4, -3, -2, -1].map((n) => task({ date: D(n), start: 12 * 60, duration: 30 })),
    ];
    const s = computeInsights(tasks, NOW);
    expect(s.kept).toBe(3);
    expect(s.planned).toBe(9);
    const lines = highlights(s, { hour12: true }).map((h) => h.text);
    expect(lines[0]).toBe('A lighter week. You still showed up on 3 days — small blocks are a great restart.');
    expect(lines).toContain('Mornings work for you: 2 blocks finished before 11am.');
    expect(lines).toContain('1h went to focused work.');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(4);
    for (const l of lines) expect(l).not.toMatch(/of 9|missed|failed|only|behind|streak/i);
  });

  it('a single day still counts', () => {
    const s = computeInsights([doneBlock(D(-1))], NOW);
    const lines = highlights(s).map((h) => h.text);
    expect(lines[0]).toBe('A lighter week. You still showed up — and one day counts. Small blocks are a great restart.');
    expect(lines).toHaveLength(2);
  });

  it('a blank week is quiet, not empty', () => {
    const lines = highlights(computeInsights([], NOW));
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toMatch(/^A quiet week/);
  });

  it('celebrates growth over last week only when it grew', () => {
    const tasks = [
      ...[-6, -5, -4, -3, -2, -1, 0].flatMap((n) => [
        doneBlock(D(n), { start: 13 * 60, duration: 30, category: 'learn' }),
        doneBlock(D(n), { start: 14 * 60 + 30, duration: 30, category: 'learn' }),
      ]),
      ...[-8, -9].map((n) => doneBlock(D(n), { start: 13 * 60 })),
    ];
    const lines = highlights(computeInsights(tasks, NOW)).map((h) => h.text);
    expect(lines).toContain('You kept all 14 plans this week.');
    expect(lines).toContain('7h went to learning.');
    expect(lines.length).toBe(4);
    // Shrinking weeks never get a comparison.
    const fewer = highlights(computeInsights([...[-8, -9, -10].map((n) => doneBlock(D(n))), doneBlock(D(-1))], NOW));
    for (const l of fewer) expect(l.text).not.toMatch(/than last week/);
  });
});

describe('zones', () => {
  it('counts days and hours on the active zone\'s wall clock', () => {
    setTimeZone('Pacific/Kiritimati'); // UTC+14: far from wherever the tests run
    try {
      const now = atMinutes(TODAY, 18 * 60);
      const t = task({ date: D(-1), start: 7 * 60 + 30, duration: 60 });
      t.completions.push(D(-1));
      t.completedAt![D(-1)] = atMinutes(D(-1), 8 * 60);
      const s = computeInsights([t], now);
      expect(s.to).toBe(TODAY);
      expect(s.days[5].arcs[0]).toMatchObject({ start: 7 * 60 + 30, end: 8 * 60 });
      expect(s.bestHour).toBe(7);
      expect(s.bestPart?.id).toBe('morning');
    } finally {
      setTimeZone(null);
    }
  });
});

describe('time helpers', () => {
  it('labels hours in both clock styles', () => {
    expect(hourLabel(11, true)).toBe('11am');
    expect(hourLabel(17, true)).toBe('5pm');
    expect(hourLabel(0, true)).toBe('12am');
    expect(hourLabel(9, false)).toBe('09:00');
  });
  it('buckets hours into parts of the day', () => {
    expect(partOfHour(5)).toBe('morning');
    expect(partOfHour(10)).toBe('morning');
    expect(partOfHour(11)).toBe('midday');
    expect(partOfHour(16)).toBe('afternoon');
    expect(partOfHour(20)).toBe('evening');
    expect(partOfHour(23)).toBe('night');
    expect(partOfHour(2)).toBe('night');
  });
});

// ---------------------------------------------------------------------------

describe('achievements', () => {
  it('has 14 distinct, gentle badges', () => {
    expect(ACHIEVEMENTS).toHaveLength(14);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(14);
    for (const a of ACHIEVEMENTS) {
      expect(a.title && a.description && a.hint && a.icon).toBeTruthy();
      expect(`${a.description} ${a.hint}`).not.toMatch(/streak|fail|missed|don't break/i);
    }
  });

  it('first bloom: any finished block', () => {
    expect(ids([])).toEqual([]);
    expect(ids([task({ date: D(-1) })])).not.toContain('first-bloom');
    expect(ids([doneBlock(D(-1))])).toContain('first-bloom');
    expect(ids([backlogDone(NOW - HOUR)])).toContain('first-bloom');
  });

  it('never returns a badge already unlocked', () => {
    expect(ids([doneBlock(D(-1))], ['first-bloom'])).not.toContain('first-bloom');
    expect(evaluateAchievements([doneBlock(D(-1))], NOW, ACHIEVEMENTS.map((a) => a.id))).toEqual([]);
  });

  it('a full day: every block on a day of three or more', () => {
    const three = [10, 12, 14].map((h) => doneBlock(D(-1), { start: h * 60 }));
    expect(ids(three)).toContain('full-day');
    expect(ids([...three, task({ date: D(-1), start: 16 * 60 })])).not.toContain('full-day');
    expect(ids(three.slice(0, 2))).not.toContain('full-day');
  });

  it('early bird and night owl', () => {
    expect(ids([doneBlock(D(-1), { start: 8 * 60 + 30 })])).toContain('early-bird');
    expect(ids([doneBlock(D(-1), { start: 9 * 60 })])).not.toContain('early-bird');
    expect(ids([doneBlock(D(-1), { start: 21 * 60 + 30 })])).toContain('night-owl');
    expect(ids([doneBlock(D(-1), { start: 20 * 60 + 30 })])).not.toContain('night-owl');
  });

  it('focus hour and deep diver count focus time spent in a day', () => {
    expect(ids([doneBlock(D(-1), { start: 10 * 60, duration: 60 })])).toContain('focus-hour');
    expect(ids([doneBlock(D(-1), { start: 10 * 60, duration: 45 })])).not.toContain('focus-hour');
    // Ticked half-way: only the time spent counts.
    expect(ids([doneBlock(D(-1), { start: 10 * 60, duration: 60 }, 30)])).not.toContain('focus-hour');
    expect(ids([doneBlock(D(-1), { start: 10 * 60, duration: 60, category: 'care' })])).not.toContain('focus-hour');

    const sameDay = [doneBlock(D(-1), { start: 9 * 60, duration: 60 }), doneBlock(D(-1), { start: 14 * 60, duration: 60 })];
    expect(ids(sameDay)).toContain('deep-diver');
    const twoDays = [doneBlock(D(-1), { start: 9 * 60, duration: 60 }), doneBlock(D(-2), { start: 14 * 60, duration: 60 })];
    expect(ids(twoDays)).not.toContain('deep-diver');
    expect(ids(twoDays)).toContain('focus-hour');
  });

  it('routine keeper: a repeating block done five times', () => {
    const r = (n: number) =>
      tick(
        task({ date: D(-10), recurrence: { freq: 'daily', interval: 1 } }),
        Array.from({ length: n }, (_, i) => D(-1 - i)),
      );
    expect(ids([r(5)])).toContain('routine-keeper');
    expect(ids([r(4)])).not.toContain('routine-keeper');
  });

  it('backlog bulldozer: five backlog items finished', () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => backlogDone(NOW - (i + 1) * HOUR));
    expect(ids(items(5))).toContain('backlog-bulldozer');
    expect(ids(items(4))).not.toContain('backlog-bulldozer');
    // Not yet (a clock set in the future) doesn't count.
    expect(ids([...items(4), backlogDone(NOW + HOUR)])).not.toContain('backlog-bulldozer');
  });

  it('planner: two blocks for tomorrow planned before today ended', () => {
    const ahead = (date: ISODate, createdAt: number) => task({ date, createdAt });
    expect(ids([ahead(D(1), NOW - HOUR), ahead(D(1), NOW - 2 * HOUR)])).toContain('planner');
    expect(ids([ahead(D(1), NOW - HOUR)])).not.toContain('planner');
    // Made on the day itself: not planning ahead.
    const sameDay = startOfDayMs(TODAY) + HOUR;
    expect(ids([ahead(TODAY, sameDay), ahead(TODAY, sameDay)])).not.toContain('planner');
    // Repeating blocks don't count as planning a particular day.
    const rec = task({ date: D(-30), createdAt: 0, recurrence: { freq: 'daily', interval: 1 } });
    expect(ids([rec, { ...rec, id: 'r2' }])).not.toContain('planner');
  });

  it('welcome back: a finished block after three or more quiet days', () => {
    expect(ids([doneBlock(D(-9)), doneBlock(D(-5))])).toContain('comeback');
    expect(ids([doneBlock(D(-8)), doneBlock(D(-5))])).not.toContain('comeback');
    expect(ids([doneBlock(D(-5))])).not.toContain('comeback');
  });

  it('week of light: something finished on five of seven days', () => {
    expect(ids([-12, -11, -9, -8, -6].map((n) => doneBlock(D(n))))).toContain('week-of-light');
    expect(ids([-12, -11, -9, -8, -5].map((n) => doneBlock(D(n))))).not.toContain('week-of-light');
  });

  it('balanced day: three categories finished in one day', () => {
    const cats = (list: Task['category'][]) => list.map((category, i) => doneBlock(D(-1), { category, start: (9 + i) * 60 }));
    expect(ids(cats(['focus', 'care', 'move']))).toContain('balanced-day');
    expect(ids(cats(['focus', 'care', 'focus']))).not.toContain('balanced-day');
  });

  it('step by step: a finished block with every step ticked', () => {
    const steps = (done: boolean[]) => done.map((d, i) => ({ id: `s${i}`, title: `Step ${i}`, done: d }));
    expect(ids([doneBlock(D(-1), { subtasks: steps([true, true]) })])).toContain('steps-taker');
    expect(ids([doneBlock(D(-1), { subtasks: steps([true, false]) })])).not.toContain('steps-taker');
    expect(ids([task({ date: D(-1), subtasks: steps([true, true]) })])).not.toContain('steps-taker');
  });

  it('marathon: six blocks in one day', () => {
    const blocks = (n: number) => Array.from({ length: n }, (_, i) => doneBlock(D(-1), { start: (8 + i) * 60 }));
    expect(ids(blocks(6))).toContain('marathon');
    expect(ids(blocks(5))).not.toContain('marathon');
  });

  it('history ignores completions dated after today', () => {
    const h = buildHistory([doneBlock(D(2))], NOW);
    expect(h.items).toHaveLength(0);
  });
});
