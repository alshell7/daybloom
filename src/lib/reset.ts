// Settings › App › Reset: start over, as much as you choose. Each part names what it clears —
// your blocks, your progress, your settings, addons and their data, AI services and keys,
// calendar connections, GitHub sync, downloaded models — or everything at once. Keys go from
// the system keychain too. Saved files are deleted (not overwritten), saving stops, and every
// window reloads into a fresh start.

import { platform } from './platform';
import { freezeSaves } from './stores/persisted.svelte';
import { PROVIDERS } from './ai/providers';

export type ResetPart = 'blocks' | 'progress' | 'settings' | 'addons' | 'ai' | 'calendars' | 'sync' | 'models';

export interface PartInfo {
  id: ResetPart;
  name: string;
  icon: string;
  what: string;
}

export const PARTS: PartInfo[] = [
  { id: 'blocks', name: 'Blocks and backlog', icon: 'dial', what: 'Every block, repeat and backlog task, the Trash, what you ticked or skipped in your calendars, alarms and a running focus session.' },
  { id: 'progress', name: 'Progress', icon: 'trophy', what: 'Badges, your rhythm and what you asked Ask Daybloom.' },
  { id: 'settings', name: 'Settings', icon: 'sliders', what: 'Theme, dial, rhythm, alarms, the widget, the top bar, which addons are on, and the getting-started card.' },
  { id: 'addons', name: 'Addons and their data', icon: 'puzzle', what: 'Work projects and bills, tracked time, breadcrumbs, Waqt marks and settings, Alef’s memory and look, and the rest.' },
  { id: 'ai', name: 'AI services and keys', icon: 'key', what: 'Your AI services, their keys in the keychain, and who uses what.' },
  { id: 'calendars', name: 'Calendars', icon: 'calendar', what: 'Connected calendars and their sign-ins. The calendars themselves stay as they are.' },
  { id: 'sync', name: 'Sync', icon: 'cloud', what: 'GitHub and Cloudflare D1 sync on this device: tokens, snapshots and the saved master-password key. Your repo and database stay as they are.' },
  { id: 'models', name: 'Downloaded models', icon: 'cpu', what: 'Needle, Whistle and Alef’s voice on this computer (download them again any time).' },
];

/** Saved files each part clears (addons: every `addon-*`). */
const FILES: Record<ResetPart, (all: string[]) => string[]> = {
  blocks: () => ['tasks', 'trash', 'event-states', 'timer', 'nudges', 'alarms'],
  progress: () => ['progress', 'streaks', 'assistant'],
  settings: () => ['settings', 'layout', 'cue-preview'],
  addons: (all) => all.filter((k) => k.startsWith('addon-')),
  ai: () => ['ai'],
  calendars: () => ['calendars', 'calendar-cache', 'calendar-google-client'],
  sync: (all) => ['sync-config', 'sync-d1-config', ...all.filter((k) => k.startsWith('sync-base-') || k.startsWith('sync-d1-base-'))],
  models: () => [],
};

/** The files a choice clears (with `everything`, every saved file there is). */
export function filesFor(parts: ResetPart[], all: string[], everything = false): string[] {
  if (everything) return [...new Set(all)];
  return [...new Set(parts.flatMap((p) => FILES[p](all)))];
}

/** Reset the chosen parts, then reload every window. */
export async function resetApp(parts: ResetPart[], everything = false): Promise<void> {
  const chosen = new Set<ResetPart>(everything ? PARTS.map((p) => p.id) : parts);
  // Sign-ins and keys first, through their own services (they know their keychain entries).
  if (chosen.has('calendars')) {
    try {
      const { calendarService } = await import('./calendar/service');
      await calendarService.init();
      for (const a of [...calendarService.getAccounts()]) await calendarService.removeAccount(a.id).catch(() => {});
    } catch (e) {
      console.warn('[daybloom] reset calendars', e);
    }
  }
  if (chosen.has('sync')) {
    try {
      const { githubSync, d1Sync, VAULT_ACCOUNT } = await import('./sync/sync.svelte');
      await githubSync.disconnect();
      await d1Sync.disconnect();
      await platform.secrets.delete(VAULT_ACCOUNT).catch(() => {});
    } catch (e) {
      console.warn('[daybloom] reset sync', e);
    }
  }
  if (chosen.has('ai')) {
    for (const p of PROVIDERS) {
      await platform.secrets.delete(`ai:${p.id}`).catch(() => {});
      await platform.secrets.delete(`alef-llm:${p.id}`).catch(() => {});
    }
  }
  if (chosen.has('models')) {
    try {
      const [{ needle, whistle }, { tinyTts }] = await Promise.all([import('./assistant/engine.svelte'), import('./addons/alef/tts/tts.svelte')]);
      await Promise.all([needle.forget(), whistle.forget(), tinyTts.forget()].map((x) => Promise.resolve(x).catch(() => {})));
    } catch (e) {
      console.warn('[daybloom] reset models', e);
    }
  }
  // Then the files: nothing may write them again before the reload.
  freezeSaves();
  const all = await platform.keys().catch(() => [] as string[]);
  for (const k of filesFor([...chosen], all, everything)) await platform.remove(k).catch(() => {});
  await platform.broadcast('app-reset', {}).catch(() => {});
  location.reload();
}

/** Other windows (the widget): reload when the planner resets. */
export function followResets(): () => void {
  return platform.onBroadcast('app-reset', () => {
    freezeSaves();
    location.reload();
  });
}
