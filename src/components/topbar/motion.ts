// The top bar's (and the update card's) motion: one spring easing, a pop for items coming in or
// going out, and two Web Animations one-shots (a FLIP slide and a little bump). Transform and
// opacity only, always finite; every caller passes `reduced` (Calm or the system setting).

import type { TransitionConfig } from 'svelte/transition';

/** A damped spring from 0 to 1: about 14% overshoot, settled by the end. */
export function springOut(t: number): number {
  const s = (x: number) => 1 - Math.exp(-6.5 * x) * Math.cos(10.5 * x);
  return t >= 1 ? 1 : s(t) / s(1);
}

/** An item arriving: it grows from a dot with a spring. */
export function popIn(_node: Element, o: { reduced?: boolean; delay?: number } = {}): TransitionConfig {
  if (o.reduced) return { duration: 0 };
  return {
    duration: 440,
    delay: o.delay ?? 0,
    easing: springOut,
    css: (t) => `transform: scale(${0.45 + 0.55 * t}); opacity: ${Math.min(1, t * 1.8)}`,
  };
}

/** An item leaving: it shrinks and slips toward More (to the right). */
export function popOut(_node: Element, o: { reduced?: boolean } = {}): TransitionConfig {
  if (o.reduced) return { duration: 0 };
  return {
    duration: 200,
    css: (t) => {
      const e = t * t;
      return `transform: translateX(${(1 - e) * 10}px) scale(${0.55 + 0.45 * e}); opacity: ${e}`;
    },
  };
}

/** Keyframes for a spring from `from` (t = 0) to `to` (t = 1), sampled. */
function springFrames(frame: (k: number) => Keyframe, n = 16): Keyframe[] {
  return Array.from({ length: n + 1 }, (_, i) => ({ ...frame(springOut(i / n)), offset: i / n }));
}

/** FLIP: an element that just moved by (dx, dy) springs from where it was to where it is. */
export function slideFrom(el: HTMLElement, dx: number, dy: number, reduced = false) {
  if (reduced || (Math.abs(dx) < 1 && Math.abs(dy) < 1) || !el.animate) return;
  el.animate(
    springFrames((k) => ({ transform: `translate(${dx * (1 - k)}px, ${dy * (1 - k)}px)` })),
    { duration: 560, easing: 'linear' },
  );
}

/** A little bump: "something went in here". */
export function bump(el: HTMLElement | undefined, reduced = false) {
  if (!el || reduced || !el.animate) return;
  el.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.2)', offset: 0.3 },
      { transform: 'scale(0.94)', offset: 0.62 },
      { transform: 'scale(1)' },
    ],
    { duration: 460, easing: 'ease-out' },
  );
}
