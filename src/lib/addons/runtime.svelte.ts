// Starts and stops addon engines as addons are switched on and off (main window only).
// Work reads tracked time from the Time Tracker, so tracked minutes bill when they exist.

import { isOn } from './registry';
import { startFollowingFocus, startTracker, tracker, trackerFile } from './tracker/tracker.svelte';
import { work } from './work/work.svelte';
import { crumbsFile, startCrumbs } from './crumbs/crumbs.svelte';
import { realityFile, startReality } from './reality/reality.svelte';
import { startWaqt, waqtFile } from './waqt/waqt.svelte';
import { view } from '../stores/view.svelte';

export function startAddons(): () => void {
  const disconnect = work.connect({
    entries: () => (isOn('tracker') ? trackerFile.value.entries : []),
    events: () => view.events,
  });
  let stopTracker: (() => void) | null = null;
  let stopFocus: (() => void) | null = null;
  let stopCrumbs: (() => void) | null = null;
  let stopReality: (() => void) | null = null;
  let stopWaqt: (() => void) | null = null;
  const root = $effect.root(() => {
    $effect(() => {
      if (isOn('work') && !work.ready) void work.load();
    });
    $effect(() => {
      const on = isOn('crumbs');
      if (on && !stopCrumbs) {
        void crumbsFile.load().then(() => {
          if (isOn('crumbs') && !stopCrumbs) stopCrumbs = startCrumbs();
        });
      } else if (!on && stopCrumbs) {
        stopCrumbs();
        stopCrumbs = null;
      }
    });
    $effect(() => {
      const on = isOn('reality');
      if (on && !stopReality) {
        void realityFile.load().then(() => {
          if (isOn('reality') && !stopReality) stopReality = startReality();
        });
      } else if (!on && stopReality) {
        stopReality();
        stopReality = null;
      }
    });
    $effect(() => {
      const on = isOn('waqt');
      if (on && !stopWaqt) {
        void waqtFile.load().then(() => {
          if (isOn('waqt') && !stopWaqt) stopWaqt = startWaqt();
        });
      } else if (!on && stopWaqt) {
        stopWaqt();
        stopWaqt = null;
      }
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
    stopCrumbs?.();
    stopReality?.();
    stopWaqt?.();
    stopTracker?.();
    stopFocus?.();
    disconnect();
  };
}
