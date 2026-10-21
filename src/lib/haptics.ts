// A light touch on a phone for moments that land: a step ticked, a block done, the dial
// snapping to the next five minutes while you sweep a block. Short and soft, and only where a
// phone can (Android's web view has navigator.vibrate); a computer does nothing.

import { platform } from './platform';

const PATTERNS = { snap: 4, tick: 8, done: [12, 40, 18] } as const;

export function haptic(kind: keyof typeof PATTERNS) {
  if (!platform.isMobile || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERNS[kind] as number | number[]);
  } catch {
    /* not allowed right now */
  }
}
