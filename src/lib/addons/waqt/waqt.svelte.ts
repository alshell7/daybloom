// Waqt, the live side: your settings and marks, the day's salah times in the app's clock,
// prayer blocks in the day (so plans make room for them), the dial's prayer track, and gentle
// reminders before the adhan, at the adhan and before jamaat.

import { untrack } from 'svelte';
import { addDays, atMinutes, formatTime, isoOf, MINUTE } from '../../engine/time';
import type { CalendarEvent, ISODate } from '../../engine/types';
import { categoryColor } from '../../engine/categories';
import { platform } from '../../platform';
import { sounds } from '../../sound';
import { clock } from '../../stores/clock.svelte';
import { persisted } from '../../stores/persisted.svelte';
import { settings } from '../../stores/settings.svelte';
import { view } from '../../stores/view.svelte';
import { migrateWaqt } from './defaults';
import { currentPrayer, hijri, nextPrayer, waqtDay, type PrayerSlot, type WaqtDay } from './times';
import { PRAYER_ICON, type Marked, type PrayerId, type WaqtFile } from './types';

export const waqtFile = persisted<WaqtFile>('addon-waqt', migrateWaqt(null), migrateWaqt);

const at = (date: string, minutes: number) => atMinutes(date, minutes);

/** Cache: the same settings and day give the same times. */
let cacheKey = '';
const cache = new Map<string, WaqtDay | null>();
function dayOf(date: ISODate): WaqtDay | null {
  const key = JSON.stringify(waqtFile.value.settings) + clock.zone;
  if (key !== cacheKey) {
    cacheKey = key;
    cache.clear();
  }
  if (!cache.has(date)) cache.set(date, waqtDay(waqtFile.value.settings, date, at));
  return cache.get(date) ?? null;
}

class Waqt {
  /** The "it's time for Asr" card, while it is up. */
  moment = $state<{ prayer: PrayerSlot; at: number } | null>(null);
  /** Bumped at each adhan: the dial's prayer track blooms once. */
  bloom = $state(0);

  get settings() {
    return waqtFile.value.settings;
  }
  get ready() {
    return !!waqtFile.value.settings.place;
  }

  day(date: ISODate): WaqtDay | null {
    return this.ready ? dayOf(date) : null;
  }
  /** Yesterday, today and tomorrow (enough for "now" and "next" around midnight). */
  around(now = clock.minute): WaqtDay[] {
    const today = isoOf(now);
    return [addDays(today, -1), today, addDays(today, 1)].map((d) => this.day(d)).filter((d): d is WaqtDay => !!d);
  }
  current(now = clock.now) {
    return currentPrayer(this.around(now), now);
  }
  next(now = clock.now) {
    return nextPrayer(this.around(now), now);
  }
  hijri(now = clock.minute) {
    return hijri(now);
  }

  marks(date: ISODate): Partial<Record<PrayerId, Marked>> {
    return waqtFile.value.prayed[date] ?? {};
  }
  /** Mark a prayer: prayed → in jamaat → not marked (a tap cycles). */
  cycle(date: ISODate, id: PrayerId): Marked | null {
    const cur = this.marks(date)[id];
    const next: Marked | null = cur === undefined ? 'prayed' : cur === 'prayed' ? 'jamaat' : null;
    this.mark(date, id, next);
    return next;
  }
  mark(date: ISODate, id: PrayerId, v: Marked | null) {
    const day = { ...this.marks(date) };
    if (v) day[id] = v;
    else delete day[id];
    const all = { ...waqtFile.value.prayed, [date]: day };
    if (!Object.keys(day).length) delete all[date];
    // Keep a year of marks.
    const cutoff = addDays(isoOf(Date.now()), -370);
    for (const k of Object.keys(all)) if (k < cutoff) delete all[k];
    waqtFile.value.prayed = all;
  }
}

export const waqt = new Waqt();

/** Prayer blocks for the day's plans (they make room in free time, and clashes show). */
export function prayerEvents(from: ISODate, days: number): CalendarEvent[] {
  const s = waqt.settings;
  if (!waqt.ready || !s.dial.blocks) return [];
  const out: CalendarEvent[] = [];
  for (let i = 0; i < days; i++) {
    const d = waqt.day(addDays(from, i));
    if (!d) continue;
    for (const p of d.prayers) {
      const start = p.jamaat ?? p.at;
      const len = p.name === 'Jumu’ah' ? s.jamaat.jumuah.minutes : s.dial.minutes;
      out.push({
        id: `salah:${p.id}:${d.date}`,
        provider: 'salah',
        accountId: 'salah',
        calendarId: 'salah',
        title: p.name,
        startMs: start,
        endMs: start + len * MINUTE,
        allDay: false,
        series: `salah:${p.id}`,
        calendarName: p.jamaat ? `Jamaat · adhan ${formatTime(p.at, view.hour12)}` : 'Salah',
        category: 'care',
        icon: PRAYER_ICON[p.id],
        color: categoryColor('care'),
      });
    }
  }
  return out;
}

/** The dial's prayer track: each prayer's window, with its adhan and jamaat. */
export interface PrayerMark {
  id: string;
  name: string;
  at: number;
  end: number;
  jamaat: number | null;
  current: boolean;
}
export function prayerMarks(now = clock.now): PrayerMark[] {
  if (!waqt.ready || !waqt.settings.dial.track) return [];
  const cur = waqt.current(now);
  return waqt.around(now).flatMap((d) => d.prayers.map((p) => ({ id: `${d.date}:${p.id}`, name: p.name, at: p.at, end: p.end, jamaat: p.jamaat, current: cur?.at === p.at })));
}

// ---- reminders

function chime() {
  if (!settings.value.sound || !waqt.settings.remind.sound) return;
  sounds.adhan();
}

/** Other windows (the widget): the prayer blocks only; reminders stay with the planner. */
export function startWaqtView(): () => void {
  const root = $effect.root(() => {
    $effect(() => {
      const from = addDays(view.today, -1);
      void JSON.stringify(waqt.settings);
      void clock.zone;
      const ev = untrack(() => prayerEvents(from, 17));
      view.addonEvents = { ...view.addonEvents, salah: ev };
    });
  });
  return () => {
    root();
    const { salah: _, ...rest } = view.addonEvents;
    view.addonEvents = rest;
  };
}

/** Main window, while the addon is on. */
export function startWaqt(): () => void {
  const fired = new Set<string>();
  const root = $effect.root(() => {
    // Prayer blocks in the day.
    $effect(() => {
      const from = addDays(view.today, -1);
      void JSON.stringify(waqt.settings);
      void clock.zone;
      const ev = untrack(() => prayerEvents(from, 17));
      view.addonEvents = { ...view.addonEvents, salah: ev };
    });

    // Reminders, checked each minute (and when the window wakes).
    $effect(() => {
      const now = clock.minute;
      untrack(() => {
        const s = waqt.settings;
        if (!waqt.ready) return;
        const t = Date.now() + clock.offset;
        const fresh = (when: number) => t >= when && t < when + 90_000;
        for (const d of waqt.around(now)) {
          for (const p of d.prayers) {
            const key = `${d.date}:${p.id}`;
            const hm = (ms: number) => formatTime(ms, view.hour12);
            if (s.remind.before > 0 && fresh(p.at - s.remind.before * MINUTE) && !fired.has(`${key}:pre`)) {
              fired.add(`${key}:pre`);
              void platform.notify(`${p.name} in ${s.remind.before} minutes`, `Adhan at ${hm(p.at)}${p.jamaat ? ` · jamaat at ${hm(p.jamaat)}` : ''}`);
            }
            if (fresh(p.at) && !fired.has(`${key}:adhan`)) {
              fired.add(`${key}:adhan`);
              waqt.bloom++;
              waqt.moment = { prayer: p, at: p.at };
              if (s.remind.atAdhan) {
                const tail = p.jamaat ? `Jamaat at ${hm(p.jamaat)}` : `Its time lasts until ${hm(p.end)}`;
                void platform.notify(`It’s time for ${p.name}`, `${hm(p.at)} · ${tail}`);
                chime();
              }
            }
            if (p.jamaat && s.remind.beforeJamaat > 0 && fresh(p.jamaat - s.remind.beforeJamaat * MINUTE) && !fired.has(`${key}:jam`)) {
              fired.add(`${key}:jam`);
              void platform.notify(`Jamaat for ${p.name} in ${s.remind.beforeJamaat} minutes`, `At ${hm(p.jamaat)}. Time for wudu.`);
            }
          }
        }
      });
    });
  });
  return () => {
    root();
    const { salah: _, ...rest } = view.addonEvents;
    view.addonEvents = rest;
  };
}

/** For the panel's sky: how far the sun is between sunrise and Maghrib (0..1), else null. */
export function sunProgress(day: WaqtDay | null, now: number): number | null {
  if (!day) return null;
  const set = day.prayers.find((p) => p.id === 'maghrib')!.at;
  if (now < day.sunrise || now > set) return null;
  return (now - day.sunrise) / (set - day.sunrise);
}
