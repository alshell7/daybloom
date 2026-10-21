// Adapted from React Bits' Click Spark (MIT + Commons Clause, reactbits.dev/animations/click-spark,
// Copyright (c) 2026 David Haz): lines and stars burst from a point on a canvas that exists
// only while sparks fly. Changed for Daybloom: imperative only (the page sparks on real
// progress, such as a finished block, never on every click), a fixed overlay, and nothing at
// all under reduced motion.

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface SparkHandle {
  /** Burst at a point in the viewport. */
  spark: (x: number, y: number, colors?: string[]) => void;
}

interface Spark {
  angle: number;
  reach: number;
  scale: number;
  life: number;
  spin: number;
  color: string;
  star: boolean;
}
interface Burst {
  x: number;
  y: number;
  start: number;
  sparks: Spark[];
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  const pinch = r * 0.16;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(rot) * r, y + Math.sin(rot) * r);
  for (let i = 1; i <= 4; i++) {
    const a = rot + (i * Math.PI) / 2;
    const mid = a - Math.PI / 4;
    ctx.quadraticCurveTo(x + Math.cos(mid) * pinch, y + Math.sin(mid) * pinch, x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

export const ClickSpark = forwardRef<SparkHandle, { count?: number; radius?: number; size?: number; duration?: number }>(function ClickSpark(
  { count = 10, radius = 46, size = 12, duration = 620 },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bursts = useRef<Burst[]>([]);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  useImperativeHandle(ref, () => ({
    spark(x, y, colors = ['#3FBF8A']) {
      const c = canvas.current;
      if (!c || document.documentElement.dataset.motion === 'calm') return;
      const step = (Math.PI * 2) / count;
      bursts.current.push({
        x,
        y,
        start: performance.now(),
        sparks: Array.from({ length: count }, (_, i) => ({
          angle: step * i + (Math.random() - 0.5) * step * 0.5,
          reach: 1 + (Math.random() - 0.5) * 0.4,
          scale: 1 + (Math.random() - 0.5) * 0.5,
          life: 1 + (Math.random() - 0.5) * 0.3,
          spin: Math.random() - 0.5,
          color: colors[i % colors.length],
          star: i % 3 === 0,
        })),
      });
      const frame = (now: number) => {
        raf.current = 0;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
          c.width = Math.round(w * dpr);
          c.height = Math.round(h * dpr);
        }
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        bursts.current = bursts.current.filter((b) => {
          const el = now - b.start;
          let alive = false;
          for (const s of b.sparks) {
            const p = el / (duration * s.life);
            if (p >= 1) continue;
            alive = true;
            const e = easeOut(p);
            const d = radius * s.reach * e;
            const fade = 1 - smoothstep(0.55, 1, p);
            ctx.globalAlpha = fade;
            ctx.strokeStyle = s.color;
            ctx.fillStyle = s.color;
            const x1 = b.x + Math.cos(s.angle) * d;
            const y1 = b.y + Math.sin(s.angle) * d;
            if (s.star) {
              const r = size * 0.55 * s.scale * Math.pow(Math.sin(Math.PI * Math.min(1, p * 1.1)), 0.7);
              if (r > 0.05) {
                star(ctx, x1, y1, r, s.angle + s.spin * p * Math.PI * 0.5);
                ctx.fill();
              }
            } else {
              const len = size * s.scale * Math.pow(1 - p, 1.6);
              ctx.lineCap = 'round';
              ctx.lineWidth = 2.2 * s.scale;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(b.x + Math.cos(s.angle) * (d + len), b.y + Math.sin(s.angle) * (d + len));
              ctx.stroke();
            }
          }
          return alive;
        });
        ctx.globalAlpha = 1;
        if (bursts.current.length) raf.current = requestAnimationFrame(frame);
        else ctx.clearRect(0, 0, w, h);
      };
      if (!raf.current) raf.current = requestAnimationFrame(frame);
    },
  }));

  return <canvas ref={canvas} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] size-full" />;
});
