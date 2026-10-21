// One block on the bezel, after the app's DialArc.svelte: it blooms from zero sweep on a
// spring, lifts on hover, wears a lume rim when done (a band of light sweeps along it once),
// and labels itself with an icon and whole words along the arc, always upright.

import { memo, useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import type { Block } from '@/lib/day';
import { arcLength, arcPath, degFor, laneRadii, nearestTurn, polar, sectorPath } from '@/lib/geometry';
import { ICONS } from '@/lib/icons';

const SPRING = { stiffness: 170, damping: 22, mass: 1 };

export interface ArcProps {
  block: Block;
  a0: number;
  a1: number;
  lane: number;
  lanes: number;
  /** Degrees of this arc already behind the hand. */
  elapsed: number;
  current: boolean;
  past: boolean;
  hovered: boolean;
  /** Where the hand crosses the bezel; words keep clear of it. */
  handAngle: number | null;
  enterDelay: number;
  calm: boolean;
  uid: string;
  compact?: boolean;
}

const STOP = new Set(['the', 'a', 'an', 'and', '&', 'of', 'to', 'with', 'for', 'in', 'on', 'at']);

const lower = (a: number) => {
  const n = ((a % 360) + 360) % 360;
  return n > 90 && n < 270;
};

function DialArcImpl(p: ArcProps) {
  const { block, a0, a1, lane, lanes, elapsed, current, past, hovered, handAngle, enterDelay, calm, uid, compact } = p;
  const geo = laneRadii(lane, lanes);
  const s0 = useSpring(a0, SPRING);
  const s1 = useSpring(calm || enterDelay <= 0 ? a1 : a0, SPRING);
  const rOut = useSpring(geo.rOut, SPRING);
  const rIn = useSpring(geo.rIn, SPRING);
  const el = useMotionValue(elapsed);
  const mounted = useRef(false);
  const [labelled, setLabelled] = useState(calm || enterDelay <= 0);

  // Arcs bloom once, clockwise, in turn; later moves take the nearest way round.
  useEffect(() => {
    const start = nearestTurn(s0.get(), a0);
    const end = start + (a1 - a0);
    if (calm) {
      s0.jump(start);
      s1.jump(end);
      setLabelled(true);
      mounted.current = true;
      return;
    }
    if (!mounted.current && enterDelay > 0) {
      mounted.current = true;
      const t = setTimeout(() => {
        s0.set(start);
        s1.set(end);
      }, enterDelay);
      const l = setTimeout(() => setLabelled(true), enterDelay + 380);
      return () => {
        clearTimeout(t);
        clearTimeout(l);
      };
    }
    mounted.current = true;
    s0.set(start);
    s1.set(end);
    setLabelled(true);
  }, [a0, a1, calm, enterDelay, s0, s1]);

  // Becoming current rises 16 units for a moment; hover lifts 4.
  const [pulse, setPulse] = useState(0);
  const wasCurrent = useRef<boolean | null>(null);
  useEffect(() => {
    if (wasCurrent.current === false && current && !calm) {
      setPulse(16);
      const t = setTimeout(() => setPulse(0), 420);
      return () => clearTimeout(t);
    }
    wasCurrent.current = current;
  }, [current, calm]);
  useEffect(() => {
    const lift = hovered ? 6 : 0;
    if (calm) {
      rOut.jump(geo.rOut + lift + pulse);
      rIn.jump(geo.rIn);
    } else {
      rOut.set(geo.rOut + lift + pulse);
      rIn.set(geo.rIn);
    }
  }, [hovered, pulse, geo.rOut, geo.rIn, calm, rOut, rIn]);
  useEffect(() => el.set(elapsed), [elapsed, el]);

  const gapOf = (r: number) => degFor(compact ? 5 : 3.5, r);
  const body = useTransform(() => {
    const g = gapOf(rOut.get());
    const A0 = s0.get() + g;
    const A1 = Math.max(A0 + 0.3, s1.get() - g);
    return sectorPath(A0, A1, rIn.get(), rOut.get());
  });
  const spent = useTransform(() => {
    const g = gapOf(rOut.get());
    const A0 = s0.get() + g;
    const A1 = Math.max(A0 + 0.3, s1.get() - g);
    const E = Math.min(A1, A0 + Math.max(0, el.get() - g));
    return E > A0 + 0.05 ? sectorPath(A0, E, rIn.get(), rOut.get()) : '';
  });
  const rim = useTransform(() => {
    const g = gapOf(rOut.get());
    return arcPath(rOut.get() - 3.5, s0.get() + g + 0.4, Math.max(s0.get() + g + 0.8, s1.get() - g - 0.4));
  });

  // The lume charge: a band of light sweeps along the arc once when it is finished.
  const [charge, setCharge] = useState(0);
  const wasDone = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (wasDone.current === false && block.done && !calm) setCharge((c) => c + 1);
    wasDone.current = !!block.done;
  }, [block.done, calm]);

  // Three materials, no texture (the app's DialArc): your blocks are solid colour; a calendar
  // event is glass, a pale wash of its colour inside a crisp edge; a salah is soft light, a
  // lamp lit in its window, brightest at its heart, with no edge. Done mutes any of them.
  const color = `var(--c-${block.category})`;
  const glass = !!block.event && !block.salah && !block.done;
  const lamp = !!block.salah;
  const fill = block.done ? `color-mix(in srgb, ${color}, var(--d-face) var(--d-done))` : color;
  const spentFill = `color-mix(in srgb, ${color}, var(--d-bezel) var(--d-past))`;
  const hueInk = `color-mix(in srgb, ${color}, var(--glass-ink) 48%)`;
  const ink = block.done ? 'var(--d-ink)' : glass || lamp ? hueInk : `var(--on-${block.category})`;
  const edge = useTransform(() => {
    const ro = rOut.get();
    const ri = rIn.get();
    const g = gapOf(ro);
    const A0 = s0.get() + g;
    const A1 = Math.max(A0 + 0.3, s1.get() - g);
    const d = degFor(1.5, ro);
    return sectorPath(A0 + d, A1 - d, ri + 1.5, ro - 1.5);
  });

  // ---- labels (from the target geometry; they fade in once the arc has drawn) ----
  const g = degFor(compact ? 5 : 3.5, geo.rOut);
  const A0 = a0 + g;
  const A1 = Math.max(A0 + 0.3, a1 - g);
  const rMid = (geo.rOut + geo.rIn) / 2;
  const thick = geo.rOut - geo.rIn;
  let LA0 = A0;
  if (handAngle != null) {
    const h = A0 + ((((handAngle - A0) % 360) + 360) % 360);
    if (h > A0 && h < A1) LA0 = h + degFor(16, rMid);
  }
  const len = arcLength(rMid, Math.max(0, A1 - LA0));
  const iconSize = Math.min(thick * 0.5, compact ? 46 : 34);
  const showIcon = len > iconSize * 1.5;
  const fontSize = Math.min(thick * 0.34, 25);
  const midA = (LA0 + A1) / 2;
  const textRoom = len - iconSize * 1.9 - 14;
  const charW = fontSize * 0.6;
  let title = '';
  if (!compact && lanes <= 2 && textRoom >= fontSize * 2.4) {
    const max = Math.floor(textRoom / charW);
    const t = block.title.trim();
    if (t.length <= max) title = t;
    else {
      let out = '';
      for (const word of t.split(/\s+/)) {
        const next = out ? `${out} ${word}` : word;
        if (next.length > max) break;
        out = next;
      }
      // A stub that ends on a small word ("Draft the") reads worse than the word before it.
      const words = out.split(' ');
      while (words.length > 1 && STOP.has(words[words.length - 1].toLowerCase())) words.pop();
      out = words.join(' ');
      title = out.length >= 3 ? out : '';
    }
  }
  let flip = lower(midA);
  if (title) {
    const iconDeg = degFor(iconSize * 1.75, rMid);
    const textDeg = degFor(title.length * charW, rMid);
    flip = lower(LA0 + iconDeg + textDeg / 2) && lower(A1 - iconDeg - textDeg / 2);
  }
  const iconAngle = title ? (flip ? A1 - degFor(iconSize * 0.95, rMid) : LA0 + degFor(iconSize * 0.95, rMid)) : midA;
  const [ix, iy] = polar(rMid, iconAngle);
  const textD = flip
    ? arcPath(rMid + fontSize * 0.36, LA0 + degFor(10, rMid), A1 - degFor(iconSize * 1.75, rMid), true)
    : arcPath(rMid - fontSize * 0.36, LA0 + degFor(iconSize * 1.75, rMid), A1 - degFor(10, rMid));
  const Icon = ICONS[block.done ? 'check' : block.icon];
  const lampAt = polar(rMid, (A0 + A1) / 2);
  const lampR = Math.max(thick / 2, arcLength(rMid, A1 - A0) / 2) * 1.5;

  return (
    <g
      className="arc"
      data-key={block.key}
      style={{ opacity: past ? (block.done ? 0.82 : 0.55) : 1, transition: 'opacity 300ms var(--ease-out)', cursor: 'pointer' }}
    >
      {lamp && (
        <defs>
          <radialGradient id={`${uid}-lamp`} gradientUnits="userSpaceOnUse" cx={lampAt[0]} cy={lampAt[1]} r={lampR}>
            <stop offset="0" style={{ stopColor: block.done ? fill : color, stopOpacity: block.done ? 0.9 : 0.74 }} />
            <stop offset="0.55" style={{ stopColor: block.done ? fill : color, stopOpacity: block.done ? 0.6 : 0.42 }} />
            <stop offset="1" style={{ stopColor: block.done ? fill : color, stopOpacity: block.done ? 0.32 : 0.14 }} />
          </radialGradient>
        </defs>
      )}
      <motion.path d={body} fill={lamp ? `url(#${uid}-lamp)` : undefined} style={lamp ? undefined : glass ? { fill: color, fillOpacity: 'var(--d-glass)' } : { fill }} />
      {!block.done && <motion.path d={spent} style={glass || lamp ? { fill: 'var(--d-bezel)', opacity: 0.5 } : { fill: spentFill }} />}
      {glass && <motion.path d={edge} fill="none" strokeWidth={3} strokeLinejoin="round" style={{ stroke: color, pointerEvents: 'none' }} />}
      {block.done && (
        <motion.path d={rim} fill="none" strokeWidth={5} strokeLinecap="round" style={{ stroke: 'var(--d-lume)', opacity: 0.95, pointerEvents: 'none' }} />
      )}
      {charge > 0 && (
        <path key={charge} d={arcPath(rMid, A0, A1)} pathLength={1} stroke="white" strokeWidth={thick} fill="none" className="arc-charge" />
      )}
      <g style={{ opacity: labelled ? 1 : 0, transition: 'opacity 420ms var(--ease-out)', pointerEvents: 'none' }}>
        {showIcon && (
          <Icon x={ix - iconSize / 2} y={iy - iconSize / 2} width={iconSize} height={iconSize} strokeWidth={compact ? 2.4 : 2} style={{ color: ink }} aria-hidden="true" />
        )}
        {title && (
          <>
            <path id={`${uid}-tp`} d={textD} fill="none" stroke="none" />
            <text className="arc-label" fontSize={fontSize} style={{ fill: ink, opacity: block.done ? 0.75 : 1 }}>
              <textPath href={`#${uid}-tp`}>{title}</textPath>
            </text>
          </>
        )}
      </g>
    </g>
  );
}

export const DialArc = memo(DialArcImpl);
