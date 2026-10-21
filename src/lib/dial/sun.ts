// Where the sun is, anywhere, at any instant: a small low-precision solar model (the USNO
// almanac approximation, about a minute of arc), enough to shade day, twilight and night for
// a city on the world-clock rings. No lookup service; it is all arithmetic.

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
/** 2000-01-01 12:00 UTC (J2000.0) in epoch days. */
const J2000 = 10957.5;

/** The sun's apparent altitude above the horizon (degrees) at `ms`, seen from lat/lng (degrees, east positive). */
export function solarAltitude(ms: number, lat: number, lng: number): number {
  const d = ms / DAY_MS - J2000;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD / 15;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  // Equation of time (hours), folded into [-12, 12).
  let eqt = ((q / 15 - ra) % 24 + 24) % 24;
  if (eqt >= 12) eqt -= 24;
  const utcHours = (((ms % DAY_MS) + DAY_MS) % DAY_MS) / 3_600_000;
  const hourAngle = (utcHours + lng / 15 + eqt - 12) * 15 * RAD;
  const phi = lat * RAD;
  const s = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

/** Sunrise and sunset use the sun's upper edge with standard refraction. */
export const HORIZON = -0.833;

export interface SunEvent {
  at: number;
  kind: 'rise' | 'set';
}

/**
 * Every moment in [fromMs, toMs) where the sun crosses `threshold` degrees: 'rise' going up,
 * 'set' going down. Polar days and nights simply have none.
 */
export function sunCrossings(fromMs: number, toMs: number, lat: number, lng: number, threshold = HORIZON): SunEvent[] {
  const step = 10 * 60_000;
  const out: SunEvent[] = [];
  let t0 = fromMs;
  let h0 = solarAltitude(t0, lat, lng) - threshold;
  while (t0 < toMs) {
    const t1 = Math.min(t0 + step, toMs);
    const h1 = solarAltitude(t1, lat, lng) - threshold;
    if ((h0 < 0 && h1 >= 0) || (h0 >= 0 && h1 < 0)) {
      // Bisect to the second.
      let a = t0;
      let b = t1;
      let ha = h0;
      while (b - a > 1000) {
        const m = (a + b) / 2;
        const hm = solarAltitude(m, lat, lng) - threshold;
        if (ha < 0 === hm < 0) {
          a = m;
          ha = hm;
        } else b = m;
      }
      out.push({ at: Math.round((a + b) / 2), kind: h0 < 0 ? 'rise' : 'set' });
    }
    t0 = t1;
    h0 = h1;
  }
  return out;
}
