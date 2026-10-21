// Starts and stops addon engines as addons are switched on and off (main window only).
// Work reads tracked time from the Time Tracker, so tracked minutes bill when they exist.

import { isOn } from './registry';
import { startFollowingFocus, startTracker, tracker, trackerFile } from './tracker/tracker.svelte';
import { work } from './work/work.svelte';
import { crumbsFile, startCrumbs } from './crumbs/crumbs.svelte';
import { realityFile, startReality } from './reality/reality.svelte';
import { startWaqt, startWaqtView, waqtFile } from './waqt/waqt.svelte';
import { mcpFile, startMcp } from './mcp/mcp.svelte';
import { startLandings } from './landings/landings.svelte';
import { landingsFile } from './landings/pad.svelte';
import { retroFile, startRetro } from './retro/retro.svelte';
import { alefFile, startAlef, startAlefView } from './alef/alef.svelte';
import { viewsFile } from './views/views.svelte';
import { view } from '../stores/view.svelte';

/**
 * Read a store from disk only if nothing has yet. GitHub sync loads these stores too, and a
 * second read could land after a sync wrote to the store and put the older copy back.
 */
export const loaded = (f: { ready: boolean; load(): Promise<void> }) => (f.ready ? Promise.resolve() : f.load());

/** The widget: what addons add to the dial (salah blocks, Alef's face), without their reminders. */
export function startAddonViews(): () => void {
  let stop: (() => void) | null = null;
  let stopAlef: (() => void) | null = null;
  const root = $effect.root(() => {
    $effect(() => {
      const on = isOn('alef');
      if (on && !stopAlef) {
        void loaded(alefFile).then(() => {
          if (isOn('alef') && !stopAlef) stopAlef = startAlefView();
        });
      } else if (!on && stopAlef) {
        stopAlef();
        stopAlef = null;
      }
    });
    $effect(() => {
      const on = isOn('waqt');
      if (on && !stop) {
        void loaded(waqtFile).then(() => {
          if (isOn('waqt') && !stop) stop = startWaqtView();
        });
      } else if (!on && stop) {
        stop();
        stop = null;
      }
    });
  });
  return () => {
    root();
    stop?.();
    stopAlef?.();
  };
}

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
  let stopMcp: (() => void) | null = null;
  let stopLandings: (() => void) | null = null;
  let stopRetro: (() => void) | null = null;
  let stopAlef: (() => void) | null = null;
  const root = $effect.root(() => {
    $effect(() => {
      const on = isOn('alef');
      if (on && !stopAlef) {
        void loaded(alefFile).then(() => {
          if (isOn('alef') && !stopAlef) stopAlef = startAlef();
        });
      } else if (!on && stopAlef) {
        stopAlef();
        stopAlef = null;
      }
    });
    $effect(() => {
      const on = isOn('retro');
      if (on && !stopRetro) {
        void loaded(retroFile).then(() => {
          if (isOn('retro') && !stopRetro) stopRetro = startRetro();
        });
      } else if (!on && stopRetro) {
        stopRetro();
        stopRetro = null;
      }
    });
    $effect(() => {
      const on = isOn('landings');
      if (on && !stopLandings) {
        void loaded(landingsFile).then(() => {
          if (isOn('landings') && !stopLandings) stopLandings = startLandings();
        });
      } else if (!on && stopLandings) {
        stopLandings();
        stopLandings = null;
      }
    });
    $effect(() => {
      if (isOn('work') && !work.ready) void work.load();
    });
    $effect(() => {
      // Timeline views: just its choice of view (List, Board or Gantt) to read.
      if (isOn('views')) void loaded(viewsFile);
    });
    $effect(() => {
      const on = isOn('crumbs');
      if (on && !stopCrumbs) {
        void loaded(crumbsFile).then(() => {
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
        void loaded(realityFile).then(() => {
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
        void loaded(waqtFile).then(() => {
          if (isOn('waqt') && !stopWaqt) stopWaqt = startWaqt();
        });
      } else if (!on && stopWaqt) {
        stopWaqt();
        stopWaqt = null;
      }
    });
    $effect(() => {
      const on = isOn('mcp');
      if (on && !stopMcp) {
        void mcpFile.load().then(() => {
          if (isOn('mcp') && !stopMcp) stopMcp = startMcp();
        });
      } else if (!on && stopMcp) {
        stopMcp();
        stopMcp = null;
      }
    });
    $effect(() => {
      const on = isOn('tracker');
      if (on && !stopTracker) {
        void loaded(tracker).then(() => {
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
    stopMcp?.();
    stopLandings?.();
    stopRetro?.();
    stopAlef?.();
    stopTracker?.();
    stopFocus?.();
    disconnect();
  };
}
