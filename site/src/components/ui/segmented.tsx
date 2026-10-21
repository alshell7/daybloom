// The app's segmented control (the dial's reference switcher): a pill track with a raised
// thumb that glides between options. The thumb starts moving only after it is measured, so it
// never slides in on load.

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const useIso = typeof window === 'undefined' ? () => {} : useLayoutEffect;

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
}: {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
  size?: 'md' | 'lg';
}) {
  const track = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);

  useIso(() => {
    const el = track.current?.querySelector<HTMLElement>(`[data-value="${value}"]`);
    if (!el || !track.current) return;
    const measure = () => setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track.current);
    const t = setTimeout(() => setReady(true), 50);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [value]);

  const move = (dir: number) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.value);
    track.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  };

  return (
    <div
      ref={track}
      role="radiogroup"
      aria-label={label}
      className={cn('relative inline-flex gap-0.5 rounded-full bg-sunken p-[3px]', className)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          move(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      <span
        aria-hidden="true"
        className={cn('absolute top-[3px] bottom-[3px] left-0 rounded-full bg-raised shadow-rest', ready && 'transition-[transform,width] duration-[380ms] [transition-timing-function:var(--ease-out)]', !thumb && 'hidden')}
        style={thumb ? { width: thumb.w, transform: `translateX(${thumb.x}px)` } : undefined}
      />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-value={o.value}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative z-[1] rounded-full whitespace-nowrap transition-colors duration-200',
              size === 'lg' ? 'h-9 px-4 text-[14px]' : 'h-[30px] px-3 text-[13px]',
              on ? 'text-ink' : 'text-ink-2 hover:text-ink',
              !thumb && on && 'bg-raised shadow-rest',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
