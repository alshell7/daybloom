// Client side of src-tauri/src/activity.rs, with browser fallbacks.
//
//   activity_idle_seconds()        -> number                        0 when unknown
//   activity_foreground(withTitle) -> { app, title|null } | null    title: Windows only
//
// Neither call ever throws: a failure reads as "not idle" and "no app".

import { platform } from '../../platform';
import type { Foreground } from './types';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

// Browser fallback: time since the last key or pointer input on this window only.
let lastInput = Date.now();
let watching = false;

/** Start noting key and pointer input on this window (browser fallback; idempotent). */
export function watchBrowserInput() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  lastInput = Date.now();
  const mark = () => {
    lastInput = Date.now();
  };
  const opts = { passive: true, capture: true } as const;
  window.addEventListener('keydown', mark, opts);
  window.addEventListener('pointermove', mark, opts);
  window.addEventListener('pointerdown', mark, opts);
}

/** Seconds since the last input anywhere (native), or on this window (browser). */
export async function idleSeconds(): Promise<number> {
  if (platform.isNative) {
    try {
      const s = await invoke<number>('activity_idle_seconds');
      return typeof s === 'number' && Number.isFinite(s) && s > 0 ? s : 0;
    } catch {
      return 0;
    }
  }
  watchBrowserInput();
  return Math.max(0, (Date.now() - lastInput) / 1000);
}

/** The frontmost app, and its window title when asked for (Windows only). Null in a browser. */
export async function foreground(withTitle: boolean): Promise<Foreground | null> {
  if (!platform.isNative) return null;
  try {
    const f = await invoke<{ app?: unknown; title?: unknown } | null>('activity_foreground', { withTitle });
    if (!f || typeof f.app !== 'string' || !f.app.trim()) return null;
    return withTitle && typeof f.title === 'string' && f.title.trim() ? { app: f.app, title: f.title } : { app: f.app };
  } catch {
    return null;
  }
}

/** What this host can sense, so the UI shows only the options that work. */
export function activityCapabilities() {
  const desktop = platform.isNative && (platform.os === 'mac' || platform.os === 'windows');
  return {
    /** System-wide idle time (else only this window's input). */
    systemIdle: desktop,
    /** A phone senses apps too, once usage access is allowed in Android's settings. */
    apps: desktop || platform.isMobile,
    titles: platform.isNative && platform.os === 'windows',
  };
}
