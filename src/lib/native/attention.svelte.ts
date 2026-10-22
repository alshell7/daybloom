// Ambient motion on a phone. Its web view is composited by the app, so every frame of an
// animation is a frame of the whole app: a breathing halo or a rolling seconds digit keeps the
// phone drawing 30–60 frames a second for as long as the screen is on (and a focus session
// keeps it on). So on a phone, ambient motion plays while someone is looking (for a while after
// the app is opened or touched) and rests after that. Computers composite it apart from the
// page, for about 1% of a core, so there it always plays.

import { platform } from '../platform';

const LOOK_MS = 20_000;

class Attention {
  /** The app was opened or touched in the last 20 s (always true on a computer). */
  looking = $state(true);
  /** Counts each open and touch, for motion that starts again then. */
  glances = $state(0);
}

export const attention = new Attention();

/** Main window, phone only. Returns a stop function. */
export function startAttention(): () => void {
  if (!platform.isMobile) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const look = () => {
    if (document.visibilityState !== 'visible') return;
    attention.looking = true;
    attention.glances++;
    clearTimeout(timer);
    timer = setTimeout(() => (attention.looking = false), LOOK_MS);
  };
  look();
  document.addEventListener('pointerdown', look, { capture: true, passive: true });
  document.addEventListener('visibilitychange', look);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('pointerdown', look, { capture: true });
    document.removeEventListener('visibilitychange', look);
  };
}
