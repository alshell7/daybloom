// Self-update from the public release feed (see tauri.conf.json → plugins.updater).
// Checks quietly after launch and every few hours; installing is always the user's
// tap — never a surprise restart in the middle of someone's day. A release that changes only
// the web layer comes as a web update instead (ota.svelte.ts): already downloaded when it is
// offered, it applies with a refresh. A full update wins when both are ready.

import { applyWebUpdate, checkWebUpdate, compareVersions, otaStatus, type OtaStatus } from './ota.svelte';
import { platform } from './platform';
import { countLine, notesFor } from './releaseNotes';
import { settings } from './stores/settings.svelte';
import { view } from './stores/view.svelte';

type Status = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'installing' | 'error';

export const updates = $state<{
  status: Status;
  /** A full install ('app'), or a web update that applies with a refresh ('web'). */
  kind: 'app' | 'web';
  current: string;
  version: string;
  notes: string;
  progress: number;
  error: string;
  checkedAt: number;
}>({ status: 'idle', kind: 'app', current: '', version: '', notes: '', progress: 0, error: '', checkedAt: 0 });

// The plugin's Update handle (not reactive state).
let pending: { version: string; body?: string; downloadAndInstall: (cb: (e: any) => void) => Promise<void> } | null = null;
// Applies a staged web update and reloads (the dev simulation swaps it).
let applyWeb = applyWebUpdate;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The version that runs: a web update's, else the app's. Returns the web update status. */
export async function loadVersion(): Promise<OtaStatus | null> {
  if (!platform.isNative) return null;
  const web = await otaStatus();
  if (web) {
    updates.current = web.version;
    return web;
  }
  const { getVersion } = await import('@tauri-apps/api/app');
  updates.current = await getVersion();
  return null;
}

function offer(kind: 'app' | 'web', version: string, notes: string) {
  updates.kind = kind;
  updates.version = version;
  updates.notes = notes;
  updates.status = 'available';
}

/** A full update: the updater plugin's on a computer, a newer APK on a phone. */
async function checkApp(): Promise<typeof pending> {
  if (!platform.isMobile) {
    const { check } = await import('@tauri-apps/plugin-updater');
    return (await check()) as typeof pending;
  }
  const [{ checkApk }, { deviceCall }, { getVersion }] = await Promise.all([import('./native/apkUpdate'), import('./native/device.svelte'), import('@tauri-apps/api/app')]);
  // An APK replaces the app itself, so it is compared with the installed app, not a web update.
  const r = await checkApk(await getVersion(), (u, i) => platform.fetch(u, i));
  if (!r) return null;
  return {
    version: r.version,
    body: r.notes,
    // Android downloads it, checks the SHA-256 and opens its installer (Extras.kt).
    async downloadAndInstall(cb) {
      cb({ event: 'Started', data: { contentLength: 0 } });
      const res = await deviceCall<{ needsPermission: boolean }>('apkUpdate', { url: r.url, sha256: r.sha256 });
      if (res?.needsPermission) throw new Error('Allow Daybloom to install updates in the screen that just opened, then tap Install again.');
      cb({ event: 'Finished' });
    },
  };
}

export async function checkForUpdates(manual = false) {
  if (!platform.isNative) {
    if (manual) updates.status = 'none';
    return;
  }
  if (updates.status === 'downloading' || updates.status === 'installing') return;
  updates.status = 'checking';
  updates.error = '';
  let failed: unknown = null;
  // Both at once: a slow installer feed does not hold back a web update (it downloads before
  // it is offered, and is offered as soon as it is ready). A new app still wins when it comes.
  const web = checkWebUpdate();
  // Read afresh each time: the web check may offer while the installer feed is still busy.
  const status = (): Status => updates.status;
  web.then((w) => w && status() === 'checking' && offer('web', w.version, w.notes)).catch(() => {});
  try {
    const u = await checkApp();
    if (u) {
      updates.checkedAt = Date.now();
      pending = u as typeof pending;
      if (status() !== 'installing') offer('app', u.version, u.body ?? '');
      return;
    }
  } catch (e) {
    failed = e;
  }
  try {
    const w = await web;
    if (w) {
      updates.checkedAt = Date.now();
      if (status() === 'checking') offer('web', w.version, w.notes);
      return;
    }
  } catch (e) {
    failed ??= e;
  }
  updates.checkedAt = Date.now();
  if (failed) {
    // Offline or the feed is unreachable: stay quiet unless the user asked.
    updates.status = manual ? 'error' : 'idle';
    updates.error = message(failed);
  } else {
    updates.status = 'none';
  }
}

export async function installUpdate() {
  if (updates.kind === 'web') {
    // Already downloaded and verified: the page reloads with it.
    updates.status = 'installing';
    updates.progress = 1;
    try {
      await applyWeb();
    } catch (e) {
      updates.status = 'error';
      updates.error = message(e);
    }
    return;
  }
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
    updates.error = message(e);
  }
}

/** Once after an update: a note with what this version brought, a tap from the full list. */
export function offerWhatsNew(current: string) {
  const seen = settings.value.seenVersion;
  settings.value.seenVersion = current;
  // Not after a web update that did not start (the version went back).
  if (!seen || compareVersions(current, seen) <= 0) return;
  const groups = notesFor(current);
  if (!groups.length) return;
  setTimeout(() => view.say(`Updated to Daybloom ${current} · ${countLine(groups)}`, { label: 'See what’s new', run: () => (view.sheet = { kind: 'whatsnew', version: current }) }, 9000), 2500);
}

/** Background checks for the main window. Returns a stop function. */
export function startUpdateChecks(): () => void {
  if (!platform.isNative) return () => {};
  loadVersion()
    .then((web) => {
      if (updates.current) offerWhatsNew(updates.current);
      if (web?.reverted) setTimeout(() => view.say(`The update to ${web.reverted} didn’t start, so Daybloom stays on ${web.version}`), 2500);
    })
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
// `.offer('0.2.0', { ms: 8000 })` (a slower download), `.offer('0.2.0', { web: true })` (a web
// update: "Refresh to update"), `.reset()`. A finished download stays on "Restarting…" (there is
// nothing to relaunch in a browser).
if (import.meta.env.DEV) {
  const SAMPLE = [
    'New',
    '• A top bar that fits — what doesn’t fit folds into More, and comes back as the window widens.',
    '• Choose your top bar — show or hide each item in Settings › Screen.',
    'Fixes',
    '• Update card — a calm card with what’s new and a progress ring.',
  ].join('\n');
  (globalThis as { __updateSim?: unknown }).__updateSim = {
    offer(version = '0.1.14', o: { notes?: string; fail?: boolean; ms?: number; web?: boolean } = {}) {
      const ms = o.ms ?? 4000;
      const body = o.notes ?? SAMPLE;
      updates.kind = o.web ? 'web' : 'app';
      applyWeb = () => new Promise((_, reject) => setTimeout(() => (o.fail ? reject(new Error('The update could not start.')) : location.reload()), 900));
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
      applyWeb = applyWebUpdate;
      Object.assign(updates, { status: 'idle', kind: 'app', version: '', notes: '', progress: 0, error: '' });
    },
  };
}
