// Adapted from Aceternity UI's Container Scroll Animation (ui.aceternity.com/components/
// container-scroll-animation, Aceternity licence; author Manu Arora): a card tilted back in
// 3D that lies flat as you scroll to it. Changed for Daybloom: no device bezel (the shot is
// already a window), a gentler tilt, transform-only, and flat from the start under reduced motion.

import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';

export function ContainerScroll({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const calm = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [calm ? 0 : 16, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [calm ? 1 : 0.92, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [calm ? 0 : 60, 0]);
  return (
    <div ref={ref} className={className} style={{ perspective: '1400px' }}>
      <motion.div style={{ rotateX, scale, y, transformOrigin: '50% 0%' }} className="will-change-transform">
        {children}
      </motion.div>
    </div>
  );
}
