// Starts and stops addon engines as addons are switched on and off (main window only).
// Work reads tracked time from the Time Tracker, so tracked minutes bill when they exist.

import { isOn } from './registry';
import { startFollowingFocus, startTracker, tracker, trackerFile } from './tracker/tracker.svelte';
import { work } from './work/work.svelte';
import { view } from '../stores/view.svelte';

export function startAddons(): () => void {
  const disconnect = work.connect({
    entries: () => (isOn('tracker') ? trackerFile.value.entries : []),
    events: () => view.events,
  });
  let stopTracker: (() => void) | null = null;
  let stopFocus: (() => void) | null = null;
  const root = $effect.root(() => {
    $effect(() => {
      if (isOn('work') && !work.ready) void work.load();
    });
    $effect(() => {
      const on = isOn('tracker');
      if (on && !stopTracker) {
        void tracker.load().then(() => {
          if (!isOn('tracker') || stopTracker) return;
          stopTracker = startTracker();
          stopFocus = startFollowingFocus();
        });
      } else if (!on && stopTracker) {
        if (tracker.running) tracker.stop();
        stopTracker();
        stopFocus?.();
        stopTracker = null;
        stopFocus = null;
      }
    });
  });
  return () => {
    root();
    stopTracker?.();
    stopFocus?.();
    disconnect();
  };
}
