// A small world clock, after the app's day/night rings: your city and two others on one
// 24-hour face, noon on top, each ring painted with that city's real daylight. Point at the
// ring to read every city's time at that moment.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useMounted } from '@/hooks/useMounted';
import { useNow } from '@/hooks/useNow';
import { useTheme } from '@/hooks/useTheme';
import { angleOf, C, polar, radiusOf, sectorPath } from '@/lib/geometry';
import { aheadLabel, CITY_CHOICES, defaultCompare, localZone, placeOf, skyColor, skyFor, solarAltitude, timeIn, weekdayIn } from '@/lib/sky';
import { HOUR, MINUTE, prefers12h, startOfDay } from '@/lib/time';
import { cn } from '@/lib/utils';

/** Which ring a row is: three circles, the row's own one drawn strong. */
function RingGlyph({ which }: { which: number }) {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px] shrink-0" aria-hidden="true">
      {[8.5, 6, 3.5].map((r, i) => (
        <circle key={r} cx="10" cy="10" r={r} fill="none" strokeWidth={i === which ? 2.4 : 1.2} style={{ stroke: i === which ? 'var(--ink)' : 'var(--line-strong)' }} />
      ))}
    </svg>
  );
}

const RINGS = [
  { rIn: 420, rOut: 478 },
  { rIn: 352, rOut: 410 },
  { rIn: 284, rOut: 342 },
];

export function WorldClock() {
  const mounted = useMounted();
  const now = useNow(MINUTE);
  const [mode] = useTheme();
  const [zones, setZones] = useState<string[] | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const own = useMemo(() => (mounted ? localZone() : 'UTC'), [mounted]);
  const hour12 = useMemo(() => (mounted ? prefers12h() : false), [mounted]);

  useEffect(() => {
    if (now != null && !zones) setZones(defaultCompare(own, now));
  }, [now, zones, own]);

  const t = scrub ?? now;
  const places = useMemo(() => (zones ? [...zones.map((z) => placeOf(z)), { ...placeOf(own), city: 'Your time' }] : []), [zones, own]);
  const sky = skyFor(mode === 'dark');
  const day = now == null ? 0 : startOfDay(now);
  // 24-hour face, noon on top: the angle of a moment of your day.
  const toDeg = (ms: number) => ((((ms - (day - 12 * HOUR)) / (24 * HOUR)) * 360) % 360 + 360) % 360;

  const painted = useMemo(() => {
    if (now == null) return [];
    return places.map((p, ri) => {
      const ring = RINGS[ri];
      const out: { d: string; fill: string }[] = [];
      for (let k = 0; k < 96; k++) {
        const t0 = day + k * 15 * MINUTE;
        const a0 = toDeg(t0);
        const alt = solarAltitude(t0 + 7.5 * MINUTE, p.lat, p.lng);
        out.push({ d: sectorPath(a0 - 0.15, a0 + 3.75 + 0.15, ring.rIn, ring.rOut), fill: skyColor(alt, sky) });
      }
      return out;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, day, mode, now == null]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const m = svg.current?.getScreenCTM();
    if (!m || now == null) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    if (radiusOf(p.x, p.y) < 250) return setScrub(null);
    const deg = angleOf(p.x, p.y);
    setScrub(day + ((((deg - 180) % 360) + 360) % 360) / 360 * 24 * HOUR);
  };

  const hand = t == null ? 0 : toDeg(t);
  const toggle = (z: string) =>
    setZones((cur) => {
      const list = cur ?? [];
      if (list.includes(z)) return list.length > 1 ? list.filter((x) => x !== z) : list;
      return list.length >= 2 ? [list[1], z] : [...list, z];
    });

  return (
    <div className="grid gap-5">
      <div className="mx-auto w-full max-w-[300px]">
        <svg
          ref={svg}
          viewBox="0 0 1000 1000"
          className="block w-full touch-none"
          role="img"
          aria-label={places.length ? `World clock: ${places.map((p) => `${p.city} ${t != null ? timeIn(t, p.zone, hour12) : ''}`).join(', ')}` : 'World clock'}
          onPointerMove={onMove}
          onPointerLeave={() => setScrub(null)}
        >
          <circle cx={C} cy={C} r={492} style={{ fill: 'var(--d-bezel)' }} />
          {RINGS.map((r, i) => (
            <circle key={i} cx={C} cy={C} r={(r.rIn + r.rOut) / 2} fill="none" strokeWidth={r.rOut - r.rIn} style={{ stroke: 'var(--d-face)' }} />
          ))}
          {painted.map((ring, ri) => (
            <g key={ri}>
              {ring.map((s, k) => (
                <path key={k} d={s.d} fill={s.fill} />
              ))}
            </g>
          ))}
          <circle cx={C} cy={C} r={274} style={{ fill: 'var(--d-face)' }} />
          {[0, 6, 12, 18].map((h) => {
            const [x, y] = polar(232, ((h + 12) % 24) * 15);
            return (
              <text key={h} x={x} y={y} className="dial-numeral" fontSize={42} textAnchor="middle" dominantBaseline="central" style={{ fill: 'var(--d-ink)', opacity: 0.55 }}>
                {h}
              </text>
            );
          })}
          {t != null && (
            <g style={{ transform: `rotate(${hand}deg)`, transformOrigin: '500px 500px', transformBox: 'view-box', transition: scrub == null ? 'transform 0.8s var(--ease-out)' : 'none' }}>
              <line x1={C} y1={C - 278} x2={C} y2={C - 492} strokeWidth={4} style={{ stroke: scrub == null ? 'var(--d-signal)' : 'var(--d-ink)' }} />
            </g>
          )}
          {t != null &&
            places.map((p, i) => {
              const r = RINGS[i];
              const [x, y] = polar((r.rIn + r.rOut) / 2, hand);
              const up = solarAltitude(t, p.lat, p.lng) > -0.833;
              const Icon = up ? Sun : Moon;
              return (
                <g key={p.zone + i} style={{ pointerEvents: 'none' }}>
                  <circle cx={x} cy={y} r={24} fill={up ? sky.sun : sky.moon} stroke="var(--d-face)" strokeWidth={5} />
                  <Icon x={x - 14} y={y - 14} width={28} height={28} strokeWidth={2.6} color={up ? '#5a3a00' : '#283273'} aria-hidden="true" />
                </g>
              );
            })}
          {t != null && (
            <g style={{ pointerEvents: 'none' }}>
              <text x={C} y={C - 34} textAnchor="middle" fontSize={92} className="dial-numeral tnum" style={{ fill: 'var(--d-ink)' }}>
                {timeIn(t, own, hour12)}
              </text>
              <text x={C} y={C + 52} textAnchor="middle" fontSize={34} style={{ fill: 'var(--d-ink)', opacity: 0.62, fontWeight: 500 }}>
                {scrub == null ? 'Your time now' : 'Your time'}
              </text>
            </g>
          )}
        </svg>
      </div>
      <ul className="grid gap-1.5" aria-live="polite">
        {places.map((p, i) => {
          const up = t != null && solarAltitude(t, p.lat, p.lng) > -0.833;
          return (
            <li key={p.zone + i} className="flex items-center gap-3 rounded-md bg-sunken/70 px-3 py-2 text-[14px]">
              <RingGlyph which={i} />
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{i === 2 ? `${placeOf(own).city} · you` : p.city}</span>
              <span className="text-[12.5px] text-ink-3">{t != null && i !== 2 ? aheadLabel(t, p.zone, own) : t != null ? weekdayIn(t, p.zone) : ''}</span>
              <span className="tnum w-[64px] text-right font-medium text-ink">{t != null ? timeIn(t, p.zone, hour12) : '--:--'}</span>
              {up ? <Sun className="size-4 text-c-routine" aria-label="day" /> : <Moon className="size-4 text-c-rest" aria-label="night" />}
            </li>
          );
        })}
      </ul>
      <div>
        <p className="mb-2 text-[13px] text-ink-3">Compare with</p>
        <div className="flex flex-wrap gap-1.5">
          {CITY_CHOICES.filter((c) => c.zone !== own).slice(0, 8).map((c) => {
            const on = zones?.includes(c.zone);
            return (
              <button
                key={c.zone}
                type="button"
                aria-pressed={!!on}
                onClick={() => toggle(c.zone)}
                className={cn(
                  'h-7 rounded-full border px-2.5 text-[12.5px] transition-colors duration-150',
                  on ? 'border-[color-mix(in_srgb,var(--c-learn)_60%,transparent)] bg-[color-mix(in_srgb,var(--c-learn)_14%,transparent)] text-ink' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink',
                )}
              >
                {c.city}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
