// Touch feedback on a phone, from Android's own haptic effects (DevicePlugin `haptic`), so it
// feels like the rest of the phone and follows its Touch feedback setting. A computer does
// nothing. Each kind is one moment:
//
//   snap   the dial or a block passes the next five minutes (a fine, frequent tick)
//   tick   a step ticked, a choice made in a set of options
//   pick   a block lifted to move it (a held press)
//   drop   a lifted block put down somewhere new
//   done   a block finished
//   no     something that can't be done right now
//   on/off a switch flipped
//
// If the native side can't (an older app), a short vibration stands in.

import { platform } from './platform';

export type Haptic = 'snap' | 'tick' | 'pick' | 'drop' | 'done' | 'no' | 'on' | 'off';

const VIBRATE: Record<Haptic, number | number[]> = { snap: 4, tick: 8, pick: 16, drop: 10, done: [12, 40, 18], no: [18, 50, 18], on: 8, off: 6 };

let native = true;
let send: ((kind: Haptic) => Promise<unknown>) | null = null;
let lastSnap = 0;

function vibrate(kind: Haptic) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(VIBRATE[kind]);
  } catch {
    /* not allowed right now */
  }
}

export function haptic(kind: Haptic) {
  if (!platform.isMobile) return;
  // Fast sweeps purr instead of rattle (as the bezel's click does, sound.ts).
  if (kind === 'snap') {
    const now = performance.now();
    if (now - lastSnap < 28) return;
    lastSnap = now;
  }
  if (!native) return vibrate(kind);
  const go = (f: (kind: Haptic) => Promise<unknown>) =>
    f(kind).catch(() => {
      native = false;
      vibrate(kind);
    });
  if (send) return void go(send);
  void import('@tauri-apps/api/core').then(({ invoke }) => {
    send = (k) => invoke('device_call', { method: 'haptic', args: { kind: k } });
    void go(send);
  });
}
