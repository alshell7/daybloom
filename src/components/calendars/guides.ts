// Copy for the calendars panel: where each service hides its calendar link, written as
// short imperative steps (one action per sentence), plus small display helpers.

import type { IcsSource } from '../../lib/calendar/preview';
import { formatTime, isoOf, daysBetween, toISODate } from '../../lib/engine/time';

export type GuideId = 'google' | 'icloud' | 'outlook';

/** Fixes an account card hands to the panel, because they open the add-a-calendar area. */
export type PanelFix = 'replace-link' | 'setup-google';

export interface Guide {
  id: GuideId;
  name: string;
  icon: string;
  /** One action per step. */
  steps: string[];
  /** Short facts to know, shown under the steps. */
  notes: string[];
}

export const GUIDES: Guide[] = [
  {
    id: 'google',
    name: 'Google Calendar',
    icon: 'google',
    steps: [
      'Open Google Calendar in a web browser on a computer.',
      'Click the gear icon at the top.',
      'Click Settings.',
      'On the left, under “Settings for my calendars”, click the calendar.',
      'Click Integrate calendar.',
      'Find “Secret address in iCal format”.',
      'Click the copy button next to it.',
      'Paste the address here.',
    ],
    notes: [
      'Do not use the public address. It works only for public calendars.',
      'Keep the secret address private. Anyone with it can see your events.',
    ],
  },
  {
    id: 'icloud',
    name: 'Apple iCloud',
    icon: 'apple',
    steps: [
      'Open the Calendar app on your iPhone or iPad.',
      'Tap Calendars at the bottom.',
      'Tap the info button next to the calendar.',
      'Turn on Public Calendar.',
      'Tap Share Link.',
      'Tap Copy.',
      'Paste the link here. It starts with webcal://.',
    ],
    notes: [
      'On a Mac, Control-click the calendar in the Calendar app. Choose Share Calendar. Select Public Calendar. Copy the link.',
      'Anyone with a public link can see the calendar.',
    ],
  },
  {
    id: 'outlook',
    name: 'Outlook',
    icon: 'calendar',
    steps: [
      'Open Outlook on the web and sign in.',
      'Click Settings (the gear icon).',
      'Click Calendar.',
      'Click Shared calendars.',
      'Under “Publish a calendar”, select the calendar.',
      'Select “Can view all details”.',
      'Click Publish.',
      'Click the ICS link. Do not use the HTML link.',
      'Click Copy link.',
      'Paste the link here.',
    ],
    notes: ['Anyone with the link can see the calendar. To stop this, click Unpublish.'],
  },
];

/** The guide that matches a link's service, if there is one. */
export function guideFor(source: IcsSource | undefined): GuideId | null {
  return source === 'google' || source === 'icloud' || source === 'outlook' ? source : null;
}

/** Service of a stored account, from the host at the start of its display link. */
export function sourceOfDisplayUrl(displayUrl: string | undefined): IcsSource {
  const host = (displayUrl ?? '').split('/')[0].toLowerCase();
  const is = (...domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));
  if (is('google.com')) return 'google';
  if (is('icloud.com', 'me.com', 'mac.com')) return 'icloud';
  if (is('outlook.com', 'office365.com', 'office.com', 'live.com', 'hotmail.com')) return 'outlook';
  if (is('fastmail.com', 'fastmail.fm', 'user.fm', 'messagingengine.com')) return 'fastmail';
  return 'other';
}

export const SOURCE_ICON: Record<IcsSource, string> = {
  google: 'google',
  icloud: 'apple',
  outlook: 'calendar',
  fastmail: 'link',
  other: 'link',
};

const MIN = 60_000;

/** "Synced just now", "Synced 3 min ago", "Synced 2 h ago", "Synced on Mon 12". */
export function syncedAgo(lastSyncAt: number | undefined, now: number): string {
  if (!lastSyncAt) return 'Not synced yet';
  const ago = Math.max(0, now - lastSyncAt);
  if (ago < MIN) return 'Synced just now';
  if (ago < 60 * MIN) return `Synced ${Math.floor(ago / MIN)} min ago`;
  if (ago < 24 * 60 * MIN) return `Synced ${Math.floor(ago / (60 * MIN))} h ago`;
  return `Synced on ${new Date(lastSyncAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

/** "Now", "Today, 09:30", "Tomorrow, all day", "Thursday, 14:00", "Thu 30 Oct, 09:00". */
export function eventWhen(startMs: number, allDay: boolean, now: number, hour12: boolean): string {
  if (!allDay && startMs <= now) return 'Now';
  const day = allDay ? toISODate(new Date(startMs)) : isoOf(startMs);
  const diff = daysBetween(isoOf(now), day);
  const date = new Date(startMs);
  const label =
    diff <= 0
      ? 'Today'
      : diff === 1
        ? 'Tomorrow'
        : diff < 7
          ? date.toLocaleDateString(undefined, { weekday: 'long' })
          : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${label}, ${allDay ? 'all day' : formatTime(startMs, hour12)}`;
}

/** "No events", "1 event", "12 events". */
export function eventCount(n: number): string {
  return n === 0 ? 'No events' : n === 1 ? '1 event' : `${n} events`;
}
