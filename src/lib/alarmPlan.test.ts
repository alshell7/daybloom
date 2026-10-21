import { describe, expect, it } from 'vitest';
import { crossed, dueSnoozes, LATE_MS, migrateAlarms, ringLeft, startMinutes, type AlarmInfo, type Snoozed } from './alarmPlan';
import { MINUTE } from './engine/time';

const T = Date.UTC(2026, 9, 21, 7, 0);
const info = (over: Partial<AlarmInfo> = {}): AlarmInfo => ({ key: 'task:a@2026-10-21', taskId: 'a', title: 'Wake up', icon: 'sunrise', category: 'care', startMs: T, endMs: T + 30 * MINUTE, tone: 'dawn', ...over });
const snooze = (at: number, key = 'k'): Snoozed => ({ ...info({ key }), at, snoozes: 1 });

describe('when an alarm rings', () => {
  it('rings when the clock passes the start', () => {
    expect(crossed(T - 1000, T, T)).toBe(true);
    expect(crossed(T - 1000, T + 4000, T)).toBe(true);
  });

  it('never on the first tick (launching after the start rings nothing old)', () => {
    expect(crossed(0, T + 1000, T)).toBe(false);
  });

  it('not when the start is already behind the last tick (a block moved into the past)', () => {
    expect(crossed(T + 1000, T + 2000, T)).toBe(false);
  });

  it('not before the start', () => {
    expect(crossed(T - 3000, T - 1000, T)).toBe(false);
  });

  it('still rings after a short sleep, but lets a long-missed one go', () => {
    expect(crossed(T - MINUTE, T + 10 * MINUTE, T)).toBe(true);
    expect(crossed(T - MINUTE, T + LATE_MS + 1, T)).toBe(false);
  });

  it('a clock going backwards rings nothing', () => {
    expect(crossed(T + 5000, T - 5000, T)).toBe(false);
  });
});

describe('snoozes', () => {
  it('splits due from waiting, soonest first, and drops stale ones', () => {
    const now = T + 20 * MINUTE;
    const list = [snooze(now + MINUTE, 'later'), snooze(now - 2000, 'b'), snooze(now - 5000, 'a'), snooze(now - LATE_MS - 1, 'old')];
    const { due, waiting } = dueSnoozes(list, now);
    expect(due.map((s) => s.key)).toEqual(['a', 'b']);
    expect(waiting.map((s) => s.key)).toEqual(['later']);
  });

  it('a snooze due exactly now rings', () => {
    expect(dueSnoozes([snooze(T)], T).due).toHaveLength(1);
  });
});

describe('ringing', () => {
  it('stops by itself after the ring length', () => {
    const r = { ...info(), since: T, snoozes: 0 };
    expect(ringLeft(r, 3, T)).toBe(3 * MINUTE);
    expect(ringLeft(r, 3, T + 3 * MINUTE)).toBe(0);
    // Never shorter than a minute, whatever is stored.
    expect(ringLeft(r, 0, T)).toBe(MINUTE);
  });

  it('"Start now" runs for the rest of the block, or all of it once it is over', () => {
    expect(startMinutes(info(), T + 10 * MINUTE)).toBe(20);
    expect(startMinutes(info(), T + 40 * MINUTE)).toBe(30);
    expect(startMinutes(info({ endMs: T + 2 * MINUTE }), T)).toBe(5);
  });
});

describe('stored state', () => {
  it('keeps good entries and drops broken ones', () => {
    const m = migrateAlarms({
      ringing: { ...info(), since: T },
      snoozed: [snooze(T + MINUTE), { key: 'x' }, null],
      note: { ...info(), rangAt: T },
    });
    expect(m.ringing?.snoozes).toBe(0);
    expect(m.snoozed).toHaveLength(1);
    expect(m.note?.rangAt).toBe(T);
    expect(migrateAlarms(null)).toEqual({ ringing: null, snoozed: [], note: null });
    expect(migrateAlarms({ ringing: { key: 'k' } }).ringing).toBeNull();
  });
});
