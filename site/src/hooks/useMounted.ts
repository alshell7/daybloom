import { useEffect, useState } from 'react';

/** False during the prerender and the first client render (so hydration matches), true after. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
