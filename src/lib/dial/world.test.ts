import { describe, expect, it } from 'vitest';
import { FINISHES } from '../presets';
import { solarAltitude } from './sun';
import {
  aheadLabel,
  compareList,
  dayShift,
  gradientAxis,
  hourMarks,
  phaseAt,
  pinZone,
  placeOf,
  promoteZone,
  replaceZone,
  skyFor,
  skyPieces,
  timeIn,
} from './world';

const MIN = 60_000;
const HOUR = 60 * MIN;
// 2026-10-21 20:00 UTC: 22:00 in Berlin (CEST), 05:00 next day in Tokyo, 16:00 in New York.
const T = Date.UTC(2026, 9, 21, 20, 0);

describe('wall time in other zones', () => {
  it('reads the time anywhere, whatever zone the app follows', () => {
    expect(timeIn(T, 'Asia/Tokyo')).toBe('05:00');
    expect(timeIn(T, 'America/New_York')).toBe('16:00');
    expect(timeIn(T, 'America/New_York', true)).toBe('4:00pm');
    expect(timeIn(T, 'Asia/Kolkata')).toBe('01:30');
  });

  it('says how far ahead a zone runs', () => {
    expect(aheadLabel(T, 'Asia/Tokyo', 'Europe/Berlin')).toBe('+7h');
    expect(aheadLabel(T, 'America/New_York', 'Europe/Berlin')).toBe('−6h');
    expect(aheadLabel(T, 'Asia/Kolkata', 'Europe/Berlin')).toBe('+3h 30m');
    expect(aheadLabel(T, 'Asia/Kathmandu', 'Asia/Kolkata')).toBe('+15m');
    expect(aheadLabel(T, 'Europe/Paris', 'Europe/Berlin')).toBe('same time');
    // After Europe's clocks go back (25 Oct) and before America's (1 Nov), New York is 5h behind.
    expect(aheadLabel(Date.UTC(2026, 9, 28, 12), 'America/New_York', 'Europe/Berlin')).toBe('−5h');
  });

  it('knows when it is already tomorrow there', () => {
    expect(dayShift(T, 'Asia/Tokyo', 'Europe/Berlin')).toBe(1);
    expect(dayShift(T, 'America/New_York', 'Europe/Berlin')).toBe(0);
    expect(dayShift(Date.UTC(2026, 9, 21, 23, 30), 'America/Los_Angeles', 'Asia/Tokyo')).toBe(-1);
  });
});

describe('where a zone is', () => {
  it('finds the city the zone is named after', () => {
    expect(placeOf('America/New_York')).toMatchObject({ lat: 40.7128, lng: -74.006, approx: false });
    expect(placeOf('Asia/Calcutta')).toMatchObject({ lat: 22.5726, approx: false }); // Kolkata
    expect(placeOf('Pacific/Honolulu')).toMatchObject({ lat: 21.31, approx: false });
  });

  it('guesses an equator sky from the offset for zones it does not know', () => {
    const p = placeOf('Etc/GMT-3', T);
    expect(p.approx).toBe(true);
    expect(p.lat).toBe(0);
    expect(p.lng).toBeCloseTo(45);
    // About 6:00–18:00 local: day at local noon, night at local midnight.
    expect(phaseAt(Date.UTC(2026, 9, 21, 9), p)).toBe('day');
    expect(phaseAt(Date.UTC(2026, 9, 21, 21), p)).toBe('night');
  });
});

describe('day and night on a ring', () => {
  const sky = skyFor(FINISHES.glacier);
  const tokyo = placeOf('Asia/Tokyo');
  // The 24-hour dial for Berlin's 21 October: midnight at the bottom, noon at the top.
  const day0 = Date.UTC(2026, 9, 20, 22); // 00:00 CEST
  const span24 = { originMs: day0 - 12 * HOUR, spanMs: 24 * HOUR, startMs: day0 };

  it('covers the whole turn without gaps', () => {
    const pieces = skyPieces(span24, tokyo, sky);
    expect(pieces[0].a0).toBeCloseTo(180);
    expect(pieces.at(-1)!.a1).toBeCloseTo(540);
    for (let i = 1; i < pieces.length; i++) expect(pieces[i].a0).toBeCloseTo(pieces[i - 1].a1);
  });

  it('has a day, a night and graded twilights between them', () => {
    const pieces = skyPieces(span24, tokyo, sky);
    const solids = pieces.filter((p) => p.color);
    expect(solids.some((p) => p.color === sky.day)).toBe(true);
    expect(solids.some((p) => p.color === sky.night)).toBe(true);
    const grads = pieces.filter((p) => p.stops);
    expect(grads.length).toBeGreaterThanOrEqual(2);
    for (const g of grads) expect(g.a1 - g.a0).toBeLessThanOrEqual(41);
  });

  it('puts the day where the sun is up there', () => {
    const pieces = skyPieces(span24, tokyo, sky);
    const day = pieces.filter((p) => p.color === sky.day).sort((a, b) => b.a1 - b.a0 - (a.a1 - a.a0))[0];
    const mid = (day.a0 + day.a1) / 2;
    const t = span24.originMs + (mid / 360) * span24.spanMs;
    // Tokyo's solar noon in late October is about 11:25 JST (02:25 UTC).
    expect(Math.abs(t - Date.UTC(2026, 9, 21, 2, 25))).toBeLessThan(40 * MIN);
    expect(solarAltitude(t, tokyo.lat, tokyo.lng)).toBeGreaterThan(30);
  });

  it('is all night on an hour face in the small hours', () => {
    const start = Date.UTC(2026, 9, 21, 17, 0); // 02:00 in Tokyo
    const pieces = skyPieces({ originMs: start, spanMs: HOUR, startMs: start }, tokyo, sky);
    expect(pieces).toEqual([{ a0: 0, a1: 360, color: sky.night }]);
  });

  it('projects gradient stops in order along the chord', () => {
    const g = skyPieces(span24, tokyo, sky).find((p) => p.stops)!;
    const axis = gradientAxis(g, 485);
    const offs = axis.stops.map((s) => s.offset);
    expect(offs[0]).toBeCloseTo(0);
    expect(offs.at(-1)).toBeCloseTo(1);
    for (let i = 1; i < offs.length; i++) expect(offs[i]).toBeGreaterThanOrEqual(offs[i - 1]);
  });
});

describe('hour marks', () => {
  it('marks every local hour of a day once', () => {
    const start = Date.UTC(2026, 9, 21, 0);
    const marks = hourMarks({ originMs: start, spanMs: 24 * HOUR, startMs: start }, 'Asia/Tokyo');
    expect(marks.map((m) => m.hour).sort((a, b) => a - b)).toEqual([...Array(24).keys()]);
    expect(marks[0]).toMatchObject({ t: start, a: 0, hour: 9 });
  });

  it('lands half-hour zones between the dial’s own hours', () => {
    // An hour face from 20:00 Berlin: Kolkata's hour turns at 20:30 Berlin, halfway round.
    const start = Date.UTC(2026, 9, 21, 18, 0);
    const marks = hourMarks({ originMs: start, spanMs: HOUR, startMs: start }, 'Asia/Kolkata');
    expect(marks).toHaveLength(1);
    expect(marks[0].a).toBeCloseTo(180);
    expect(marks[0].hour).toBe(0);
  });

  it('follows a DST change: the repeated hour shows twice', () => {
    // 1 Nov 2026 in New York: 01:00–02:00 happens twice.
    const start = Date.UTC(2026, 10, 1, 4); // 00:00 EDT
    const marks = hourMarks({ originMs: start, spanMs: 24 * HOUR, startMs: start }, 'America/New_York');
    expect(marks).toHaveLength(24);
    expect(marks.filter((m) => m.hour === 1)).toHaveLength(2);
  });
});

describe('choosing compare zones', () => {
  it('keeps two at most, never the primary, no repeats', () => {
    expect(compareList(['Asia/Tokyo', 'Asia/Tokyo', 'Europe/Berlin', 'America/New_York', 'UTC'], 'Europe/Berlin')).toEqual(['Asia/Tokyo', 'America/New_York']);
  });

  it('asks to replace one when a third is pinned', () => {
    expect(pinZone([], 'Asia/Tokyo', 'Europe/Berlin')).toEqual({ zones: ['Asia/Tokyo'], full: false });
    expect(pinZone(['Asia/Tokyo'], 'Asia/Tokyo', 'Europe/Berlin')).toEqual({ zones: ['Asia/Tokyo'], full: false });
    expect(pinZone(['Asia/Tokyo'], 'Europe/Berlin', 'Europe/Berlin').zones).toEqual(['Asia/Tokyo']);
    expect(pinZone(['Asia/Tokyo', 'America/New_York'], 'Asia/Dubai', 'Europe/Berlin')).toEqual({ zones: ['Asia/Tokyo', 'America/New_York'], full: true });
    expect(replaceZone(['Asia/Tokyo', 'America/New_York'], 'Asia/Tokyo', 'Asia/Dubai')).toEqual(['Asia/Dubai', 'America/New_York']);
  });

  it('swaps places when a compare zone becomes the primary', () => {
    expect(promoteZone(['Asia/Tokyo', 'America/New_York'], 'Asia/Tokyo', 'Europe/Berlin')).toEqual(['Europe/Berlin', 'America/New_York']);
    expect(promoteZone(['Asia/Tokyo'], 'Asia/Tokyo', 'Asia/Tokyo')).toEqual([]);
    expect(promoteZone(['Asia/Tokyo'], 'Asia/Dubai', 'Europe/Berlin')).toEqual(['Asia/Tokyo']);
  });
});
