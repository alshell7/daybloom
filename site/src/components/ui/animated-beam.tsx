// Adapted from Magic UI's Animated Beam (MIT, magicui.design/docs/components/animated-beam): a
// light runs along a curved path between two elements. Changed for Daybloom: the light runs a
// few times when the beam comes into view and then rests (no endless loop), it is drawn in the
// block colours, and it stays a still line under reduced motion.

import { useEffect, useId, useState, type RefObject } from 'react';
import { motion, useInView } from 'motion/react';

export function AnimatedBeam({
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  duration = 3.2,
  delay = 0,
  from = 'var(--c-focus)',
  to = 'var(--c-people)',
  repeat = 3,
}: {
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  reverse?: boolean;
  duration?: number;
  delay?: number;
  from?: string;
  to?: string;
  repeat?: number;
}) {
  const id = useId().replace(/:/g, '');
  const [d, setD] = useState('');
  const [box, setBox] = useState({ w: 0, h: 0 });
  const inView = useInView(containerRef as RefObject<Element>, { once: true, amount: 0.4 });
  const [calm, setCalm] = useState(false);

  useEffect(() => {
    setCalm(document.documentElement.dataset.motion === 'calm');
    const update = () => {
      const c = containerRef.current?.getBoundingClientRect();
      const a = fromRef.current?.getBoundingClientRect();
      const b = toRef.current?.getBoundingClientRect();
      if (!c || !a || !b) return;
      setBox({ w: c.width, h: c.height });
      const sx = a.left - c.left + a.width / 2;
      const sy = a.top - c.top + a.height / 2;
      const ex = b.left - c.left + b.width / 2;
      const ey = b.top - c.top + b.height / 2;
      setD(`M ${sx},${sy} Q ${(sx + ex) / 2},${sy - curvature} ${ex},${ey}`);
    };
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    update();
    return () => ro.disconnect();
  }, [containerRef, fromRef, toRef, curvature]);

  const coords = reverse ? { x1: ['90%', '-10%'], x2: ['100%', '0%'] } : { x1: ['10%', '110%'], x2: ['0%', '100%'] };
  return (
    <svg fill="none" width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} className="pointer-events-none absolute top-0 left-0" aria-hidden="true">
      <path d={d} strokeWidth={2} strokeLinecap="round" strokeDasharray="1 7" style={{ stroke: 'var(--line-strong)' }} />
      {!calm && inView && <path d={d} strokeWidth={2.5} strokeLinecap="round" stroke={`url(#${id})`} />}
      <defs>
        <motion.linearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          initial={{ x1: '0%', x2: '0%', y1: '0%', y2: '0%' }}
          animate={inView && !calm ? { x1: coords.x1, x2: coords.x2, y1: ['0%', '0%'], y2: ['0%', '0%'] } : undefined}
          transition={{ delay, duration, ease: [0.16, 1, 0.3, 1], repeat, repeatDelay: 1.2 }}
        >
          <stop style={{ stopColor: from }} stopOpacity="0" />
          <stop style={{ stopColor: from }} />
          <stop offset="32.5%" style={{ stopColor: to }} />
          <stop offset="100%" style={{ stopColor: to }} stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </svg>
  );
}
