// Adapted from Magic UI's Orbiting Circles (MIT, magicui.design/docs/components/orbiting-circles):
// items travel round a circle on a transform-only CSS loop. Changed for Daybloom: the path is
// the dial's minute track (a dashed hairline), it pauses off screen and on hover, it holds still
// under reduced motion, and the radius scales with its box.

import { Children, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function OrbitingCircles({ children, radius, duration = 40, reverse = false, path = true, className, offset = 0 }: { children: ReactNode; radius: number; duration?: number; reverse?: boolean; path?: boolean; className?: string; offset?: number }) {
  const n = Children.count(children);
  return (
    <>
      {path && (
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
          <circle cx="50%" cy="50%" r={radius} fill="none" strokeWidth={1.2} strokeDasharray="2 6" strokeLinecap="round" style={{ stroke: 'var(--line-strong)' }} />
        </svg>
      )}
      {Children.map(children, (child, i) => (
        <div
          style={{ '--duration': duration, '--radius': radius, '--angle': (360 / n) * i + offset } as CSSProperties}
          className={cn('absolute top-1/2 left-1/2 flex -translate-1/2 transform-gpu animate-orbit items-center justify-center', reverse && '[animation-direction:reverse]', className)}
        >
          {child}
        </div>
      ))}
    </>
  );
}
