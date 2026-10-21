import { CalculationMethod, Coordinates, PrayerTimes } from 'adhan';
import { describe, expect, it } from 'vitest';
import { solarAltitude, sunCrossings } from './sun';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Sunrise and sunset from the adhan package (an independent solar model) for a calendar date. */
function adhanSun(lat: number, lng: number, y: number, m: number, d: number) {
  const t = new PrayerTimes(new Coordinates(lat, lng), new Date(y, m - 1, d), CalculationMethod.MuslimWorldLeague());
  return { rise: +t.sunrise, set: +t.maghrib };
}

describe('solar altitude', () => {
  it('stands overhead at the equator at noon on the equinox', () => {
    // 2026-03-20, solar noon at 0° longitude is about 12:07 UTC.
    expect(solarAltitude(Date.UTC(2026, 2, 20, 12, 7), 0, 0)).toBeGreaterThan(89);
  });

  it('is far below the horizon at midnight', () => {
    expect(solarAltitude(Date.UTC(2026, 5, 21, 0, 0), 51.5, 0)).toBeLessThan(-10);
    expect(solarAltitude(Date.UTC(2026, 11, 21, 0, 0), 51.5, 0)).toBeLessThan(-55);
  });
});

describe('sunrise and sunset', () => {
  const cases: [string, number, number, number, number, number][] = [
    ['Tokyo', 35.6762, 139.6503, 2026, 10, 21],
    ['New York', 40.7128, -74.006, 2026, 6, 21],
    ['London', 51.5074, -0.1278, 2026, 12, 21],
    ['Sydney', -33.8688, 151.2093, 2026, 1, 15],
    ['Delhi', 28.6139, 77.209, 2026, 3, 1],
  ];
  for (const [name, lat, lng, y, m, d] of cases) {
    it(`agrees with adhan in ${name}`, () => {
      const ref = adhanSun(lat, lng, y, m, d);
      // Search a day around the reference sunrise.
      const ev = sunCrossings(ref.rise - 6 * 60 * MIN, ref.rise + 18 * 60 * MIN, lat, lng);
      const rise = ev.find((e) => e.kind === 'rise');
      const set = ev.find((e) => e.kind === 'set');
      expect(rise).toBeTruthy();
      expect(set).toBeTruthy();
      expect(Math.abs(rise!.at - ref.rise)).toBeLessThan(2 * MIN);
      expect(Math.abs(set!.at - ref.set)).toBeLessThan(2 * MIN);
    });
  }

  it('has no sunrise or sunset in a polar day or night', () => {
    const lat = 69.65;
    const lng = 18.96; // Tromsø
    const midsummer = Date.UTC(2026, 5, 21);
    const midwinter = Date.UTC(2026, 11, 21);
    expect(sunCrossings(midsummer, midsummer + DAY, lat, lng)).toEqual([]);
    expect(sunCrossings(midwinter, midwinter + DAY, lat, lng)).toEqual([]);
    expect(solarAltitude(midsummer, lat, lng)).toBeGreaterThan(0);
    expect(solarAltitude(midwinter + 11 * 60 * MIN, lat, lng)).toBeLessThan(0);
  });
});
