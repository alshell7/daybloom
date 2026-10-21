// Text whose characters roll like an odometer when they change (the app's Rolling.svelte:
// 420 ms, 2 px of blur). When the text changes shape ("59m" → "1h"), it crossfades instead.

import { AnimatePresence, motion } from 'motion/react';

const roll = {
  initial: { y: '55%', opacity: 0, filter: 'blur(2px)' },
  animate: { y: '0%', opacity: 1, filter: 'blur(0px)' },
  exit: { y: '-55%', opacity: 0, filter: 'blur(2px)' },
};

export function Rolling({ text, calm }: { text: string; calm: boolean }) {
  const shape = text.replace(/\d/g, '0');
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-grid">
        <AnimatePresence initial={false}>
          <motion.span
            key={shape}
            className="tnum col-start-1 row-start-1 inline-flex justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: calm ? 0 : 0.26 }}
          >
            {[...text].map((ch, i) => (
              <span key={i} className="-my-[0.06em] inline-grid overflow-hidden py-[0.06em]">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={ch}
                    className="col-start-1 row-start-1 inline-block"
                    {...roll}
                    transition={{ duration: calm ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {ch === ' ' ? ' ' : ch}
                  </motion.span>
                </AnimatePresence>
              </span>
            ))}
          </motion.span>
        </AnimatePresence>
      </span>
    </>
  );
}
