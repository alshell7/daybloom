// Adapted from React Bits' Magnet (MIT + Commons Clause, reactbits.dev/animations/magnet,
// Copyright (c) 2026 David Haz): the element leans toward a nearby pointer on a spring.
// Changed for Daybloom: trimmed to one element, fine pointers only, off under reduced motion,
// and the spring runs only while the pointer is near or the element is settling.

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Magnet({ children, padding = 70, strength = 5, max = 10, className }: { children: ReactNode; padding?: number; strength?: number; max?: number; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const w = wrap.current;
    const el = inner.current;
    if (!w || !el) return;
    if (!matchMedia('(pointer: fine)').matches || document.documentElement.dataset.motion === 'calm') return;
    const cur = { x: 0, y: 0 };
    const vel = { x: 0, y: 0 };
    let target = { x: 0, y: 0 };
    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = 0;
      const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
      last = t;
      let rest = true;
      for (const k of ['x', 'y'] as const) {
        const f = 170 * (target[k] - cur[k]) - 16 * vel[k];
        vel[k] += f * dt;
        cur[k] += vel[k] * dt;
        if (Math.abs(target[k] - cur[k]) > 0.05 || Math.abs(vel[k]) > 0.05) rest = false;
      }
      el.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0)`;
      if (!rest) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = w.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const outside = Math.hypot(Math.max(0, Math.abs(dx) - r.width / 2), Math.max(0, Math.abs(dy) - r.height / 2));
      const next = outside > padding ? { x: 0, y: 0 } : (() => {
        const pull = 1 - Math.min(1, outside / padding);
        let x = (dx / strength) * pull;
        let y = (dy / strength) * pull;
        const len = Math.hypot(x, y);
        if (len > max) {
          x *= max / len;
          y *= max / len;
        }
        return { x, y };
      })();
      if (next.x === target.x && next.y === target.y) return;
      target = next;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [padding, strength, max]);
  return (
    <div ref={wrap} className={cn('inline-block', className)}>
      <div ref={inner} className="will-change-transform">
        {children}
      </div>
    </div>
  );
}
