// Adapted from Aceternity UI's Timeline (ui.aceternity.com/components/timeline, Aceternity
// licence; author Manu Arora): entries down a line that fills as you scroll, with each
// entry's title held beside it. Changed for Daybloom: the fill grows with scaleY (no layout
// work per frame), it is drawn in the block blue fading to lume, the heading is the section's
// own, and the line is simply full under reduced motion.

import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';

export interface TimelineEntry {
  title: ReactNode;
  aside?: ReactNode;
  content: ReactNode;
}

export function Timeline({ data }: { data: TimelineEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const calm = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 30%', 'end 60%'] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [calm ? 1 : 0, 1]);
  return (
    <div ref={ref} className="relative">
      <div className="absolute top-2 bottom-2 left-[15px] w-[2px] overflow-hidden rounded-full bg-line md:left-[211px]" aria-hidden="true">
        <motion.div style={{ scaleY, transformOrigin: 'top' }} className="absolute inset-0 rounded-full bg-[linear-gradient(to_bottom,var(--c-focus),var(--lume))]" />
      </div>
      <ol className="grid gap-14 md:gap-20">
        {data.map((item, i) => (
          <li key={i} className="relative grid gap-4 pl-12 md:grid-cols-[180px_1fr] md:gap-16 md:pl-0">
            <div className="md:sticky md:top-28 md:self-start md:text-right">
              <span className="absolute top-1.5 left-[8px] grid size-4 place-items-center rounded-full bg-ground md:left-[204px]" aria-hidden="true">
                <span className="size-2.5 rounded-full border-2 border-line-strong bg-raised" />
              </span>
              <h3 className="tnum text-[28px] leading-none font-[360] tracking-[-0.03em] text-ink md:text-[34px]">{item.title}</h3>
              {item.aside && <div className="mt-2 text-[13px] text-ink-3">{item.aside}</div>}
            </div>
            <div className="min-w-0">{item.content}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
