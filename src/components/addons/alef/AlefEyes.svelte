<script lang="ts">
  // The eyes, alive: every parameter rides a spring toward the pose it's given, blinks snap shut
  // and pop open, glances dart and come back, speech makes them bob. A requestAnimationFrame
  // loop runs only while something moves, then stops: at rest the canvas just sits there.
  import { onMount, untrack } from 'svelte';
  import type { Eye } from '../../../lib/addons/alef/behaviors';
  import { drawEyes, eyeOf, KEYS, settled, step, stretchOf, tuning, withGaze, type EyeP, type Spring } from '../../../lib/addons/alef/eyes';

  let {
    pose,
    color = '#5CE1E6',
    glow = 0.6,
    look = null,
    talk = null,
    alive = true,
    asleep = false,
    reduced = false,
    shadow = null,
  }: {
    /** Where the eyes are heading, and how quickly (ms). */
    pose: { l: Eye; r: Eye; ms: number };
    color?: string;
    glow?: number;
    /** A point to look toward (−1..1 each way), or null to look ahead. */
    look?: { x: number; y: number } | null;
    talk?: { seq: number; starts: number[]; total: number } | null;
    /** Blink and glance on their own (not while a feeling plays). */
    alive?: boolean;
    asleep?: boolean;
    reduced?: boolean;
    /** A soft shadow under inked (not glowing) eyes. */
    shadow?: string | null;
  } = $props();

  let canvas = $state<HTMLCanvasElement>();
  const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;

  const mk = (v: number): Spring => ({ v, vel: 0, to: v, w: 30, z: 0.7 });
  const springsOf = (p: EyeP) => Object.fromEntries(KEYS.map((k) => [k, mk(p[k])])) as Record<keyof EyeP, Spring>;
  // Start where the first pose is (later poses arrive through the effect below).
  const L = springsOf(eyeOf(untrack(() => pose.l), -1));
  const R = springsOf(eyeOf(untrack(() => pose.r), 1));
  const gx = mk(0);
  const gy = mk(0);
  const blink = mk(0);
  const bob = mk(0);
  const all = () => [...Object.values(L), ...Object.values(R), gx, gy, blink, bob];

  let frame = 0;
  let last = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  function aim(sp: Record<keyof EyeP, Spring>, p: EyeP, ms: number) {
    const t = tuning(reduced ? 60 : ms);
    for (const k of KEYS) {
      const s = sp[k];
      s.to = p[k];
      s.w = t.w;
      s.z = reduced ? 1 : t.z;
    }
  }
  function set(s: Spring, to: number, ms: number, z?: number) {
    const t = tuning(reduced ? 60 : ms);
    s.to = to;
    s.w = t.w;
    s.z = reduced ? 1 : (z ?? t.z);
    wake();
  }

  // A new pose: the left eye leads, the right follows a beat later (follow-through).
  $effect(() => {
    const p = pose;
    untrack(() => {
      aim(L, eyeOf(p.l, -1), p.ms);
      if (reduced) aim(R, eyeOf(p.r, 1), p.ms);
      else later(26, () => (aim(R, eyeOf(p.r, 1), p.ms), wake()));
      wake();
    });
  });

  $effect(() => {
    const at = look;
    untrack(() => {
      set(gx, at ? Math.max(-1, Math.min(1, at.x)) : 0, at ? 110 : 260, 0.72);
      set(gy, at ? Math.max(-1, Math.min(1, at.y)) : 0, at ? 110 : 260, 0.72);
    });
  });

  // Speech: a small squash on each syllable.
  $effect(() => {
    const t = talk;
    untrack(() => {
      if (!t || reduced) return;
      for (const st of t.starts.slice(0, 60)) {
        later(st * 1000, () => set(bob, 1, 50, 0.55));
        later(st * 1000 + 70, () => set(bob, 0, 120, 0.45));
      }
    });
  });

  function doBlink(twice = false) {
    set(blink, 1, 55, 0.9);
    later(75, () => set(blink, 0, 150, 0.42));
    if (twice) later(260, () => doBlink(false));
  }

  // Life between feelings: blinks and little glances, a few seconds apart.
  let lifeOn = false;
  function life() {
    later(2200 + Math.random() * 4300, () => {
      if (alive && !asleep && !reduced && !document.hidden && !look) {
        const r = Math.random();
        if (r < 0.66) doBlink(Math.random() < 0.2);
        else {
          set(gx, (Math.random() - 0.5) * 0.9, 70, 0.8);
          set(gy, (Math.random() - 0.5) * 0.6, 70, 0.8);
          later(700 + Math.random() * 1100, () => {
            if (!look) {
              set(gx, 0, 160, 0.75);
              set(gy, 0, 160, 0.75);
            }
          });
        }
      }
      life();
    });
  }

  function values(sp: Record<keyof EyeP, Spring>): EyeP {
    return Object.fromEntries(KEYS.map((k) => [k, sp[k].v])) as unknown as EyeP;
  }

  function compose(sp: Record<keyof EyeP, Spring>, side: -1 | 1): EyeP {
    let p = withGaze(values(sp), side, gx.v, gy.v);
    // Fast vertical moves stretch the eye; a blink squashes it to a line; a syllable bobs it.
    const st = stretchOf(sp.y.vel);
    const b = Math.max(0, Math.min(1.1, blink.v));
    const k = 1 - 0.9 * b;
    p = { ...p, h: p.h * (1 + st) * k * (1 - bob.v * 0.1), w: p.w * (1 - st * 0.5) * (1 + b * 0.06 + bob.v * 0.03), y: p.y + b * p.h * 0.1 + bob.v * 2 };
    return p;
  }

  function render() {
    const c = canvas;
    if (!c || !scratch) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    drawEyes(ctx, [compose(L, -1), compose(R, 1)], { scale: c.width / 200, color, glow, scratch, shadow });
  }

  function tick(t: number) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    for (const s of all()) step(s, dt);
    render();
    if (all().every((s) => settled(s, 0.004))) {
      for (const s of all()) {
        s.v = s.to;
        s.vel = 0;
      }
      render();
      frame = 0;
      last = 0;
      return;
    }
    frame = requestAnimationFrame(tick);
  }
  function wake() {
    if (!frame && canvas) frame = requestAnimationFrame(tick);
  }

  // Redraw for colour and glow changes (no motion needed).
  $effect(() => {
    void color;
    void glow;
    void shadow;
    untrack(() => (frame ? null : render()));
  });

  onMount(() => {
    const c = canvas!;
    const ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        render();
      }
    });
    ro.observe(c);
    if (!lifeOn) {
      lifeOn = true;
      life();
    }
    render();
    return () => {
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      timers.clear();
    };
  });
</script>

<canvas bind:this={canvas} class="eyes" aria-hidden="true"></canvas>

<style>
  .eyes {
    display: block;
    width: 100%;
    aspect-ratio: 200 / 110;
  }
</style>
