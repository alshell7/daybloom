// Alef's eyes, ported from the app (AlefEyes.svelte): every parameter rides its own spring
// toward the pose it is given; blinks snap shut and pop open; glances dart and come back; the
// right eye follows the left a beat later. A requestAnimationFrame loop runs only while
// something moves, then stops: at rest the canvas just sits there.

import { useEffect, useRef } from 'react';
import type { Eye } from '@/lib/alef/behaviors';
import { drawEyes, eyeOf, KEYS, settled, step, stretchOf, tuning, withGaze, type EyeP, type Spring } from '@/lib/alef/eyes';

export interface EyesProps {
  pose: { l: Eye; r: Eye; ms: number };
  color: string;
  glow: number;
  look: { x: number; y: number } | null;
  alive: boolean;
  calm: boolean;
  shadow: string | null;
}

const mk = (v: number): Spring => ({ v, vel: 0, to: v, w: 30, z: 0.7 });
const springsOf = (p: EyeP) => Object.fromEntries(KEYS.map((k) => [k, mk(p[k])])) as Record<keyof EyeP, Spring>;

export function AlefEyes({ pose, color, glow, look, alive, calm, shadow }: EyesProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const st = useRef<{
    L: Record<keyof EyeP, Spring>;
    R: Record<keyof EyeP, Spring>;
    gx: Spring;
    gy: Spring;
    blink: Spring;
    frame: number;
    last: number;
    timers: Set<ReturnType<typeof setTimeout>>;
    scratch: HTMLCanvasElement | null;
  } | null>(null);
  const props = useRef({ color, glow, shadow, alive, look, calm });
  props.current = { color, glow, shadow, alive, look, calm };

  if (!st.current) {
    st.current = { L: springsOf(eyeOf(pose.l, -1)), R: springsOf(eyeOf(pose.r, 1)), gx: mk(0), gy: mk(0), blink: mk(0), frame: 0, last: 0, timers: new Set(), scratch: null };
  }

  const all = () => {
    const s = st.current!;
    return [...Object.values(s.L), ...Object.values(s.R), s.gx, s.gy, s.blink];
  };
  const later = (ms: number, fn: () => void) => {
    const s = st.current!;
    const id = setTimeout(() => {
      s.timers.delete(id);
      fn();
    }, ms);
    s.timers.add(id);
  };
  const render = () => {
    const c = canvas.current;
    const s = st.current!;
    if (!c) return;
    s.scratch ??= document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const compose = (sp: Record<keyof EyeP, Spring>, side: -1 | 1): EyeP => {
      let p = withGaze(Object.fromEntries(KEYS.map((k) => [k, sp[k].v])) as unknown as EyeP, side, s.gx.v, s.gy.v);
      const stretch = stretchOf(sp.y.vel);
      const b = Math.max(0, Math.min(1.1, s.blink.v));
      const k = 1 - 0.9 * b;
      p = { ...p, h: p.h * (1 + stretch) * k, w: p.w * (1 - stretch * 0.5) * (1 + b * 0.06), y: p.y + b * p.h * 0.1 };
      return p;
    };
    const { color: col, glow: gl, shadow: sh } = props.current;
    drawEyes(ctx, [compose(s.L, -1), compose(s.R, 1)], { scale: c.width / 200, color: col, glow: gl, scratch: s.scratch, shadow: sh });
  };
  const tick = (t: number) => {
    const s = st.current!;
    const dt = s.last ? Math.min(0.05, (t - s.last) / 1000) : 1 / 60;
    s.last = t;
    for (const sp of all()) step(sp, dt);
    render();
    if (all().every((sp) => settled(sp, 0.004))) {
      for (const sp of all()) {
        sp.v = sp.to;
        sp.vel = 0;
      }
      render();
      s.frame = 0;
      s.last = 0;
      return;
    }
    s.frame = requestAnimationFrame(tick);
  };
  const wake = () => {
    const s = st.current!;
    if (!s.frame && canvas.current) s.frame = requestAnimationFrame(tick);
  };
  const set = (sp: Spring, to: number, ms: number, z?: number) => {
    const t = tuning(props.current.calm ? 60 : ms);
    sp.to = to;
    sp.w = t.w;
    sp.z = props.current.calm ? 1 : (z ?? t.z);
    wake();
  };
  const aim = (sp: Record<keyof EyeP, Spring>, p: EyeP, ms: number) => {
    const t = tuning(props.current.calm ? 60 : ms);
    for (const k of KEYS) {
      sp[k].to = p[k];
      sp[k].w = t.w;
      sp[k].z = props.current.calm ? 1 : t.z;
    }
  };

  // A new pose: the left eye leads, the right follows 26 ms later (follow-through).
  useEffect(() => {
    const s = st.current!;
    aim(s.L, eyeOf(pose.l, -1), pose.ms);
    if (props.current.calm) aim(s.R, eyeOf(pose.r, 1), pose.ms);
    else later(26, () => (aim(s.R, eyeOf(pose.r, 1), pose.ms), wake()));
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose]);

  useEffect(() => {
    const s = st.current!;
    set(s.gx, look ? Math.max(-1, Math.min(1, look.x)) : 0, look ? 110 : 260, 0.72);
    set(s.gy, look ? Math.max(-1, Math.min(1, look.y)) : 0, look ? 110 : 260, 0.72);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look?.x, look?.y, look == null]);

  // Colour or glow changed (theme): redraw once.
  useEffect(() => {
    if (!st.current!.frame) render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, glow, shadow]);

  useEffect(() => {
    const c = canvas.current!;
    const s = st.current!;
    const doBlink = (twice = false) => {
      set(s.blink, 1, 55, 0.9);
      later(75, () => set(s.blink, 0, 150, 0.42));
      if (twice) later(260, () => doBlink(false));
    };
    // Life between feelings: blinks and little glances, a few seconds apart.
    const life = () => {
      later(2200 + Math.random() * 4300, () => {
        const p = props.current;
        if (p.alive && !p.calm && !document.hidden && !p.look) {
          if (Math.random() < 0.66) doBlink(Math.random() < 0.2);
          else {
            set(s.gx, (Math.random() - 0.5) * 0.9, 70, 0.8);
            set(s.gy, (Math.random() - 0.5) * 0.6, 70, 0.8);
            later(700 + Math.random() * 1100, () => {
              if (!props.current.look) {
                set(s.gx, 0, 160, 0.75);
                set(s.gy, 0, 160, 0.75);
              }
            });
          }
        }
        life();
      });
    };
    life();
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
    render();
    return () => {
      ro.disconnect();
      if (s.frame) cancelAnimationFrame(s.frame);
      s.frame = 0;
      s.timers.forEach(clearTimeout);
      s.timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvas} className="block aspect-[200/110] w-full" aria-hidden="true" />;
}
