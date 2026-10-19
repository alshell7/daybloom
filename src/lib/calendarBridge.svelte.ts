// Wraps the framework-agnostic calendar service in Svelte state and feeds
// external events into the view. Loaded lazily so a build without calendar
// support still runs.

import { addDays, startOfDayMs } from './engine/time';
import { settings } from './stores/settings.svelte';
import { view } from './stores/view.svelte';
import type { CalendarEvent } from './engine/types';
import type { CalendarAccount } from './calendar/types';
import type { IcsPreview } from './calendar/preview';

type Service = typeof import('./calendar/service').calendarService;

const modules = import.meta.glob('./calendar/service.ts');
const previewModules = import.meta.glob('./calendar/preview.ts');

/** The calendars panel counts events this far ahead. */
export const UPCOMING_DAYS = 14;

export const calendarState = $state<{
  service: Service | null;
  accounts: ReturnType<Service['getAccounts']>;
  status: string;
  lastSyncAt: number | null;
  /** `upcomingKey(accountId, calendarId)` → events in the next 14 days. Shown calendars only. */
  upcoming: Record<string, number>;
  /** A Google OAuth client is set (from `.env` or Settings). */
  googleConfigured: boolean;
}>({ service: null, accounts: [], status: 'idle', lastSyncAt: null, upcoming: {}, googleConfigured: false });

export const upcomingKey = (accountId: string, calendarId: string) => `${accountId}\n${calendarId}`;

/** Events in the next 14 days for one calendar, or null when the calendar is off (it isn't fetched). */
export function upcomingCount(accountId: string, calendarId: string): number | null {
  const acc = calendarState.accounts.find((a) => a.id === accountId);
  const cal = acc?.calendars.find((c) => c.id === calendarId);
  if (!acc?.enabled || !cal?.enabled) return null;
  return calendarState.upcoming[upcomingKey(accountId, calendarId)] ?? 0;
}

function countUpcoming(svc: Service): Record<string, number> {
  const now = Date.now();
  const out: Record<string, number> = {};
  for (const ev of svc.eventsBetween(now, now + UPCOMING_DAYS * 86_400_000)) {
    const key = upcomingKey(ev.accountId, ev.calendarId);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function range() {
  const s = startOfDayMs(addDays(view.today, -1));
  return { startMs: s, endMs: startOfDayMs(addDays(view.today, 15)) };
}

function refreshFromService(svc: Service) {
  calendarState.accounts = svc.getAccounts();
  calendarState.status = (svc as any).status ?? 'idle';
  calendarState.lastSyncAt = (svc as any).lastSyncAt ?? null;
  calendarState.upcoming = countUpcoming(svc);
  calendarState.googleConfigured = svc.googleConfigured;
  const r = range();
  view.events = dedupeEvents(svc.eventsBetween(r.startMs, r.endMs));
}

/**
 * The same meeting invited to work *and* personal calendars shows once: same title (case and
 * spacing ignored) at the same start and end merges, remembering every account it came from.
 */
export function dedupeEvents(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Map<string, CalendarEvent>();
  const out: CalendarEvent[] = [];
  for (const ev of events) {
    const key = `${ev.title.trim().toLowerCase().replace(/\s+/g, ' ')}|${ev.startMs}|${ev.endMs}|${ev.allDay}`;
    const first = seen.get(key);
    if (first) {
      if (first.accountId !== ev.accountId && !first.alsoIn?.includes(ev.accountId)) first.alsoIn = [...(first.alsoIn ?? []), ev.accountId];
      continue;
    }
    const copy = { ...ev };
    seen.set(key, copy);
    out.push(copy);
  }
  return out;
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

/** Short human label for an account: "Work", or the part of an email before the @. */
export function accountLabel(accountId: string): string {
  const acc = calendarState.accounts.find((a) => a.id === accountId);
  if (!acc) return 'Calendar';
  if (acc.name?.trim()) return acc.name.trim();
  return acc.label.includes('@') ? acc.label.split('@')[0] : acc.label;
}

export async function syncNow() {
  const svc = calendarState.service;
  if (!svc) return;
  await svc.sync(range(), { force: true });
  refreshFromService(svc);
}

function requireService(): Service {
  const svc = calendarState.service;
  if (!svc) throw new Error('Calendar support isn’t included in this build.');
  return svc;
}

/** Sign in to Google in the browser and add the account (or refresh it when it is already there). */
export async function connectGoogleAccount(): Promise<CalendarAccount> {
  const svc = requireService();
  applyGoogleClient(svc);
  const account = await svc.connectGoogle();
  await syncNow();
  return account;
}

/**
 * Check a calendar link without adding it. Never rejects: problems come back as
 * `{ ok: false, kind, message, advice }`. Pass `preview.url` to `addCalendarLink`.
 */
export async function previewCalendarLink(link: string): Promise<IcsPreview> {
  const load = previewModules['./calendar/preview.ts'];
  if (!load) {
    return { ok: false, kind: 'network', message: 'Calendar links aren’t included in this build.', advice: '', provider: 'other' };
  }
  const { previewIcs } = (await load()) as typeof import('./calendar/preview');
  return previewIcs(link);
}

/** Subscribe to a calendar link. The link goes to the OS keychain; only a short form is saved. */
export async function addCalendarLink(link: string, label?: string): Promise<CalendarAccount> {
  const account = await requireService().addIcs(link, label?.trim() || undefined);
  await syncNow();
  return account;
}
