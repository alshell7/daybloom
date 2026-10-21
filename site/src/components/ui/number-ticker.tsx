// Adapted from Magic UI's Number Ticker (MIT, magicui.design/docs/components/number-ticker):
// a number counts on a spring when it scrolls into view. Changed for Daybloom: the real value
// is in the HTML from the start (prerender, no script, reduced motion), tabular figures, and
// it can count down (to zero, for "no servers").

import { useEffect, useRef } from 'react';
import { useInView, useMotionValue, useSpring } from 'motion/react';
import { cn } from '@/lib/utils';

export function NumberTicker({ value, from, className }: { value: number; from?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const start = from ?? (value === 0 ? 12 : 0);
  const mv = useMotionValue(start);
  const spring = useSpring(mv, { damping: 60, stiffness: 100 });
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });

  useEffect(() => {
    if (!inView || document.documentElement.dataset.motion === 'calm') return;
    if (ref.current) ref.current.textContent = String(start);
    const off = spring.on('change', (v) => {
      if (ref.current) ref.current.textContent = String(Math.round(v));
    });
    mv.set(value);
    return off;
  }, [inView, mv, spring, value, start]);

  return (
    <span ref={ref} className={cn('tnum inline-block', className)}>
      {value}
    </span>
  );
}
