// Date and time pickers: reading what people type ("930", "2:30pm", "noon", "fri", "30 oct",
// "+3"), friendly labels, and the month grid. Pure functions, so they test fast.

import { addDays, daysBetween, fromISODate, todayISO, weekday } from './engine/time';
import type { ISODate } from './engine/types';
import { parseQuick } from './quickadd';

const pad = (n: number) => String(n).padStart(2, '0');

/** Minutes after midnight → "HH:MM". */
export function toHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "HH:MM" → minutes after midnight (null when empty or malformed). */
export function fromHHMM(s: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/**
 * A typed time → minutes. Understands "930", "0930", "9:30", "9.30", "1430", "21", "9",
 * "9p", "9pm", "2:30 pm", "noon", "midnight" and "now". A bare hour with no am/pm follows the
 * clock style: in 24-hour style "9" is 09:00; in 12-hour style it is whichever of 9am and 9pm
 * lies nearer `near` (the time being changed), so "6" for a wake-up is 6am and "3" for an
 * afternoon block is 3pm.
 */
export function parseTimeText(text: string, opts: { hour12: boolean; nowMinutes?: number; near?: number; awake?: { from: number; to: number } }): number | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  if (s === 'noon' || s === 'midday') return 12 * 60;
  if (s === 'midnight') return 0;
  if (s === 'now' && opts.nowMinutes !== undefined) return Math.round(opts.nowMinutes);
  const m = /^(\d{1,2})(?:[:.h ]?(\d{2}))?\s*(a|p|am|pm|a\.m\.|p\.m\.)?$/.exec(s) ?? /^(\d{1,2})(\d{2})\s*(a|p|am|pm)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.[0];
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === 'p' ? 12 : 0);
  } else if (h > 23) return null;
  else if (opts.hour12 && h >= 1 && h <= 12) {
    const am = (h % 12) * 60 + min;
    const pm = am + 720;
    // For a block: the one in your waking hours, when only one of them is.
    const w = opts.awake;
    const inDay = (t: number) => !!w && (w.from <= w.to ? t >= w.from && t < w.to : t >= w.from || t < w.to);
    if (w && inDay(am) !== inDay(pm)) return inDay(am) ? am : pm;
    const near = opts.near ?? 12 * 60;
    const dist = (a: number) => Math.min(Math.abs(a - near), 1440 - Math.abs(a - near));
    return dist(pm) <= dist(am) ? pm : am;
  }
  return h * 60 + min;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthOf = (w: string) => (w.length >= 3 ? MONTHS.indexOf(w.slice(0, 3)) : -1);

function iso(y: number, m: number, d: number): ISODate | null {
  const dt = new Date(Date.UTC(y, m, d));
  if (dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Month and day with no year: the year that puts it closest to today. */
function nearest(m: number, d: number, today: ISODate): ISODate | null {
  const y = Number(today.slice(0, 4));
  const options = [y - 1, y, y + 1].map((yy) => iso(yy, m, d)).filter((x): x is ISODate => !!x);
  if (!options.length) return null;
  return options.reduce((a, b) => (Math.abs(daysBetween(today, b)) < Math.abs(daysBetween(today, a)) ? b : a));
}

/**
 * A typed day → ISO date. Understands "today", "tmr", "fri", "next tue", "in 3 days", "+3",
 * "+2w", "next week" (Monday), "weekend" (Saturday), "30 oct", "oct 30", "30/10", "30.10.2026",
 * "2026-10-30" and a bare day of the month ("25" = the next 25th).
 */
export function parseDayText(text: string, today: ISODate, nowMs = Date.now()): ISODate | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/(\d)(st|nd|rd|th)\b/g, '$1');
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return iso(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  if (/^(today|tod|now)$/.test(s)) return today;
  if (/^(tomorrow|tmr|tmrw|tom|tomo)$/.test(s)) return addDays(today, 1);
  if (/^(yesterday|yday)$/.test(s)) return addDays(today, -1);
  let m = /^\+\s*(\d{1,3})\s*(d|w|m)?$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    if (m[2] === 'm') {
      const d = fromISODate(today);
      const t = new Date(Date.UTC(d.getFullYear(), d.getMonth() + n, 1));
      const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
      return iso(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d.getDate(), last));
    }
    return addDays(today, m[2] === 'w' ? n * 7 : n);
  }
  if (/^next week$/.test(s)) return addDays(today, ((8 - weekday(today)) % 7) || 7);
  if (/^(this )?weekend$/.test(s)) return addDays(today, (6 - weekday(today) + 7) % 7);
  // 30/10, 30.10, 30-10, with an optional year (day first).
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(s);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    if (m[3]) return iso(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), mo, d);
    return nearest(mo, d, today);
  }
  // 30 oct [2026] / oct 30 [2026]
  m = /^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/.exec(s) ?? null;
  if (m && monthOf(m[2]) >= 0) return m[3] ? iso(Number(m[3]), monthOf(m[2]), Number(m[1])) : nearest(monthOf(m[2]), Number(m[1]), today);
  m = /^([a-z]+) (\d{1,2})(?:,? (\d{4}))?$/.exec(s);
  if (m && monthOf(m[1]) >= 0) return m[3] ? iso(Number(m[3]), monthOf(m[1]), Number(m[2])) : nearest(monthOf(m[1]), Number(m[2]), today);
  // "25": the next 25th (this month if it hasn't passed).
  m = /^(\d{1,2})$/.exec(s);
  if (m) {
    const d = Number(m[1]);
    const t = fromISODate(today);
    let y = t.getFullYear();
    let mo = t.getMonth();
    for (let k = 0; k < 3; k++) {
      const c = iso(y, mo, d);
      if (c && c >= today) return c;
      if (++mo > 11) {
        mo = 0;
        y++;
      }
    }
    return null;
  }
  // Everything quick add understands: "fri", "next tue", "in 3 days", "in 2 weeks"…
  const q = parseQuick(s, nowMs, 0);
  return q.tokens.some((t) => t[2] === 'date') && q.date ? q.date : null;
}

/** "Today", "Tomorrow", "Yesterday", "Fri 23 Oct", "Mon 5 Jan 2027". */
export function dayLabel(date: ISODate, today: ISODate = todayISO()): string {
  const n = daysBetween(today, date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  const d = fromISODate(date);
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).replace(',', '');
}

/** One-tap days: today, tomorrow, the weekend (when it's still ahead), next Monday, a week out. */
export function quickDays(today: ISODate): { label: string; date: ISODate }[] {
  const wd = weekday(today);
  const out = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
  ];
  if (wd >= 1 && wd <= 4) out.push({ label: 'This weekend', date: addDays(today, 6 - wd) });
  out.push({ label: 'Next week', date: addDays(today, ((8 - wd) % 7) || 7) });
  out.push({ label: 'In a week', date: addDays(today, 7) });
  return out;
}

/** The 42 days (6 weeks) shown for a month, weeks starting on Monday. */
export function monthGrid(year: number, month: number): ISODate[] {
  const first = iso(year, month, 1)!;
  const lead = (weekday(first) + 6) % 7;
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** "October 2026". */
export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
