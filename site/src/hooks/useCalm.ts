import { useEffect, useState } from 'react';

/** True when the visitor asked for reduced motion (the page then sets data-motion="calm"). */
export function useCalm() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => {
      const on = mq.matches;
      document.documentElement.dataset.motion = on ? 'calm' : 'full';
      setCalm(on);
    };
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);
  return calm;
}
