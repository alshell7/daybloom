// The genie: a panel pours out of the button that opened it, and back into it on close, like
// macOS's minimise. A wave narrows the panel's outline toward the button (the edge nearest it
// first, in a soft S-curve), then the whole of it slides and squeezes in. Clip-path and
// transform only, one-shot.

import { cubicInOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface GenieShape {
  /** The outline, as polygon points in the panel's own coordinates. */
  points: [number, number][];
  /** Slide toward the button (px) and squeeze (scale) at the edge nearest it. */
  dx: number;
  dy: number;
  sy: number;
  opacity: number;
  /** Where the squeeze is anchored: the top or bottom edge. */
  origin: 'top' | 'bottom';
}

/**
 * The shape at `k` (0 = open, 1 = gone into the button). `w`/`h`: the panel's size; `tx`/`ty`:
 * the button's centre and `tw` its width, all relative to the panel's top-left. Pure.
 */
export function genieShape(k: number, w: number, h: number, tx: number, ty: number, tw = 28, n = 14): GenieShape {
  const top = ty < h / 2;
  // A button off to the side: the funnel's tip stays inside the panel and the whole shape
  // slides over to the button as it goes in.
  const tip = Math.max(tw / 2, Math.min(w - tw / 2, tx));
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n; // 0 = the edge nearest the button
    const p = smooth(clamp(k * 2.25 - s * 1.25));
    const hw = lerp(w / 2, tw / 2, p);
    const cx = lerp(w / 2, tip, p);
    const y = top ? s * h : h - s * h;
    left.push([cx - hw, y]);
    right.push([cx + hw, y]);
  }
  const q = smooth(clamp((k - 0.38) / 0.62));
  const edge = top ? 0 : h;
  return {
    points: [...left, ...right.reverse()],
    dx: q * (tx - tip),
    dy: q * (ty - edge),
    sy: lerp(1, 0.04, q),
    opacity: k > 0.82 ? Math.max(0, 1 - (k - 0.82) / 0.18) : 1,
    origin: top ? 'top' : 'bottom',
  };
}

/** Svelte transition: `from` gives the button's rect (else it falls back to a short fade). */
export function genie(node: HTMLElement, o: { from: () => DOMRect | null; duration?: number; reduced?: boolean }): TransitionConfig {
  const target = o.from();
  if (o.reduced || !target) return { duration: o.reduced ? 0 : 200, css: (t) => `opacity: ${t}` };
  const r = node.getBoundingClientRect();
  const tx = target.left + target.width / 2 - r.left;
  const ty = target.top + target.height / 2 - r.top;
  const tw = Math.max(16, Math.min(48, target.width));
  const tipX = Math.max(tw / 2, Math.min(r.width - tw / 2, tx));
  return {
    duration: o.duration ?? 560,
    easing: cubicInOut,
    css: (_t, u) => {
      const g = genieShape(u, r.width, r.height, tx, ty, tw);
      const poly = g.points.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ');
      return `clip-path: polygon(${poly}); transform-origin: ${tipX.toFixed(1)}px ${g.origin === 'top' ? '0%' : '100%'}; transform: translate(${g.dx.toFixed(1)}px, ${g.dy.toFixed(1)}px) scaleY(${g.sy.toFixed(3)}); opacity: ${g.opacity.toFixed(3)};`;
    },
  };
}

/**
 * Where a genie comes from: the last thing pressed that can be its lamp (`data-genie="<name>"`),
 * else the first such thing on screen. An element can point at a smaller part of itself with
 * `data-genie-anchor` (a timeline row pours from its coloured capsule).
 */
let lastLamp: { name: string; el: Element; rect: DOMRect; at: number } | null = null;

function anchorRect(el: Element): DOMRect {
  return (el.querySelector('[data-genie-anchor]') ?? el).getBoundingClientRect();
}

const byName = (name: string) => `[data-genie="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(name) : name.replace(/["\\]/g, '\\$&')}"]`;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('[data-genie]') as HTMLElement | null;
      if (el) lastLamp = { name: el.dataset.genie ?? '', el, rect: anchorRect(el), at: Date.now() };
    },
    true,
  );
}

export function lamp(name: string): DOMRect | null {
  if (lastLamp && lastLamp.name === name && Date.now() - lastLamp.at < 120_000) {
    // The lamp may have moved (the rail scrolls): read it again while it's still there.
    if (lastLamp.el.isConnected) {
      const r = anchorRect(lastLamp.el);
      if (r.width > 0) return r;
    }
    return lastLamp.rect;
  }
  const el = [...document.querySelectorAll<HTMLElement>(byName(name))].find((x) => x.getBoundingClientRect().width > 0);
  return el ? anchorRect(el) : null;
}
