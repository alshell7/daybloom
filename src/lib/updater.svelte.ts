// Self-update from the public release feed (see tauri.conf.json → plugins.updater).
// Checks quietly after launch and every few hours; installing is always the user's
// tap — never a surprise restart in the middle of someone's day.

import { platform } from './platform';
import { countLine, notesFor } from './releaseNotes';
import { settings } from './stores/settings.svelte';
import { view } from './stores/view.svelte';

type Status = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'installing' | 'error';

export const updates = $state<{
  status: Status;
  current: string;
  version: string;
  notes: string;
  progress: number;
  error: string;
  checkedAt: number;
}>({ status: 'idle', current: '', version: '', notes: '', progress: 0, error: '', checkedAt: 0 });

// The plugin's Update handle (not reactive state).
let pending: { version: string; body?: string; downloadAndInstall: (cb: (e: any) => void) => Promise<void> } | null = null;

export async function loadVersion() {
  if (!platform.isNative) return;
  const { getVersion } = await import('@tauri-apps/api/app');
  updates.current = await getVersion();
}

export async function checkForUpdates(manual = false) {
  if (!platform.isNative) {
    if (manual) updates.status = 'none';
    return;
  }
  if (updates.status === 'downloading' || updates.status === 'installing') return;
  updates.status = 'checking';
  updates.error = '';
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const u = await check();
    updates.checkedAt = Date.now();
    if (u) {
      pending = u as typeof pending;
      updates.version = u.version;
      updates.notes = u.body ?? '';
      updates.status = 'available';
    } else {
      updates.status = 'none';
    }
  } catch (e) {
    // Offline or the feed is unreachable: stay quiet unless the user asked.
    updates.status = manual ? 'error' : 'idle';
    updates.error = e instanceof Error ? e.message : String(e);
  }
}

export async function installUpdate() {
  if (!pending) return;
  updates.status = 'downloading';
  updates.progress = 0;
  let total = 0;
  let received = 0;
  try {
    await pending.downloadAndInstall((ev: any) => {
      if (ev.event === 'Started') total = ev.data?.contentLength ?? 0;
      else if (ev.event === 'Progress') {
        received += ev.data?.chunkLength ?? 0;
        updates.progress = total ? Math.min(1, received / total) : 0;
      } else if (ev.event === 'Finished') {
        updates.progress = 1;
        updates.status = 'installing';
      }
    });
    // Windows' installer closes the app itself; macOS swaps the bundle and we restart.
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    updates.status = 'error';
    updates.error = e instanceof Error ? e.message : String(e);
  }
}

/** Once after an update: a note with what this version brought, a tap from the full list. */
export function offerWhatsNew(current: string) {
  const seen = settings.value.seenVersion;
  settings.value.seenVersion = current;
  if (!seen || seen === current) return;
  const groups = notesFor(current);
  if (!groups.length) return;
  setTimeout(() => view.say(`Updated to Daybloom ${current} · ${countLine(groups)}`, { label: 'See what’s new', run: () => (view.sheet = { kind: 'whatsnew', version: current }) }, 9000), 2500);
}

/** Background checks for the main window. Returns a stop function. */
export function startUpdateChecks(): () => void {
  if (!platform.isNative) return () => {};
  loadVersion()
    .then(() => updates.current && offerWhatsNew(updates.current))
    .catch(() => {});
  const run = () => settings.value.autoUpdate && checkForUpdates();
  const first = setTimeout(run, 8_000);
  const every = setInterval(run, 6 * 60 * 60_000);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
