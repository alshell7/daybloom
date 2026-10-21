// Adapted from Magic UI's Animated Theme Toggler (MIT, magicui.design/docs/components/animated-theme-toggler):
// the new theme opens as a circle from the button through a View Transition. Changed for
// Daybloom: it drives the page's data-theme, takes the app's 650 ms in-out reveal, skips the
// transition under reduced motion, and swaps a sun and a moon on a small turn.

import { useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useTheme();
  const ref = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);

  const toggle = useCallback(() => {
    const next = (document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') as 'light' | 'dark';
    const root = document.documentElement;
    const calm = root.dataset.motion === 'calm';
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
    if (calm || !doc.startViewTransition || !ref.current || busy.current) {
      setMode(next);
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { top, left, width, height } = ref.current.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const r = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y));
    const pct = (v: number, of: number) => `${(v / of) * 100}%`;
    const rad = `${(r / (Math.hypot(vw, vh) / Math.SQRT2)) * 100}%`;
    const from = `circle(0% at ${pct(x, vw)} ${pct(y, vh)})`;
    const to = `circle(${rad} at ${pct(x, vw)} ${pct(y, vh)})`;
    busy.current = true;
    root.dataset.themeVt = 'active';
    root.style.setProperty('--theme-vt-clip-from', from);
    const vt = doc.startViewTransition(() => flushSync(() => setMode(next)));
    vt.ready
      .then(() => root.animate({ clipPath: [from, to] }, { duration: 650, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards', pseudoElement: '::view-transition-new(root)' }))
      .catch(() => {});
    vt.finished.finally(() => {
      busy.current = false;
      delete root.dataset.themeVt;
      root.style.removeProperty('--theme-vt-clip-from');
    });
  }, [setMode]);

  const dark = mode === 'dark';
  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      className={cn('relative grid size-9 place-items-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-sunken hover:text-ink active:scale-92', className)}
      aria-label={dark ? 'Use the light theme' : 'Use the dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      <Sun className="absolute size-[18px] transition-all duration-500 [transition-timing-function:var(--ease-out)] dark:rotate-90 dark:scale-50 dark:opacity-0" aria-hidden="true" />
      <Moon className="absolute size-[18px] -rotate-90 scale-50 opacity-0 transition-all duration-500 [transition-timing-function:var(--ease-out)] dark:rotate-0 dark:scale-100 dark:opacity-100" aria-hidden="true" />
    </button>
  );
}
