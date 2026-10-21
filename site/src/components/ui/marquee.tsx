// Adapted from Magic UI's Marquee (MIT, magicui.design/docs/components/marquee): content
// repeats and slides on a loop. Changed for Daybloom: transform-only, paused off screen and
// on hover, still under reduced motion, and the copies are hidden from screen readers.

import { useRef, type ComponentPropsWithoutRef } from 'react';
import { useOffscreenPause } from '@/hooks/useOffscreenPause';
import { cn } from '@/lib/utils';

interface MarqueeProps extends ComponentPropsWithoutRef<'div'> {
  /** Seconds for one full pass. */
  duration?: number;
  reverse?: boolean;
  pauseOnHover?: boolean;
  repeat?: number;
}

export function Marquee({ className, duration = 48, reverse = false, pauseOnHover = true, children, repeat = 3, ...props }: MarqueeProps) {
  const ref = useRef<HTMLDivElement>(null);
  useOffscreenPause(ref);
  return (
    <div ref={ref} {...props} style={{ ['--duration' as string]: `${duration}s`, ...props.style }} className={cn('group motion-loop flex [gap:var(--gap)] overflow-hidden [--gap:0.75rem]', className)}>
      {Array.from({ length: repeat }, (_, i) => (
        <div
          key={i}
          aria-hidden={i > 0 || undefined}
          className={cn('flex shrink-0 animate-marquee flex-row justify-around [gap:var(--gap)]', pauseOnHover && 'group-hover:[animation-play-state:paused]', reverse && '[animation-direction:reverse]')}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
