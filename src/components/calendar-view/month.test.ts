import { describe, expect, it } from 'vitest';
import { addMonths, ARC_GAP, dayLoads, moveDay, sideOf, SwipeGate, weekMonth, weekStartOf, type LoadBlock } from './month';

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 21, 8);
const block = (o: Partial<LoadBlock> & { h: number; at?: number }): LoadBlock => ({
  date: '2026-10-21',
  kind: 'task',
  done: false,
  color: '#3d6fe3',
  startMs: T0 + (o.at ?? 0) * H,
  endMs: T0 + ((o.at ?? 0) + o.h) * H,
  ...o,
});

describe('dayLoads', () => {
  it('lays a day’s blocks end to end, a full turn being the waking day', () => {
    const m = dayLoads([block({ h: 2, at: 3 }), block({ h: 4, at: 0, color: '#25976a' })], 16 * 60);
    const d = m.get('2026-10-21')!;
    expect(d.arcs.map((a) => a.color)).toEqual(['#25976a', '#3d6fe3']);
    expect(d.arcs[0].start).toBe(0);
    expect(d.arcs[0].length).toBeCloseTo(4 / 16);
    expect(d.arcs[1].start).toBeCloseTo(4 / 16 + ARC_GAP);
    expect(d.arcs[1].length).toBeCloseTo(2 / 16);
    expect(d.tasks).toBe(2);
    expect(d.minutes).toBe(360);
    expect(d.complete).toBe(false);
  });

  it('closes the ring on a day planned past full, instead of wrapping', () => {
    const d = dayLoads([block({ h: 10 }), block({ h: 10, at: 10 })], 16 * 60).get('2026-10-21')!;
    const last = d.arcs.at(-1)!;
    expect(last.start + last.length).toBeLessThanOrEqual(1 - ARC_GAP + 1e-9);
  });

  it('draws calendar events and salah quieter and counts them apart', () => {
    const d = dayLoads([block({ h: 1, kind: 'event' }), block({ h: 1, at: 2, done: true })], 960).get('2026-10-21')!;
    expect(d.arcs[0].quiet).toBe(true);
    expect(d.arcs[1].quiet).toBe(false);
    expect(d.events).toBe(1);
    expect(d.tasks).toBe(1);
    expect(d.minutes).toBe(60);
    expect(d.complete).toBe(true);
  });

  it('a day of events only is never "complete"; skipped events take no room', () => {
    const m = dayLoads([block({ h: 1, kind: 'event' }), block({ h: 1, kind: 'event', skipped: true, date: '2026-10-22' })], 960);
    expect(m.get('2026-10-21')!.complete).toBe(false);
    expect(m.has('2026-10-22')).toBe(false);
  });

  it('keeps a tiny block visible', () => {
    const d = dayLoads([block({ h: 1 / 60 })], 960).get('2026-10-21')!;
    expect(d.arcs[0].length).toBeGreaterThan(0.01);
  });
});

describe('moving between days', () => {
  it('moves by day and week with the arrows', () => {
    expect(moveDay('2026-10-21', 'ArrowLeft')).toBe('2026-10-20');
    expect(moveDay('2026-10-31', 'ArrowRight')).toBe('2026-11-01');
    expect(moveDay('2026-10-21', 'ArrowUp')).toBe('2026-10-14');
    expect(moveDay('2026-10-28', 'ArrowDown')).toBe('2026-11-04');
  });
  it('Home and End go to the week’s Monday and Sunday', () => {
    expect(moveDay('2026-10-21', 'Home')).toBe('2026-10-19');
    expect(moveDay('2026-10-21', 'End')).toBe('2026-10-25');
    expect(moveDay('2026-10-25', 'Home')).toBe('2026-10-19');
  });
  it('Page Up/Down move a month (a year with Shift), staying inside the month', () => {
    expect(moveDay('2026-10-21', 'PageDown')).toBe('2026-11-21');
    expect(moveDay('2026-01-31', 'PageDown')).toBe('2026-02-28');
    expect(moveDay('2026-03-31', 'PageUp')).toBe('2026-02-28');
    expect(moveDay('2028-02-29', 'PageUp', true)).toBe('2027-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });
  it('ignores other keys', () => {
    expect(moveDay('2026-10-21', 'a')).toBeNull();
  });
});

describe('the week strip', () => {
  it('finds the week and which side a day is on', () => {
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19');
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19');
    expect(sideOf('2026-10-21', '2026-10-19')).toBe(0);
    expect(sideOf('2026-10-26', '2026-10-19')).toBe(1);
    expect(sideOf('2026-10-18', '2026-10-19')).toBe(-1);
  });
  it('names the month most of the week is in', () => {
    expect(weekMonth('2026-10-26')).toBe(9); // 26 Oct – 1 Nov: mostly October
    expect(weekMonth('2026-10-29')).toBe(10); // 29 Oct – 4 Nov: mostly November
  });
  it('turns one swipe, momentum and all, into one step', () => {
    const g = new SwipeGate(48, 220);
    let t = 0;
    const steps: number[] = [];
    for (let i = 0; i < 30; i++) steps.push(g.push(12, (t += 16)));
    expect(steps.filter((s) => s !== 0)).toEqual([1]);
    // After a pause, the next swipe steps again (the other way).
    t += 400;
    const back: number[] = [];
    for (let i = 0; i < 10; i++) back.push(g.push(-20, (t += 16)));
    expect(back.filter((s) => s !== 0)).toEqual([-1]);
  });
  it('ignores small nudges', () => {
    const g = new SwipeGate(48, 220);
    expect(g.push(10, 0)).toBe(0);
    expect(g.push(10, 500)).toBe(0);
  });
});
