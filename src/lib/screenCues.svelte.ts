// Screen cues: an edge glow that breathes, a time bar docked to an edge of the display, and
// a small HUD in a corner, all drawn by one click-through window (OverlayView). The planner
// decides when that window exists; the window itself reads the same stores and draws.

import { untrack } from 'svelte';
import { categoryColor } from './engine/categories';
import { platform } from './platform';
import { clock } from './stores/clock.svelte';
import { persisted } from './stores/persisted.svelte';
import { settings } from './stores/settings.svelte';
import { timer } from './stores/timer.svelte';
import { view } from './stores/view.svelte';

export interface CueSubject {
  kind: 'focus' | 'break' | 'block' | 'preview';
  title: string;
  icon: string;
  color: string;
  startMs: number;
  endMs: number;
  remainingMs: number;
  /** 0..1 of the time still left. */
  left: number;
  paused: boolean;
  /** "Round 2 of 4" for cycles. */
  round: string | null;
}

/** A short demo, shown when a cue is switched on with nothing running. */
export const cuePreview = persisted<{ until: number }>('cue-preview', { until: 0 });

const PREVIEW_MS = 7000;

/** What the cues are timing right now, or null. */
export function cueSubject(now = clock.now): CueSubject | null {
  const dark = view.finish.dark;
  const a = timer.active;
  const ts = a ? timer.status(now) : null;
  if (a && ts && !ts.finished) {
    const brk = ts.segment.kind === 'break';
    const focusCount = a.segments.filter((s) => s.kind === 'focus').length;
    const round = a.kind === 'cycles' ? `Round ${a.segments.slice(0, ts.index + 1).filter((s) => s.kind === 'focus').length} of ${focusCount}` : null;
    return {
      kind: brk ? 'break' : 'focus',
      title: brk ? ts.segment.label : a.label,
      icon: brk ? 'coffee' : a.icon,
      color: categoryColor(brk ? 'rest' : a.category, dark),
      startMs: now - ts.segment.ms * ts.progress,
      endMs: now + ts.remainingMs,
      remainingMs: ts.remainingMs,
      left: Math.max(0, Math.min(1, ts.remainingMs / ts.segment.ms)),
      paused: ts.paused,
      round,
    };
  }
  if (settings.value.screen.when === 'blocks') {
    const b = view.now.current;
    if (b && !b.done && b.endMs > now) {
      const total = b.endMs - b.startMs;
      return {
        kind: 'block',
        title: b.title || 'Untitled block',
        icon: b.icon,
        color: b.color,
        startMs: b.startMs,
        endMs: b.endMs,
        remainingMs: b.endMs - now,
        left: Math.max(0, Math.min(1, (b.endMs - now) / total)),
        paused: false,
        round: null,
      };
    }
  }
  if (cuePreview.value.until > now) {
    const total = 25 * 60_000;
    const left = 0.62;
    return {
      kind: 'preview',
      title: 'Preview · your focus',
      icon: 'target',
      color: categoryColor('focus', dark),
      startMs: now - total * (1 - left),
      endMs: now + total * left,
      remainingMs: total * left,
      left,
      paused: false,
      round: null,
    };
  }
  return null;
}

export function anyCue(): boolean {
  const s = settings.value.screen;
  return s.glow || s.bar || s.hud;
}

/** Main window only: keep the cues window open exactly while it has something to show. */
export function startScreenCues(): () => void {
  if (!platform.isNative) return () => {};
  let shown = false;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let previewTimer: ReturnType<typeof setTimeout> | null = null;

  const apply = (want: boolean) => {
    if (want === shown) return;
    shown = want;
    platform.showOverlay(want).catch(() => (shown = !want));
  };

  // Turning a cue on with nothing running shows a short preview, so you see what you chose.
  let lastCfg = '';
  const stopCfg = $effect.root(() => {
    $effect(() => {
      const s = settings.value.screen;
      const cfg = JSON.stringify(s);
      if (lastCfg && cfg !== lastCfg && anyCue() && !timer.active) {
        cuePreview.value = { until: Date.now() + PREVIEW_MS };
        if (previewTimer) clearTimeout(previewTimer);
        previewTimer = setTimeout(() => (cuePreview.value = { until: 0 }), PREVIEW_MS + 200);
      }
      lastCfg = cfg;
    });
    $effect(() => {
      void clock.minute;
      void timer.active;
      void cuePreview.value.until;
      const want = anyCue() && cueSubject(untrack(() => clock.now)) !== null;
      if (pending) clearTimeout(pending);
      // A short settle, so flicking a setting doesn't build and close a window repeatedly.
      pending = setTimeout(() => apply(want), want ? 120 : 600);
    });
  });

  return () => {
    stopCfg();
    if (pending) clearTimeout(pending);
    if (previewTimer) clearTimeout(previewTimer);
    apply(false);
  };
}
