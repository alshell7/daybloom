import { useEffect, type RefObject } from 'react';

/** Pauses an element's CSS loops while it is off screen (adds .is-offscreen). */
export function useOffscreenPause(ref: RefObject<Element | null>, margin = '120px') {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    el.classList.add('is-offscreen');
    const io = new IntersectionObserver(([e]) => el.classList.toggle('is-offscreen', !e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
}
