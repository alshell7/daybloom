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
  if (platform.isMobile) return checkPhone(manual);
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

/** The phone: a new APK from the Android feed, installed by Android itself. */
async function checkPhone(manual: boolean) {
  if (updates.status === 'downloading' || updates.status === 'installing') return;
  updates.status = 'checking';
  try {
    const [{ checkApk }, { deviceCall }] = await Promise.all([import('./native/apkUpdate'), import('./native/device.svelte')]);
    if (!updates.current) await loadVersion();
    const r = await checkApk(updates.current, (u, i) => platform.fetch(u, i));
    updates.checkedAt = Date.now();
    if (!r) {
      updates.status = 'none';
      return;
    }
    pending = {
      version: r.version,
      body: r.notes,
      async downloadAndInstall(cb) {
        cb({ event: 'Started', data: { contentLength: 0 } });
        const res = await deviceCall<{ needsPermission: boolean }>('apkUpdate', { url: r.url, sha256: r.sha256 });
        if (res?.needsPermission) throw new Error('Allow Daybloom to install updates in the screen that just opened, then tap Install again.');
        cb({ event: 'Finished' });
      },
    };
    updates.version = r.version;
    updates.notes = r.notes;
    updates.status = 'available';
  } catch (e) {
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
    // A phone: Android's installer has taken over and replaces the app itself.
    if (platform.isMobile) return;
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

if (import.meta.env.DEV) (globalThis as { __updates?: typeof updates }).__updates = updates;

// Dev only: pretend a release arrived, to see the update card in a browser.
// `__updateSim.offer()`, `.offer('0.2.0', { fail: true })` (the download stops halfway),
// `.offer('0.2.0', { ms: 8000 })` (a slower download), `.reset()`. A finished download stays on
// "Restarting…" (there is nothing to relaunch in a browser).
if (import.meta.env.DEV) {
  const SAMPLE = [
    'New',
    '• A top bar that fits — what doesn’t fit folds into More, and comes back as the window widens.',
    '• Choose your top bar — show or hide each item in Settings › Screen.',
    'Fixes',
    '• Update card — a calm card with what’s new and a progress ring.',
  ].join('\n');
  (globalThis as { __updateSim?: unknown }).__updateSim = {
    offer(version = '0.1.14', o: { notes?: string; fail?: boolean; ms?: number } = {}) {
      const ms = o.ms ?? 4000;
      const body = o.notes ?? SAMPLE;
      pending = {
        version,
        body,
        downloadAndInstall: (cb) =>
          new Promise<void>((_, reject) => {
            const total = 12_000_000;
            const chunk = total / (ms / 100);
            let got = 0;
            cb({ event: 'Started', data: { contentLength: total } });
            const t = setInterval(() => {
              got += chunk;
              if (o.fail && got >= total / 2) {
                clearInterval(t);
                reject(new Error('The download was interrupted.'));
              } else if (got >= total) {
                clearInterval(t);
                cb({ event: 'Finished' });
              } else cb({ event: 'Progress', data: { chunkLength: chunk } });
            }, 100);
          }),
      };
      updates.version = version;
      updates.notes = body;
      updates.error = '';
      updates.progress = 0;
      updates.status = 'available';
    },
    reset() {
      pending = null;
      Object.assign(updates, { status: 'idle', version: '', notes: '', progress: 0, error: '' });
    },
  };
}
