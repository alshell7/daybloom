// Calendar meetings: the link to join (Google Meet, Zoom, Teams…), readable notes from a
// calendar's HTML description, and the people invited. Pure, so it tests fast.

import type { Attendee, CalendarEvent } from '../engine/types';

export interface MeetingLink {
  url: string;
  /** "Google Meet", "Zoom", "Microsoft Teams", "Webex", "Whereby" or "Video call". */
  label: string;
}

const PATTERNS: [RegExp, string][] = [
  [/https:\/\/meet\.google\.com\/[a-z]{3,4}-[a-z]{4}-[a-z]{3,4}(?:\?[^\s"'<>)]*)?/i, 'Google Meet'],
  [/https:\/\/(?:[\w-]+\.)?zoom\.us\/(?:j|my|w|s)\/[^\s"'<>)]+/i, 'Zoom'],
  [/https:\/\/teams\.(?:microsoft|live)\.com\/(?:l\/meetup-join|meet)\/[^\s"'<>)]+/i, 'Microsoft Teams'],
  [/https:\/\/[\w-]+\.webex\.com\/(?:meet|join|[\w-]+\/j\.php|wbxmjs)[^\s"'<>)]*/i, 'Webex'],
  [/https:\/\/whereby\.com\/[^\s"'<>)]+/i, 'Whereby'],
  [/https:\/\/(?:[\w-]+\.)?(?:around\.co|gather\.town|jit\.si|chime\.aws)\/[^\s"'<>)]+/i, 'Video call'],
];

/** "Google Meet" for a meet.google.com link, and so on; "Video call" for anything else. */
export function meetingLabel(url: string): string {
  return PATTERNS.find(([re]) => re.test(url))?.[1] ?? 'Video call';
}

/** The first meeting link in any of these texts (a location, the notes, a URL field). */
export function findMeetingLink(...texts: (string | undefined | null)[]): MeetingLink | null {
  for (const [re, label] of PATTERNS) {
    for (const t of texts) {
      const m = t ? re.exec(t) : null;
      if (m) return { url: m[0].replace(/[.,;]+$/, ''), label };
    }
  }
  return null;
}

/** The link to join an event: the one the calendar gave, else one found in its words. */
export function meetingOf(ev: Pick<CalendarEvent, 'meetUrl' | 'meetLabel' | 'location' | 'description'>): MeetingLink | null {
  if (ev.meetUrl) return { url: ev.meetUrl, label: ev.meetLabel || meetingLabel(ev.meetUrl) };
  return findMeetingLink(ev.location, ev.description);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** A calendar's HTML description as plain, readable text (links kept as their address). */
export function plainText(html: string | undefined | null, max = 4000): string {
  if (!html) return '';
  let s = html
    // Keep the address of a link whose text differs from it.
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis, (_, href: string, text: string) => {
      const t = text.replace(/<[^>]+>/g, '').trim();
      return t && !href.includes(t) && !t.includes(href) ? `${t} (${href})` : href;
    })
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|h\d|tr|ul|ol)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+|#39);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Text split into plain runs and links, for showing notes with clickable addresses. */
export function linkify(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  const re = /https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/gi;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], href: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Google / iCalendar answers → one vocabulary. */
export function rsvp(status: string | undefined | null): Attendee['status'] {
  const s = (status ?? '').toLowerCase();
  if (s === 'accepted') return 'accepted';
  if (s === 'declined') return 'declined';
  if (s === 'tentative') return 'tentative';
  return 'needsAction';
}

/** Organiser first, then who's coming, maybe, not yet answered, not coming. */
export function sortAttendees(list: Attendee[]): Attendee[] {
  const rank = (a: Attendee) => (a.organizer ? 0 : { accepted: 1, tentative: 2, needsAction: 3, declined: 4 }[a.status ?? 'needsAction']);
  return [...list].sort((a, b) => rank(a) - rank(b) || (a.name ?? a.email ?? '').localeCompare(b.name ?? b.email ?? ''));
}

/** "Sam Lee" → "SL", "sam@x.com" → "S". */
export function initials(a: Attendee): string {
  const n = (a.name ?? '').trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  return (a.email ?? '?')[0].toUpperCase();
}

/** "5 people · 3 coming". */
export function peopleLine(list: Attendee[] | undefined): string {
  if (!list?.length) return '';
  const coming = list.filter((a) => a.status === 'accepted').length;
  return `${list.length} ${list.length === 1 ? 'person' : 'people'}${coming && coming < list.length ? ` · ${coming} coming` : ''}`;
}
