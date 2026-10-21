import { describe, expect, it } from 'vitest';
import { blocksInRange } from '../../engine/blocks';
import { CATEGORIES } from '../../engine/categories';
import { addDays, atMinutes, startOfDayMs } from '../../engine/time';
import type { Task } from '../../engine/types';
import { barLabels, dragSpan, fitPxh, freeBands, hourStep, LANE, layoutGantt, msAt, ROW_PAD, rowAt, sweepSpan, wallMin, zoomScroll } from './gantt';

const TODAY = '2026-10-19';
const TOMORROW = '2026-10-20';
const NOW = atMinutes(TODAY, 10 * 60 + 40);

let n = 0;
function task(p: Partial<Task>): Task {
  n++;
  return {
    id: p.id ?? `t${n}`,
    title: `Task ${n}`,
    icon: 'laptop',
    category: 'focus',
    date: TODAY,
    start: null,
    duration: 30,
    notes: '',
    subtasks: [],
    recurrence: null,
    completions: [],
    completedAt: {},
    skips: [],
    overrides: {},
    alerts: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...p,
  };
}

const tasks = [
  task({ id: 'deep', start: 600, duration: 90 }),
  task({ id: 'mail', start: 630, duration: 30 }),
  task({ id: 'lunch', category: 'care', start: 720, duration: 45 }),
  task({ id: 'sleep', category: 'rest', start: 23 * 60, duration: 8 * 60 }),
  task({ id: 'walk', category: 'move', date: TOMORROW, start: 480, duration: 30 }),
];
const blocks = blocksInRange(tasks, [], startOfDayMs(TODAY), startOfDayMs(addDays(TODAY, 3)));
const cats = CATEGORIES.map((c) => c.id);

describe('layout', () => {
  it('gives a day chart one row per kind, with lanes only where blocks overlap', () => {
    const { rows, bars } = layoutGantt(blocks, [TODAY], true, cats);
    expect(rows.map((r) => r.category)).toEqual(cats);
    const focus = rows.find((r) => r.category === 'focus')!;
    expect(focus.lanes).toBe(2);
    expect(focus.height).toBe(2 * LANE + 2 * ROW_PAD);
    expect(rows.find((r) => r.category === 'learn')!.empty).toBe(true);
    const mail = bars.find((b) => b.key.includes('mail'))!;
    expect(mail.lane).toBe(1);
    expect(mail.top).toBe(focus.top + ROW_PAD + LANE);
    expect([mail.s, mail.e]).toEqual([630, 660]);
  });

  it('gives a longer chart one row per day, and cuts a block at midnight', () => {
    const { rows, bars } = layoutGantt(blocks, [TODAY, TOMORROW, addDays(TODAY, 2)], false, cats);
    expect(rows.map((r) => r.date)).toEqual([TODAY, TOMORROW, addDays(TODAY, 2)]);
    const sleep = bars.filter((b) => b.key.includes('sleep'));
    expect(sleep.map((b) => [b.date, b.s, b.e, b.clipS, b.clipE])).toEqual([
      [TODAY, 1380, 1440, false, true],
      [TOMORROW, 0, 420, true, false],
    ]);
    expect(rowAt(rows, rows[1].top + 3)!.date).toBe(TOMORROW);
    expect(rowAt(rows, -40)!.date).toBe(TODAY);
  });

  it('maps minutes and instants both ways', () => {
    expect(wallMin(atMinutes(TODAY, 615), TODAY)).toBe(615);
    expect(wallMin(atMinutes(TOMORROW, 30), TODAY)).toBe(1440);
    expect(msAt(TODAY, 615)).toBe(atMinutes(TODAY, 615));
  });
});

describe('dragging', () => {
  it('moves a bar whole in 5-minute steps, inside the day', () => {
    expect(dragSpan('move', 600, 690, 13)).toEqual({ s: 615, e: 705 });
    expect(dragSpan('move', 600, 690, -900)).toEqual({ s: 0, e: 90 });
    expect(dragSpan('move', 1400, 1430, 60)).toEqual({ s: 1410, e: 1440 });
  });

  it('stretches either end, never below one step', () => {
    expect(dragSpan('end', 600, 690, 22)).toEqual({ s: 600, e: 710 });
    expect(dragSpan('end', 600, 690, -200)).toEqual({ s: 600, e: 605 });
    expect(dragSpan('start', 600, 690, -31)).toEqual({ s: 570, e: 690 });
    expect(dragSpan('start', 600, 690, 120)).toEqual({ s: 685, e: 690 });
  });

  it('sweeps a new block either way, once it is a step long', () => {
    expect(sweepSpan(700, 641)).toEqual({ s: 640, e: 700 });
    expect(sweepSpan(700, 702)).toBeNull();
  });
});

describe('scale', () => {
  it('fits the waking day to the width', () => {
    expect(fitPxh(960, 7 * 60, 23 * 60)).toBe(60);
    expect(fitPxh(100, 7 * 60, 23 * 60)).toBe(22);
    // Sleep after midnight.
    expect(fitPxh(1080, 9 * 60, 60)).toBe(67.5);
  });

  it('keeps the time under the pointer still while zooming', () => {
    // 10:00 sits under x=300 with a 100px label column at 60 px/h.
    const left = 10 * 60 - 300 + 100;
    expect(zoomScroll(left, 300, 100, 60, 120)).toBe(10 * 120 + 100 - 300);
    expect(hourStep(60)).toBe(1);
    expect(hourStep(30)).toBe(2);
    expect(hourStep(22)).toBe(3);
  });

  it('puts words inside, as an icon, or beside a short bar', () => {
    const { bars } = layoutGantt(blocks, [TODAY], true, cats);
    const at = barLabels(bars, 1);
    expect(at.get(bars.find((b) => b.key.includes('deep'))!.id)).toEqual({ fit: 'full', out: 0 });
    expect(at.get(bars.find((b) => b.key.includes('mail'))!.id)!.fit).toBe('icon');
    expect(at.get(bars.find((b) => b.key.includes('mail'))!.id)!.out).toBeGreaterThan(64);
  });
});

describe('free time', () => {
  it('shows the free stretches of the waking day', () => {
    const today = blocks.filter((b) => b.startMs < startOfDayMs(TOMORROW));
    expect(freeBands(today, TODAY, 7 * 60, 23 * 60)).toEqual([
      { s: 420, e: 600 },
      { s: 690, e: 720 },
      { s: 765, e: 1380 },
    ]);
  });
});
