// Wraps the framework-agnostic calendar service in Svelte state and feeds
// external events into the view. Loaded lazily so a build without calendar
// support still runs.

import { addDays, startOfDayMs } from './engine/time';
import { settings } from './stores/settings.svelte';
import { view } from './stores/view.svelte';

type Service = typeof import('./calendar/service').calendarService;

const modules = import.meta.glob('./calendar/service.ts');

export const calendarState = $state<{
  service: Service | null;
  accounts: ReturnType<Service['getAccounts']>;
  status: string;
  lastSyncAt: number | null;
}>({ service: null, accounts: [], status: 'idle', lastSyncAt: null });

function range() {
  const s = startOfDayMs(addDays(view.today, -1));
  return { startMs: s, endMs: startOfDayMs(addDays(view.today, 15)) };
}

function refreshFromService(svc: Service) {
  calendarState.accounts = svc.getAccounts();
  calendarState.status = (svc as any).status ?? 'idle';
  calendarState.lastSyncAt = (svc as any).lastSyncAt ?? null;
  const r = range();
  view.events = svc.eventsBetween(r.startMs, r.endMs);
}

export async function initCalendars(isMain: boolean): Promise<() => void> {
  const load = modules['./calendar/service.ts'];
  if (!load) return () => {};
  const { calendarService: svc } = (await load()) as { calendarService: Service };
  calendarState.service = svc;
  applyGoogleClient(svc);
  await svc.init();
  refreshFromService(svc);
  // Only the main window syncs; it starts as soon as the first account exists.
  let stopSync: (() => void) | undefined;
  const ensureSync = () => {
    if (isMain && !stopSync && svc.getAccounts().length) stopSync = svc.startAutoSync();
  };
  const unsub = svc.subscribe(() => {
    refreshFromService(svc);
    ensureSync();
  });
  ensureSync();
  return () => {
    unsub();
    stopSync?.();
  };
}

export function applyGoogleClient(svc = calendarState.service) {
  const g = settings.value.google;
  const set = (svc as any)?.setGoogleClient ?? googleSetter;
  if (g.clientId && set) set({ clientId: g.clientId, clientSecret: g.clientSecret || undefined });
}

let googleSetter: ((c: { clientId: string; clientSecret?: string }) => void) | null = null;
const googleModules = import.meta.glob('./calendar/google.ts');
googleModules['./calendar/google.ts']?.().then((m: any) => {
  googleSetter = m.setGoogleClient ?? null;
});

export async function syncNow() {
  const svc = calendarState.service;
  if (!svc) return;
  await svc.sync(range(), { force: true });
  refreshFromService(svc);
}
