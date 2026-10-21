// Adapted from Magic UI's Text Reveal (MIT, magicui.design/docs/components/text-reveal): the
// words of one sentence light up as you scroll through it. Changed for Daybloom: a shorter run,
// the page's type, an em-dash-free sentence split on spaces, and fully lit under reduced motion.

import { useRef, type FC, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { cn } from '@/lib/utils';

export const TextReveal: FC<{ children: string; className?: string }> = ({ children, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const calm = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.15', 'end end'] });
  const words = children.split(' ');
  return (
    <div ref={ref} className={cn('relative h-[150vh] sm:h-[165vh]', className)}>
      <div className="sticky top-0 mx-auto flex h-dvh max-w-[1040px] items-center px-4 sm:px-8">
        <p className="flex flex-wrap text-[clamp(30px,5vw,64px)] leading-[1.12] font-[350] tracking-[-0.035em] text-ink">
          {words.map((w, i) => {
            const start = i / words.length;
            return (
              <Word key={i} progress={scrollYProgress} range={[start, start + 1 / words.length]} calm={!!calm}>
                {w}
              </Word>
            );
          })}
        </p>
      </div>
    </div>
  );
};

function Word({ children, progress, range, calm }: { children: ReactNode; progress: MotionValue<number>; range: [number, number]; calm: boolean }) {
  const opacity = useTransform(progress, range, [0, 1]);
  return (
    <span className="relative mr-[0.24em]">
      {/* The faint word is drawn as generated content: decoration, not text to read. */}
      <span data-w={children as string} className="opacity-[0.16] before:content-[attr(data-w)]" aria-hidden="true" />
      <motion.span style={{ opacity: calm ? 1 : opacity }} className="absolute inset-0">
        {children}
      </motion.span>
    </span>
  );
}
