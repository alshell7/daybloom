// Web updates over the air (src-tauri/src/ota.rs). A release that changes only the web layer
// ships as a signed bundle: it downloads and is verified quietly, then the update card offers
// "Refresh to update"; without a tap it starts with the next launch. Full installs still go
// through updater.svelte.ts, which prefers them when both are ready.
//
//   ota_status()         -> OtaStatus
//   ota_stage(url, sig)  -> Staged    download, signature, SHA-256 of every file
//   ota_apply()          -> version   the other windows reload natively; this one reloads here
//   ota_ready(runtime, version) -> void  the planner started, so the new bundle is good
//   ota_rollback()       -> version   back to the bundle before ('' is the built-in one)

import { platform } from './platform';

export interface Staged {
  version: string;
  notes: string;
}

export interface OtaStatus {
  runtime: number;
  /** The app's own (built-in) version. */
  embedded: string;
  /** What runs: the web update's version, else the app's. */
  version: string;
  active: string | null;
  previous: string | null;
  /** Downloaded and verified, waiting for "Refresh to update" or the next launch. */
  pending: Staged | null;
  blocked: string[];
  /** A web update that did not start this launch, so the one before it runs again. */
  reverted: string | null;
  feed: string;
}

/** One entry of web-latest.json: the newest bundle for one runtime. */
export interface FeedEntry {
  version: string;
  runtime: number;
  url: string;
  sig: string;
  /** How many files, and the zip's size (for information). */
  files?: number;
  bytes?: number;
}

/** The native API level this page was built for (src-tauri/runtime.json). */
export const RUNTIME = Number(import.meta.env.VITE_RUNTIME);
/** The version this page was built as (package.json). */
export const PAGE_VERSION = import.meta.env.VITE_VERSION;

/** The web update in use, for Settings › Updates. */
export const web = $state<{ embedded: string; active: string | null; previous: string | null }>({ embedded: '', active: null, previous: null });

const VERSION = /^\d{1,9}\.\d{1,9}\.\d{1,9}$/;

/** -1, 0 or 1 for two x.y.z versions. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** The feed's bundle for this binary's runtime, if it is newer than what runs and not set aside. */
export function pickBundle(feed: unknown, s: Pick<OtaStatus, 'runtime' | 'version' | 'blocked'>): FeedEntry | null {
  const list = (feed as { bundles?: unknown } | null)?.bundles;
  if (!Array.isArray(list)) return null;
  let best: FeedEntry | null = null;
  for (const e of list as Partial<FeedEntry>[]) {
    if (!e || e.runtime !== s.runtime || typeof e.version !== 'string' || !VERSION.test(e.version)) continue;
    if (typeof e.url !== 'string' || !e.url || typeof e.sig !== 'string' || !e.sig) continue;
    if (s.blocked.includes(e.version) || compareVersions(e.version, s.version) <= 0) continue;
    if (!best || compareVersions(e.version, best.version) > 0) best = e as FeedEntry;
  }
  return best;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/** Null in a browser and in development (there the dev server serves the page). */
export async function otaStatus(): Promise<OtaStatus | null> {
  if (!platform.isNative) return null;
  try {
    const s = await invoke<OtaStatus>('ota_status');
    web.embedded = s.embedded;
    web.active = s.active;
    web.previous = s.previous;
    return s;
  } catch {
    return null;
  }
}

let checking: Promise<Staged | null> | null = null;

/**
 * A newer web update, downloaded and verified, ready to apply; null when there is none.
 * Throws when the feed or the download fails.
 */
export function checkWebUpdate(): Promise<Staged | null> {
  checking ??= (async () => {
    const s = await otaStatus();
    if (!s) return null;
    const res = await platform.fetch(s.feed, { cache: 'no-store' }).catch((e) => (s.pending ? null : Promise.reject(e)));
    // No web updates published yet (404), or offline with one already waiting.
    if (!res || res.status === 404) return s.pending;
    if (!res.ok) throw new Error(`The update feed answered ${res.status}`);
    // Newer than what runs, and than one already waiting (that one stays if nothing is newer).
    const pick = pickBundle(await res.json(), { ...s, version: s.pending?.version ?? s.version });
    return pick ? invoke<Staged>('ota_stage', { url: pick.url, sig: pick.sig }) : s.pending;
  })().finally(() => (checking = null));
  return checking;
}

/** Serves the staged web update and reloads this window with it. */
export async function applyWebUpdate() {
  await invoke<string>('ota_apply');
  location.reload();
}

/** Back to the version before the web update in use; that update is not taken again. */
export async function rollbackWebUpdate() {
  await invoke<string>('ota_rollback');
  location.reload();
}

let reported = false;

/** The planner is up: a new web update started fine. Once per page. */
export function reportStarted() {
  if (!platform.isNative || reported) return;
  reported = true;
  invoke('ota_ready', { runtime: RUNTIME, version: PAGE_VERSION }).catch(() => {});
}
