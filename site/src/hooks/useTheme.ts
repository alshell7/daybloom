import { useCallback, useEffect, useState } from 'react';

export type Mode = 'light' | 'dark';
const KEY = 'daybloom-theme';

const read = (): Mode => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

/** The page's light or dark look: the visitor's choice, else the system's, kept in step. */
export function useTheme(): [Mode | null, (m: Mode) => void] {
  const [mode, setMode] = useState<Mode | null>(null);
  useEffect(() => {
    setMode(read());
    const obs = new MutationObserver(() => setMode(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => {
      let chosen: string | null = null;
      try {
        chosen = localStorage.getItem(KEY);
      } catch {
        /* storage may be blocked */
      }
      if (!chosen) document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light';
    };
    mq.addEventListener('change', follow);
    return () => {
      obs.disconnect();
      mq.removeEventListener('change', follow);
    };
  }, []);
  const set = useCallback((m: Mode) => {
    document.documentElement.dataset.theme = m;
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* storage may be blocked: the choice lasts for this visit */
    }
  }, []);
  return [mode, set];
}

/** Read a CSS custom property from the root (after mount), e.g. a dial colour for a canvas. */
export function cssVar(name: string, el: Element = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
