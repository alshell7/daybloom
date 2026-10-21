// Adapted from Aceternity UI's Compare (ui.aceternity.com/components/compare, Aceternity
// licence; author Manu Arora): two images, one clipped over the other, split by a handle you
// drag. Changed for Daybloom: a real range input underneath (keyboard and screen readers can
// move it), no sparkle canvas, the handle is a pill with the sun and the moon, and one small
// peek when it first scrolls into view instead of an autoplay loop.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Compare({ first, second, label, className }: { first: ReactNode; second: ReactNode; label: string; className?: string }) {
  const [x, setX] = useState(50);
  const [drag, setDrag] = useState(false);
  const [peeked, setPeeked] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // One peek when it first appears: the handle leans right and comes back.
  useEffect(() => {
    const el = box.current;
    if (!el || document.documentElement.dataset.motion === 'calm') return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || peeked) return;
        io.disconnect();
        setPeeked(true);
        const t0 = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - t0) / 1400);
          setX(50 + Math.sin(p * Math.PI) * 14);
          if (p < 1) requestAnimationFrame(step);
        };
        setTimeout(() => requestAnimationFrame(step), 350);
      },
      { threshold: 0.55 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [peeked]);

  const at = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setX(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      ref={box}
      className={cn('group relative isolate touch-pan-y overflow-hidden select-none', drag ? 'cursor-grabbing' : 'cursor-ew-resize', className)}
      onPointerDown={(e) => {
        setDrag(true);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        at(e.clientX);
      }}
      onPointerMove={(e) => drag && at(e.clientX)}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
    >
      <div className="relative">{second}</div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }}>
        {first}
      </div>
      <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-[linear-gradient(to_bottom,transparent,rgb(255_255_255/0.95)_12%,rgb(255_255_255/0.95)_88%,transparent)] shadow-[0_0_0_1px_rgb(21_28_42/0.12)]" style={{ left: `${x}%` }}>
        <div className="absolute top-1/2 left-1/2 flex -translate-1/2 items-center gap-1.5 rounded-full bg-raised px-2.5 py-1.5 text-ink-2 shadow-float transition-transform duration-200 group-active:scale-95">
          <Sun className="size-4" aria-hidden="true" />
          <span className="h-4 w-px bg-line-strong" aria-hidden="true" />
          <Moon className="size-4" aria-hidden="true" />
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(x)}
        onChange={(e) => setX(Number(e.target.value))}
        aria-label={label}
        className="peer absolute inset-0 z-20 size-full cursor-[inherit] opacity-0"
        onPointerDown={(e) => e.preventDefault()}
      />
      <span className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] ring-2 ring-focus ring-offset-2 ring-offset-ground opacity-0 peer-focus-visible:opacity-100" aria-hidden="true" />
    </div>
  );
}
