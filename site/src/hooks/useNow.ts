import { useEffect, useState } from 'react';

/**
 * The wall clock, stepped on whole seconds (or minutes) from the real time each tick, never a
 * free-running counter. Null until mounted, so the prerendered page never shows a stale time.
 * While the tab is hidden it only ticks once a minute.
 */
/** `?at=10:40` shows the page at another time of day (like the app's dev helper). */
let skew: number | null = null;
function offset() {
  if (skew != null) return skew;
  skew = 0;
  const at = new URLSearchParams(location.search).get('at');
  const m = at && /^(\d{1,2}):(\d{2})$/.exec(at);
  if (m) {
    const d = new Date();
    d.setHours(Number(m[1]), Number(m[2]), d.getSeconds(), d.getMilliseconds());
    skew = d.getTime() - Date.now();
  }
  return skew;
}

export function useNow(stepMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const n = Date.now() + offset();
      setNow(n);
      const step = document.hidden ? Math.max(stepMs, 60_000) : stepMs;
      t = setTimeout(tick, step - (n % step) + 5);
    };
    tick();
    const wake = () => {
      clearTimeout(t);
      tick();
    };
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [stepMs]);
  return now;
}
