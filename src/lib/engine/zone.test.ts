import { afterEach, describe, expect, it, vi } from 'vitest';
import { clock } from '../stores/clock.svelte';
import { timer } from '../stores/timer.svelte';
import { atMinutes, formatTime, hourStartMs, isoOf, minutesOfDay, MINUTE, setTimeZone, startOfDayMs, zoneOffsetLabel } from './time';

afterEach(() => {
  setTimeZone(null);
  vi.useRealTimers();
});

describe('time zones', () => {
  it('reads and writes wall time in a chosen zone', () => {
    setTimeZone('Asia/Tokyo');
    const t = atMinutes('2026-10-19', 10 * 60);
    expect(t).toBe(Date.UTC(2026, 9, 19, 1, 0)); // 10:00 JST = 01:00 UTC
    expect(minutesOfDay(t)).toBe(600);
    expect(isoOf(t)).toBe('2026-10-19');
    expect(formatTime(t, false)).toBe('10:00');
    expect(startOfDayMs('2026-10-19')).toBe(Date.UTC(2026, 9, 18, 15, 0));
    // 23:30 UTC on the 18th is already the 19th in Tokyo
    expect(isoOf(Date.UTC(2026, 9, 18, 23, 30))).toBe('2026-10-19');
  });

  it('survives DST changes', () => {
    setTimeZone('America/New_York');
    // 2026-03-08: clocks jump 02:00 → 03:00 (EST −5 → EDT −4)
    expect(atMinutes('2026-03-08', 60)).toBe(Date.UTC(2026, 2, 8, 6, 0));
    expect(atMinutes('2026-03-08', 180)).toBe(Date.UTC(2026, 2, 8, 7, 0));
    // 2026-11-01: 01:30 happens twice; we land on a real 01:30 either way
    expect(minutesOfDay(atMinutes('2026-11-01', 90))).toBe(90);
    // a whole day is 23h / 25h on change days
    expect(startOfDayMs('2026-03-09') - startOfDayMs('2026-03-08')).toBe(23 * 60 * MINUTE);
    expect(startOfDayMs('2026-11-02') - startOfDayMs('2026-11-01')).toBe(25 * 60 * MINUTE);
  });

  it('handles half-hour zones and labels them', () => {
    setTimeZone('Asia/Kolkata');
    const t = Date.UTC(2026, 9, 19, 5, 47); // 11:17 IST
    expect(formatTime(t, false)).toBe('11:17');
    expect(hourStartMs(t)).toBe(Date.UTC(2026, 9, 19, 5, 30)); // 11:00 IST
    expect(zoneOffsetLabel('Asia/Kolkata', t)).toBe('GMT+5:30');
    expect(zoneOffsetLabel('UTC', t)).toBe('GMT');
  });
});

describe('timer accuracy', () => {
  const T0 = Date.UTC(2026, 9, 19, 9, 0, 0);

  function at(ms: number) {
    vi.setSystemTime(ms);
    clock.setOffset(0);
  }

  it('counts down exactly, and pauses without losing time', () => {
    vi.useFakeTimers();
    at(T0);
    timer.startCountdown(25, 'Focus');
    expect(timer.status(T0 + 90_000)!.remainingMs).toBe(25 * MINUTE - 90_000);

    at(T0 + 60_000);
    timer.pause();
    // paused: the clock keeps going, the timer does not
    expect(timer.status(T0 + 115_000)!.remainingMs).toBe(25 * MINUTE - 60_000);
    at(T0 + 120_000);
    timer.resume();
    expect(timer.status(T0 + 180_000)!.remainingMs).toBe(25 * MINUTE - 120_000);
    timer.stop();
  });

  it('walks focus and break segments on the minute', () => {
    vi.useFakeTimers();
    at(T0);
    timer.startCycles({ focus: 25, short: 5, long: 15, rounds: 2 });
    const s1 = timer.status(T0 + 26 * MINUTE)!;
    expect(s1.segment.kind).toBe('break');
    expect(s1.remainingMs).toBe(4 * MINUTE);
    const s2 = timer.status(T0 + 30 * MINUTE)!;
    expect(s2.segment.kind).toBe('focus');
    expect(s2.remainingMs).toBe(25 * MINUTE);
    const end = timer.status(T0 + (25 + 5 + 25 + 15) * MINUTE)!;
    expect(end.finished).toBe(true);
    timer.stop();
  });
});
