// Everything the top bar can show, in bar order: an id (what Settings › Screen › Top bar stores
// in `topBar.hidden`), a group (the More menu's headings and the small gaps between groups in
// the bar), and a priority (higher stays in the bar longer when the window narrows; see fit.ts).

import { enabledAddons, isOn } from '../../lib/addons/registry';
import { platform } from '../../lib/platform';

export type GroupId = 'now' | 'navigate' | 'do' | 'see' | 'addons' | 'app';

export const GROUPS: { id: GroupId; name: string }[] = [
  { id: 'now', name: 'Now' },
  { id: 'navigate', name: 'Navigate' },
  { id: 'do', name: 'Do' },
  { id: 'see', name: 'See' },
  { id: 'addons', name: 'Addons' },
  { id: 'app', name: 'App' },
];

export interface BarItemDef {
  id: string;
  group: GroupId;
  label: string;
  icon: string;
  priority: number;
  /** Its keyboard shortcut, as shown. */
  kbd?: string;
  /** A few words for Settings (when it shows, what it does). */
  note?: string;
  /** Part of the day on the left (the clock, the week, the zone), not an action on the right. */
  lead?: boolean;
  /** An addon's sheet. */
  sheet?: string;
}

const mod = platform.os === 'mac' ? '⌘' : 'Ctrl ';
export const KBD = { ask: `${mod}K`, privacy: platform.os === 'mac' ? '⇧⌘P' : 'Ctrl ⇧ P' };
/** A control's name for screen readers, with its key on a computer (a phone has no keys). */
export const keyed = (label: string, key: string) => (platform.isMobile ? label : `${label} (${key})`);

const BEFORE_ADDONS: BarItemDef[] = [
  { id: 'private', group: 'now', label: 'Privacy badge', icon: 'eye-off', priority: 97, note: 'While privacy mode is on' },
  { id: 'session', group: 'now', label: 'Focus timer', icon: 'hourglass', priority: 99, note: 'While a focus session runs outside focus mode' },
  { id: 'tracker', group: 'now', label: 'Time Tracker', icon: 'timer', priority: 98, note: 'While the stopwatch runs' },
  { id: 'date', group: 'navigate', label: 'Day and date', icon: 'calendar-clock', priority: 0, lead: true, note: platform.isMobile ? 'The clock takes you to today; the date opens the month' : 'The clock takes you to today (T); the date opens the month (M)' },
  { id: 'week', group: 'navigate', label: 'Week', icon: 'calendar-range', priority: 0, lead: true, note: platform.isMobile ? 'Swipe to look at other weeks' : 'Swipe or ‹ › to look at other weeks · ← → move a day' },
  { id: 'zone', group: 'navigate', label: 'Time zone', icon: 'globe', priority: 0, lead: true },
  { id: 'ask', group: 'do', label: 'Ask Daybloom', icon: 'sparkles', priority: 80, kbd: KBD.ask },
  { id: 'backlog', group: 'do', label: 'Backlog', icon: 'inbox', priority: 76, kbd: 'B' },
  { id: 'focus', group: 'do', label: 'Focus', icon: 'focus', priority: 78, kbd: 'F' },
  { id: 'insights', group: 'see', label: 'Your week', icon: 'chart', priority: 56, kbd: 'I' },
  { id: 'calendars', group: 'see', label: 'Calendars', icon: 'calendar', priority: 66, note: 'Once a calendar is connected' },
  { id: 'theme', group: 'see', label: 'Light and dark', icon: 'sun-moon', priority: 38 },
];

const AFTER_ADDONS: BarItemDef[] = [
  { id: 'widget', group: 'app', label: 'Desktop widget', icon: 'picture', priority: 46, kbd: 'W' },
  { id: 'addons', group: 'app', label: 'Addons gallery', icon: 'puzzle', priority: 20 },
  { id: 'settings', group: 'app', label: 'Settings', icon: 'settings', priority: 70, kbd: ',', note: 'Always in the bar or in More' },
];

/** Every item the bar can show right now, in bar order (addons only while they're on). */
export function barCatalog(): BarItemDef[] {
  const addons = enabledAddons().filter((a) => a.sheet);
  const n = addons.length;
  return [
    ...BEFORE_ADDONS.filter((d) => d.id !== 'tracker' || isOn('tracker')),
    // The first addon stays a little longer than the next.
    ...addons.map((a, i): BarItemDef => ({ id: `addon:${a.id}`, group: 'addons', label: a.name, icon: a.icon, priority: 30 + (n - i) * 0.01, sheet: a.sheet })),
    // A phone has no desktop widget (its home-screen widgets are added from the launcher).
    ...AFTER_ADDONS.filter((d) => d.id !== 'widget' || !platform.isMobile),
  ];
}
