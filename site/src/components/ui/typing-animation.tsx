// Adapted from Magic UI's Typing Animation (MIT, magicui.design/docs/components/typing-animation):
// words are typed, held, deleted and typed again. Changed for Daybloom: the first word is
// already there before script runs (so the field is never empty), it starts only on screen,
// it reports each word so a preview can follow it, and under reduced motion words swap whole.

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { cn } from '@/lib/utils';

export function TypingAnimation({
  words,
  className,
  typeSpeed = 70,
  deleteSpeed = 28,
  pauseDelay = 2200,
  onWord,
}: {
  words: string[];
  className?: string;
  typeSpeed?: number;
  deleteSpeed?: number;
  pauseDelay?: number;
  /** Called when a word starts (done = false) and when it is fully typed (done = true). */
  onWord?: (index: number, done: boolean) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  const [index, setIndex] = useState(0);
  const [chars, setChars] = useState(words[0].length);
  const [phase, setPhase] = useState<'typing' | 'pause' | 'deleting'>('pause');
  const cb = useRef(onWord);
  cb.current = onWord;

  useEffect(() => {
    if (!inView) return;
    const calm = document.documentElement.dataset.motion === 'calm';
    const word = words[index];
    let t: ReturnType<typeof setTimeout>;
    if (calm) {
      t = setTimeout(() => {
        const n = (index + 1) % words.length;
        setIndex(n);
        setChars(words[n].length);
        cb.current?.(n, true);
      }, pauseDelay + 800);
      return () => clearTimeout(t);
    }
    if (phase === 'pause') t = setTimeout(() => setPhase('deleting'), pauseDelay);
    else if (phase === 'deleting') {
      if (chars > 0) t = setTimeout(() => setChars(chars - 1), deleteSpeed);
      else {
        const n = (index + 1) % words.length;
        t = setTimeout(() => {
          setIndex(n);
          setPhase('typing');
          cb.current?.(n, false);
        }, 240);
      }
    } else if (chars < word.length) t = setTimeout(() => setChars(chars + 1), typeSpeed + Math.random() * 40);
    else {
      cb.current?.(index, true);
      setPhase('pause');
    }
    return () => clearTimeout(t);
  }, [inView, phase, chars, index, words, typeSpeed, deleteSpeed, pauseDelay]);

  return (
    <span ref={ref} className={cn('inline-flex items-center', className)}>
      <span className="truncate whitespace-pre">{words[index].slice(0, chars)}</span>
      <span className="motion-loop ml-px inline-block h-[1.15em] w-[1.5px] animate-blink-cursor rounded-full bg-signal" aria-hidden="true" />
    </span>
  );
}
