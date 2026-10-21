// Adapted from Magic UI's Dock (MIT, magicui.design/docs/components/dock): a macOS-style dock
// whose icons grow as the pointer nears. Changed for Daybloom: it is the page's section
// navigation (links with labels), it rises in after the first screen, a signal dot marks the
// section you are in (signal means now), and magnification is off for touch and reduced motion.

import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import { cn } from '@/lib/utils';

export function Dock({ children, className, magnify = true }: { children: (mouseX: MotionValue<number>) => ReactNode; className?: string; magnify?: boolean }) {
  const mouseX = useMotionValue(Infinity);
  return (
    <div
      onMouseMove={(e) => magnify && mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn('flex h-[58px] items-end gap-1.5 rounded-[22px] border border-line bg-[color-mix(in_srgb,var(--raised)_80%,transparent)] px-2 pb-2 shadow-lift backdrop-blur-xl', className)}
    >
      {children(mouseX)}
    </div>
  );
}

export function DockIcon({ mouseX, href, label, active, children }: { mouseX: MotionValue<number>; href: string; label: string; active: boolean; children: ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const distance = useTransform(mouseX, (x) => {
    const b = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return x - b.x - b.width / 2;
  });
  const size = useSpring(useTransform(distance, [-130, 0, 130], [40, 58, 40]), { mass: 0.1, stiffness: 160, damping: 13 });
  return (
    <motion.a
      ref={ref}
      href={href}
      aria-label={label}
      aria-current={active ? 'location' : undefined}
      style={{ width: size, height: size }}
      className="group relative grid shrink-0 place-items-center rounded-full bg-sunken text-ink-2 transition-colors hover:text-ink"
    >
      <span className="grid size-[46%] place-items-center [&>svg]:size-full">{children}</span>
      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-ink-inverse opacity-0 shadow-float transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
      <span className={cn('absolute -bottom-[6px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-signal transition-opacity duration-200', active ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
    </motion.a>
  );
}
