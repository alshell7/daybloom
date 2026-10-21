// The Daybloom dial for the web, drawn like the app's Dial.svelte in the same 1000-unit
// viewBox with the same radii: bezel inserts for blocks, a minute track drawn as one path,
// thin numerals, a now-hand that steps once a minute, a seconds bead on an HTML layer, and
// the breathing aura (opacity only). Sweep the bezel to paint a block; click one to finish it.
// Colours come from CSS variables, so the page theme (or a gallery swatch) restyles it.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { Moon, Sun } from 'lucide-react';
import type { Block } from '@/lib/day';
import { SLEEP, WAKE, window12, window24, window60 } from '@/lib/day';
import { angleOf, C, laneRadii, MAX_LANES, nearestTurn, polar, R, radiusOf, sectorPath } from '@/lib/geometry';
import { atMinutes, formatDuration, formatTime, MINUTE } from '@/lib/time';
import { cn } from '@/lib/utils';
import { DialArc } from './DialArc';
import { RemainRing } from './RemainRing';

export type DialMode = '12' | '24' | '60' | 'cycles';

const FACES: Record<DialMode, { labels: (string | number)[]; ticks: number; majorEvery: number }> = {
  '12': { labels: [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], ticks: 60, majorEvery: 5 },
  '24': { labels: [12, 14, 16, 18, 20, 22, 0, 2, 4, 6, 8, 10], ticks: 96, majorEvery: 4 },
  '60': { labels: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], ticks: 60, majorEvery: 5 },
  cycles: { labels: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], ticks: 60, majorEvery: 5 },
};

const STEP = 5 * MINUTE;
const snap = (t: number) => Math.round(t / STEP) * STEP;

interface Props {
  mode: DialMode;
  blocks: Block[];
  now: number | null;
  hour12: boolean;
  calm: boolean;
  label: string;
  interactive?: boolean;
  compact?: boolean;
  showSeconds?: boolean;
  showRemain?: boolean;
  /** Alef lives in the middle: the centre becomes its round screen. */
  screen?: boolean;
  onCreate?: (r: { startMs: number; endMs: number }) => void;
  onToggle?: (key: string, at: { x: number; y: number }) => void;
  children?: ReactNode;
  className?: string;
}

function assignLanes(list: Block[]) {
  const lanes: number[] = [];
  const out = new Map<string, number>();
  for (const b of list) {
    let lane = lanes.findIndex((end) => end <= b.startMs);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(b.endMs);
    } else lanes[lane] = b.endMs;
    out.set(b.key, lane);
  }
  return out;
}

export function Dial({ mode, blocks, now, hour12, calm, label, interactive = false, compact = false, showSeconds = true, showRemain = true, screen = false, onCreate, onToggle, children, className }: Props) {
  const uid = useId().replace(/:/g, '');
  const face = FACES[mode];
  const fine = mode === '60' || mode === 'cycles';
  const minuteNow = now == null ? null : now - (now % MINUTE);
  const handTime = now == null ? null : fine ? now - (now % 5000) : minuteNow!;
  const w = useMemo(() => {
    if (minuteNow == null) return null;
    return mode === '12' ? window12(minuteNow) : mode === '24' ? window24(minuteNow) : window60(minuteNow);
  }, [mode, minuteNow]);
  const toDeg = (ms: number) => (w ? ((ms - w.originMs) / w.spanMs) * 360 : 0);

  // ---- drag to paint ----
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<null | { anchor: number; lastDeg: number; acc: number; moved: boolean; key: string | null; preview: { startMs: number; endMs: number } }>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // On the hour face the block shown as the wedge stays off the bezel, so it is not said twice.
  const wedgeKey = useMemo(() => {
    if (mode !== '60' || now == null) return null;
    const live = blocks.filter((b) => !b.done && b.startMs <= now && b.endMs > now).sort((a, b) => a.endMs - b.endMs)[0];
    const target = live ?? blocks.filter((b) => !b.done && b.startMs > now && b.startMs < now + 3_600_000).sort((a, b) => a.startMs - b.startMs)[0];
    return target?.key ?? null;
  }, [mode, now, blocks]);

  // ---- blocks on the bezel ----
  const arcs = useMemo(() => {
    if (!w || handTime == null) return [];
    const list = blocks
      .filter((b) => mode !== 'cycles' && b.key !== wedgeKey && b.endMs > w.startMs && b.startMs < w.endMs && (!fine || (b.endMs > handTime && !b.done)))
      .sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs);
    const lanes = assignLanes(list);
    const cluster = new Map<string, number>();
    let group: string[] = [];
    let groupEnd = -Infinity;
    let groupMax = 0;
    const close = () => group.forEach((k) => cluster.set(k, groupMax + 1));
    for (const b of list) {
      if (b.startMs >= groupEnd) {
        close();
        group = [];
        groupMax = 0;
      }
      group.push(b.key);
      groupEnd = Math.max(groupEnd, b.endMs);
      groupMax = Math.max(groupMax, lanes.get(b.key) ?? 0);
    }
    close();
    return list.map((b) => {
      const s = Math.max(b.startMs, w.startMs, fine ? handTime : -Infinity);
      const e = Math.min(b.endMs, w.endMs);
      const elapsedMs = Math.min(Math.max(handTime - s, 0), e - s);
      return {
        block: b,
        a0: ((s - w.originMs) / w.spanMs) * 360,
        a1: ((e - w.originMs) / w.spanMs) * 360,
        lane: lanes.get(b.key) ?? 0,
        lanes: cluster.get(b.key) ?? 1,
        elapsed: (elapsedMs / w.spanMs) * 360,
        current: !b.done && b.startMs <= handTime && b.endMs > handTime,
        past: b.endMs <= handTime,
      };
    });
  }, [blocks, w, handTime, fine, mode, wedgeKey]);

  // Only the first paint staggers; blocks added later draw on at once.
  const booted = useRef(false);
  const bootDelay = (i: number) => (booted.current ? 0 : 160 + i * 55);
  const hasArcs = arcs.length > 0;
  useEffect(() => {
    if (!hasArcs || booted.current) return;
    const t = setTimeout(() => (booted.current = true), 30);
    return () => clearTimeout(t);
  }, [hasArcs]);

  // ---- the hand: steps once a minute (every 5 s on the hour face), the short way round ----
  const handRef = useRef(0);
  if (handTime != null) handRef.current = nearestTurn(handRef.current, toDeg(handTime));
  const handAngle = handRef.current;

  const elapsedSector = w && handTime != null && !fine ? sectorPath(toDeg(w.startMs), toDeg(Math.min(handTime, w.endMs)), R.bezelIn, R.bezelOut) : '';

  const sleepSectors = useMemo(() => {
    if (!w || fine) return [];
    const out: { d: string; mid: number; long: boolean }[] = [];
    for (const off of [-1, 0, 1]) {
      const base = w.startMs + off * 24 * 3_600_000;
      const s = atMinutes(base, SLEEP);
      const wake = atMinutes(base + 24 * 3_600_000, WAKE);
      const a = Math.max(s, w.startMs);
      const b = Math.min(wake, w.endMs);
      if (b - a > 10 * MINUTE) out.push({ d: sectorPath(toDeg(a), toDeg(b), R.bezelIn, R.bezelOut), mid: (toDeg(a) + toDeg(b)) / 2, long: b - a >= 3 * 3_600_000 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, fine]);

  const trackPath = useMemo(() => {
    let d = '';
    for (let i = 0; i < face.ticks; i++) {
      const a = (i * 360) / face.ticks;
      const major = i % face.majorEvery === 0;
      if (compact && !major) continue;
      const [x0, y0] = polar(R.trackOut, a);
      const [x1, y1] = polar(major ? R.trackMajor : R.trackMinor, a);
      d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  }, [face, compact]);
  const majorPath = useMemo(() => {
    let d = '';
    for (let i = 0; i < face.ticks; i += face.majorEvery) {
      const a = (i * 360) / face.ticks;
      const [x0, y0] = polar(R.trackOut, a);
      const [x1, y1] = polar(R.trackMajor + 4, a);
      d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  }, [face]);
  const numerals = face.labels.map((l, i) => ({ label: String(l), angle: (i * 360) / face.labels.length })).filter((_, i) => !compact || i % 3 === 0);

  // ---- the ring inside the face: the block you're in, eaten as it is spent ----
  const remain = useMemo(() => {
    if (!showRemain || fine || now == null || screen) return null;
    const live = blocks.filter((b) => !b.done && b.startMs <= now && b.endMs > now).sort((a, b) => a.endMs - b.endMs)[0];
    if (live) return { start: live.startMs, end: live.endMs, color: `var(--c-${live.category})`, free: false };
    const next = blocks.filter((b) => !b.done && b.startMs > now).sort((a, b) => a.startMs - b.startMs)[0];
    if (!next || next.startMs - now > 3 * 3_600_000) return null;
    const prevEnd = Math.max(...blocks.filter((b) => b.endMs <= now).map((b) => b.endMs), next.startMs - 3 * 3_600_000, now - 6 * 3_600_000);
    return { start: Math.min(prevEnd, now), end: next.startMs, color: 'var(--d-track)', free: true };
  }, [blocks, now, fine, showRemain, screen]);

  // ---- the hour face: the current block (or the next) as a shrinking wedge; on Cycles, the
  // focus rounds of a session that began 10 minutes ago, with their breaks ----
  const wedges = useMemo(() => {
    if (!fine || now == null || !w) return [];
    const limit = now + w.spanMs - MINUTE;
    if (mode === 'cycles') {
      const out: { d: string; color: string; opacity: number }[] = [];
      let t = now - (now % MINUTE) - 10 * MINUTE;
      for (let i = 0; i < 6 && t < limit; i++) {
        const focus = i % 2 === 0;
        const len = (focus ? 25 : 5) * MINUTE;
        const s = Math.max(now, t);
        const e = Math.min(t + len, limit);
        if (e > s) out.push({ d: sectorPath(toDeg(s), toDeg(e), R.wedgeIn, R.wedgeOut), color: focus ? 'var(--c-focus)' : 'var(--c-rest)', opacity: focus ? (i === 0 ? 0.88 : 0.5) : 0.4 });
        t += len;
      }
      return out;
    }
    const live = blocks.filter((b) => !b.done && b.startMs <= now && b.endMs > now).sort((a, b) => a.endMs - b.endMs)[0];
    const target = live ?? blocks.filter((b) => !b.done && b.startMs > now && b.startMs < now + 3_600_000).sort((a, b) => a.startMs - b.startMs)[0];
    if (!target) return [];
    const s = Math.max(now, target.startMs);
    const e = Math.min(target.endMs, limit);
    if (e <= s) return [];
    return [{ d: sectorPath(toDeg(s), toDeg(e), R.wedgeIn, R.wedgeOut), color: `var(--c-${target.category})`, opacity: 0.88 }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fine, now, w, blocks, mode]);

  // ---- pointer ----
  function local(e: { clientX: number; clientY: number }) {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: C, y: C };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function timeAt(deg: number) {
    if (!w) return 0;
    let t = w.originMs + (deg / 360) * w.spanMs;
    while (t < w.startMs) t += w.spanMs;
    while (t >= w.startMs + w.spanMs) t -= w.spanMs;
    return t;
  }
  function onDown(e: RPointerEvent<SVGSVGElement>) {
    if (!interactive || !w || e.button !== 0) return;
    const { x, y } = local(e);
    const r = radiusOf(x, y);
    if (r < R.bezelIn - 30 || r > R.case + 6) return;
    const deg = angleOf(x, y);
    const t = snap(timeAt(deg));
    const key = (e.target as Element).closest('[data-key]')?.getAttribute('data-key') ?? null;
    setDrag({ anchor: t, lastDeg: deg, acc: 0, moved: false, key, preview: { startMs: t, endMs: t } });
    svg.current?.setPointerCapture(e.pointerId);
  }
  function onMove(e: RPointerEvent<SVGSVGElement>) {
    if (!drag || !w) return;
    const { x, y } = local(e);
    const deg = angleOf(x, y);
    const acc = drag.acc + nearestTurn(drag.lastDeg, deg) - drag.lastDeg;
    const moved = drag.moved || Math.abs(acc) > 1.6;
    const end = snap(drag.anchor + (acc / 360) * w.spanMs);
    const s = Math.min(drag.anchor, end);
    const en = Math.min(Math.max(drag.anchor, end), s + w.spanMs - STEP);
    setDrag({ ...drag, lastDeg: deg, acc, moved, preview: { startMs: s, endMs: en } });
  }
  function onUp(e: RPointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    try {
      svg.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!d.moved) {
      if (d.key) onToggle?.(d.key, { x: e.clientX, y: e.clientY });
      else onCreate?.({ startMs: d.anchor, endMs: d.anchor + 30 * MINUTE });
    } else if (d.preview.endMs - d.preview.startMs >= STEP) onCreate?.(d.preview);
  }

  const showGhost = !!drag?.moved && drag.preview.endMs > drag.preview.startMs;
  const ghostPath = showGhost ? sectorPath(toDeg(drag!.preview.startMs), toDeg(drag!.preview.endMs), laneRadii(0, 1).rIn, laneRadii(0, 1).rOut) : '';
  const dragLabel = showGhost ? { text: formatDuration(drag!.preview.endMs - drag!.preview.startMs), at: polar(R.bezelIn - 46, toDeg(drag!.preview.endMs)) } : null;

  // ---- hover card ----
  const tipArc = hovered && !drag ? arcs.find((a) => a.block.key === hovered) : null;
  const tip = tipArc
    ? (() => {
        const [x, y] = polar(R.bezelOut + 12, (tipArc.a0 + tipArc.a1) / 2);
        const px = x / 10;
        const py = y / 10;
        return { px, py, tx: px < 40 ? '0%' : px > 60 ? '-100%' : '-50%', ty: py < 40 ? '0%' : py > 60 ? '-100%' : '-50%', b: tipArc.block };
      })()
    : null;

  // The block under the hand breathes: a conic halo just outside the rim (opacity only).
  const aura = arcs.find((a) => a.current && !a.past);
  const night = handTime != null && (() => {
    const d = new Date(handTime);
    const m = d.getHours() * 60 + d.getMinutes();
    return m >= SLEEP || m < WAKE;
  })();
  const secondsAngle = now == null ? 0 : Math.floor((now % 60_000) / 1000) * 6;
  const minuteKey = now == null ? 0 : Math.floor(now / 60_000);

  return (
    <div className={cn('dial-wrap relative aspect-square w-full select-none', className)} style={{ containerType: 'inline-size' }}>
      {aura && (
        <div
          className="dial-aura motion-loop"
          style={{ ['--a0' as string]: `${aura.a0}deg`, ['--sweep' as string]: `${Math.max(4, aura.a1 - aura.a0)}deg`, ['--c' as string]: `var(--c-${aura.block.category})` }}
          aria-hidden="true"
        />
      )}
      <svg
        ref={svg}
        viewBox="0 0 1000 1000"
        className={cn('relative block size-full overflow-visible', interactive && 'touch-none', drag && 'cursor-grabbing')}
        role="img"
        aria-label={label}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <defs>
          <radialGradient id={`${uid}-depth`} cx="50%" cy="42%" r="62%">
            <stop offset="0%" stopColor="white" style={{ stopOpacity: 'var(--d-depth)' }} />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          {screen && (
            <>
              <radialGradient id={`${uid}-well`} cx="50%" cy="40%" r="60%">
                <stop offset="0%" style={{ stopColor: 'var(--s-well)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--s-edge)' }} />
              </radialGradient>
              <linearGradient id={`${uid}-shade`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--s-shade-top)' }} />
                <stop offset="55%" style={{ stopColor: 'var(--s-shade-top)', stopOpacity: 0 }} />
                <stop offset="100%" style={{ stopColor: 'var(--s-shade-bottom)' }} />
              </linearGradient>
              <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="0.7" y2="0.9">
                <stop offset="0%" stopColor="white" style={{ stopOpacity: 'var(--s-sheen)' }} />
                <stop offset="45%" stopColor="white" stopOpacity="0.02" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </linearGradient>
            </>
          )}
        </defs>

        {/* bezel */}
        <circle cx={C} cy={C} r={R.bezelOut + 8} style={{ fill: 'var(--d-bezel)' }} />
        {sleepSectors.map((s, i) => (
          <path key={i} d={s.d} style={{ fill: 'var(--d-sleep)' }} />
        ))}
        {elapsedSector && <path d={elapsedSector} style={{ fill: 'var(--d-ink)', opacity: 'var(--d-film)' }} />}
        {numerals.map((n) => {
          const [x, y] = polar((R.bezelIn + R.bezelOut) / 2, n.angle);
          return <circle key={n.angle} cx={x} cy={y} r={compact ? 7 : 4.5} style={{ fill: 'var(--d-track)', opacity: 0.45 }} />;
        })}

        {/* face */}
        <circle cx={C} cy={C} r={R.bezelIn - 8} style={{ fill: 'var(--d-face)' }} />
        <circle cx={C} cy={C} r={R.bezelIn - 8} fill={`url(#${uid}-depth)`} />
        <path d={trackPath} strokeWidth={compact ? 5 : 3} strokeLinecap="round" style={{ stroke: 'var(--d-track)' }} />
        <path d={majorPath} strokeWidth={compact ? 7 : 5} strokeLinecap="round" style={{ stroke: 'var(--d-lume)', opacity: 'var(--d-lume-major)' }} />

        {screen && (
          <g aria-hidden="true">
            <circle cx={C} cy={C} r={279} style={{ fill: 'var(--s-bezel)' }} />
            <circle cx={C} cy={C} r={272} fill={`url(#${uid}-well)`} />
            <circle cx={C} cy={C} r={269} fill="none" strokeWidth={6} stroke={`url(#${uid}-shade)`} />
            <ellipse cx={C - 272 * 0.18} cy={C - 272 * 0.46} rx={272 * 0.62} ry={272 * 0.36} fill={`url(#${uid}-sheen)`} transform={`rotate(-18 ${C} ${C})`} />
          </g>
        )}

        {wedges.map((wg, i) => (
          <path key={i} d={wg.d} style={{ fill: wg.color, opacity: wg.opacity }} />
        ))}

        <g key={mode} className="dial-numerals">
          {numerals.map((n) => {
            const [x, y] = polar(compact ? R.numerals - 22 : R.numerals, n.angle);
            return (
              <text key={n.label + n.angle} x={x} y={y} className="dial-numeral" fontSize={compact ? 64 : 40} dominantBaseline="central" textAnchor="middle" style={{ fill: 'var(--d-ink)' }}>
                {n.label}
              </text>
            );
          })}
        </g>

        {!compact &&
          sleepSectors
            .filter((s) => s.long)
            .map((s, i) => {
              const [x, y] = polar((R.bezelIn + R.bezelOut) / 2, s.mid);
              return <Moon key={i} x={x - 13} y={y - 13} width={26} height={26} strokeWidth={2} style={{ color: 'var(--d-track)' }} aria-hidden="true" />;
            })}

        {remain && now != null && <RemainRing {...remain} now={now} rIn={compact ? 196 : 222} rOut={compact ? 232 : 262} />}

        {/* blocks */}
        <g onPointerOver={(e) => setHovered((e.target as Element).closest('[data-key]')?.getAttribute('data-key') ?? null)} onPointerLeave={() => setHovered(null)}>
          {arcs
            .filter((a) => a.lane < MAX_LANES)
            .map((a, i) => (
              <DialArc
                key={a.block.key}
                uid={`${uid}-${i}`}
                block={a.block}
                a0={a.a0}
                a1={a.a1}
                lane={a.lane}
                lanes={a.lanes}
                elapsed={a.elapsed}
                current={a.current}
                past={a.past}
                hovered={hovered === a.block.key && !drag}
                handAngle={handTime != null && !fine ? toDeg(handTime) : null}
                enterDelay={bootDelay(i)}
                calm={calm}
                compact={compact}
              />
            ))}
        </g>

        {showGhost && (
          <g style={{ pointerEvents: 'none' }}>
            <path d={ghostPath} style={{ fill: 'var(--d-ink)', opacity: 0.16 }} />
            <path d={ghostPath} fill="none" strokeWidth={2.5} strokeDasharray="8 8" style={{ stroke: 'var(--d-ink)', opacity: 0.55 }} />
          </g>
        )}
        {dragLabel && (
          <g transform={`translate(${dragLabel.at[0]} ${dragLabel.at[1]})`} style={{ pointerEvents: 'none' }}>
            <rect x={-62} y={-27} width={124} height={54} rx={27} style={{ fill: 'var(--d-ink)' }} />
            <text y={2} fontSize={28} textAnchor="middle" dominantBaseline="central" className="dial-numeral strong" style={{ fill: 'var(--d-face)' }}>
              {dragLabel.text}
            </text>
          </g>
        )}

        {/* now hand: thick between the numerals and the bezel; only a hairline crosses blocks */}
        {handTime != null && (
          <g className="dial-hand" style={{ transform: `rotate(${handAngle}deg)` }}>
            <line x1={C} y1={C - R.trackMajor - 6} x2={C} y2={C - R.bezelIn + 4} strokeWidth={compact ? 12 : 8} strokeLinecap="round" style={{ stroke: 'var(--d-signal)' }} />
            <line x1={C} y1={C - R.bezelIn + 4} x2={C} y2={C - R.bezelOut - 4} strokeWidth={compact ? 4 : 2.5} style={{ stroke: 'var(--d-signal)' }} />
            {mode === '24' && !compact ? (
              <>
                <circle cx={C} cy={C - R.marker + 2} r={17} style={{ fill: 'var(--d-signal)' }} />
                {night ? (
                  <Moon x={C - 11} y={C - R.marker - 9} width={22} height={22} strokeWidth={2.4} color="white" aria-hidden="true" />
                ) : (
                  <Sun x={C - 11} y={C - R.marker - 9} width={22} height={22} strokeWidth={2.4} color="white" aria-hidden="true" />
                )}
              </>
            ) : (
              <path d={`M${C - 16} ${C - R.marker - 4}L${C + 16} ${C - R.marker - 4}L${C} ${C - R.bezelOut - 4}Z`} style={{ fill: 'var(--d-signal)' }} />
            )}
          </g>
        )}
      </svg>

      {now != null && showSeconds && !calm && (
        <div key={minuteKey} className="dial-seconds" style={{ transform: `rotate(${secondsAngle}deg)` }} aria-hidden="true">
          <i />
        </div>
      )}

      {tip && (
        <div className="dial-tip" style={{ left: `${tip.px}%`, top: `${tip.py}%`, translate: `${tip.tx} ${tip.ty}` }} role="tooltip">
          <span className="dial-tip-dot" style={{ background: `var(--c-${tip.b.category})` }} />
          <span className="font-medium text-ink">{tip.b.title}</span>
          <span className="tnum text-ink-3">
            {formatTime(tip.b.startMs, hour12)}–{formatTime(tip.b.endMs, hour12)}
          </span>
          {tip.b.done && <span className="text-ink-3">· done</span>}
          {tip.b.event && <span className="text-ink-3">· calendar</span>}
        </div>
      )}

      {children && <div className={cn('dial-readout', screen && 'on-screen')}>{children}</div>}
    </div>
  );
}
