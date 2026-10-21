// The block you are in, as a whole ring inside the face that gets eaten in countable slices,
// after the app's RemainRing.svelte: "how much is left" is a shape, not a sum.

import { degFor, polar, sectorPath } from '@/lib/geometry';
import { MINUTE } from '@/lib/time';

export function RemainRing({ start, end, now, color, free, rIn, rOut }: { start: number; end: number; now: number; color: string; free: boolean; rIn: number; rOut: number }) {
  const len = Math.max(MINUTE, end - start);
  const chunk = (len <= 60 * MINUTE ? 5 : len <= 180 * MINUTE ? 15 : 30) * MINUTE;
  const n = Math.ceil(len / chunk - 1e-9);
  const left = Math.min(len, Math.max(0, end - now));
  const remDeg = (left / len) * 360;
  const gap = degFor(7, (rIn + rOut) / 2);
  const fill = free ? 'var(--d-track)' : color;
  const opacity = free ? 0.42 : 0.82;
  const [ex, ey] = polar((rIn + rOut) / 2, remDeg);
  const slices = [];
  for (let k = 0; k < n; k++) {
    const a0 = ((k * chunk) / len) * 360;
    const a1 = (Math.min(len, (k + 1) * chunk) / len) * 360;
    const fillTo = Math.min(a1, remDeg);
    slices.push(
      <g key={k} className="remain-slice" style={{ animationDelay: `${k * 28}ms` }}>
        <path d={sectorPath(a0 + gap / 2, a1 - gap / 2, rIn, rOut)} fill="none" strokeWidth={2} style={{ stroke: 'var(--d-track)', strokeOpacity: 0.35 }} />
        {fillTo > a0 + gap && <path d={sectorPath(a0 + gap / 2, fillTo - (fillTo >= a1 - 0.01 ? gap / 2 : 0), rIn, rOut)} style={{ fill, fillOpacity: opacity }} />}
      </g>,
    );
  }
  return (
    <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
      {slices}
      {left > 0 && (
        <>
          <circle cx={ex} cy={ey} r={(rOut - rIn) / 2 + 3} style={{ fill: 'var(--d-face)' }} />
          <circle cx={ex} cy={ey} r={(rOut - rIn) / 2 - 4} style={{ fill }} />
        </>
      )}
    </g>
  );
}
