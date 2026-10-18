import { addDays, daysBetween, fromISODate, toISODate, weekday } from './time';
import type { ISODate, Recurrence, Task } from './types';

const MAX_ITER = 20_000;

/** Monday-based week start (RRULE default WKST=MO). */
function weekStart(date: ISODate): ISODate {
  const wd = weekday(date);
  return addDays(date, -((wd + 6) % 7));
}

function daysInMonth(y: number, m0: number) {
  return new Date(y, m0 + 1, 0).getDate();
}

/** Does the rule (ignoring count/until/skips) produce `date`, given the anchor? */
function matchesPattern(rule: Recurrence, anchor: ISODate, date: ISODate): boolean {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  const diff = daysBetween(anchor, date);
  if (diff < 0) return false;
  switch (rule.freq) {
    case 'daily':
      return diff % interval === 0;
    case 'weekly': {
      const days = rule.byWeekday?.length ? rule.byWeekday : [weekday(anchor)];
      if (!days.includes(weekday(date))) return false;
      const weeks = Math.round(daysBetween(weekStart(anchor), weekStart(date)) / 7);
      return weeks % interval === 0;
    }
    case 'monthly': {
      const a = fromISODate(anchor);
      const d = fromISODate(date);
      const months = (d.getFullYear() - a.getFullYear()) * 12 + (d.getMonth() - a.getMonth());
      if (months % interval !== 0) return false;
      // "Monthly on the 31st" lands on the last day of shorter months.
      const want = Math.min(a.getDate(), daysInMonth(d.getFullYear(), d.getMonth()));
      return d.getDate() === want;
    }
    case 'yearly': {
      const a = fromISODate(anchor);
      const d = fromISODate(date);
      const years = d.getFullYear() - a.getFullYear();
      if (years % interval !== 0 || d.getMonth() !== a.getMonth()) return false;
      const want = Math.min(a.getDate(), daysInMonth(d.getFullYear(), d.getMonth()));
      return d.getDate() === want;
    }
  }
}

/** Next date strictly after `date` that matches the pattern (used for count walking). */
function nextMatch(rule: Recurrence, anchor: ISODate, date: ISODate): ISODate | null {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  if (rule.freq === 'daily') return addDays(date, interval);
  if (rule.freq === 'weekly') {
    let d = addDays(date, 1);
    for (let i = 0; i < 7 * interval + 7; i++, d = addDays(d, 1)) {
      if (matchesPattern(rule, anchor, d)) return d;
    }
    return null;
  }
  // monthly / yearly: step by the unit from the anchor, clamping the day.
  const a = fromISODate(anchor);
  const cur = fromISODate(date);
  const stepMonths = rule.freq === 'monthly' ? interval : 12 * interval;
  const monthsFromAnchor = (cur.getFullYear() - a.getFullYear()) * 12 + (cur.getMonth() - a.getMonth());
  const k = Math.floor(monthsFromAnchor / stepMonths) + 1;
  const target = new Date(a.getFullYear(), a.getMonth() + k * stepMonths, 1);
  target.setDate(Math.min(a.getDate(), daysInMonth(target.getFullYear(), target.getMonth())));
  return toISODate(target);
}

/** Occurrence index (0-based) of `date` in the series, or -1 when it is not an occurrence. */
function occurrenceIndex(rule: Recurrence, anchor: ISODate, date: ISODate): number {
  if (!matchesPattern(rule, anchor, date)) return -1;
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  if (rule.freq === 'daily') return daysBetween(anchor, date) / interval;
  let i = 0;
  let d: ISODate | null = matchesPattern(rule, anchor, anchor) ? anchor : nextMatch(rule, anchor, anchor);
  while (d && d < date && i < MAX_ITER) {
    d = nextMatch(rule, anchor, d);
    i++;
  }
  return d === date ? i : -1;
}

/** Whether a task (one-off or recurring) happens on `date`. Skips are honoured. */
export function occursOn(task: Pick<Task, 'date' | 'recurrence' | 'skips'>, date: ISODate): boolean {
  if (!task.date) return false;
  if (task.skips.includes(date)) return false;
  const rule = task.recurrence;
  if (!rule) return task.date === date;
  if (rule.until && date > rule.until) return false;
  if (!matchesPattern(rule, task.date, date)) return false;
  if (rule.count != null) {
    const idx = occurrenceIndex(rule, task.date, date);
    return idx >= 0 && idx < rule.count;
  }
  return true;
}

/** All occurrence dates in [from, to] inclusive. */
export function occurrencesBetween(
  task: Pick<Task, 'date' | 'recurrence' | 'skips'>,
  from: ISODate,
  to: ISODate,
): ISODate[] {
  const out: ISODate[] = [];
  if (!task.date) return out;
  if (!task.recurrence) {
    if (task.date >= from && task.date <= to && !task.skips.includes(task.date)) out.push(task.date);
    return out;
  }
  let d = task.date > from ? task.date : from;
  for (let i = 0; d <= to && i < MAX_ITER; i++, d = addDays(d, 1)) {
    if (occursOn(task, d)) out.push(d);
  }
  return out;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Human summary: "Every weekday", "Every 2 weeks on Mon, Thu", "Monthly on the 3rd". */
export function describeRecurrence(rule: Recurrence | null, anchor: ISODate | null): string {
  if (!rule) return 'Does not repeat';
  const n = Math.max(1, rule.interval || 1);
  let base: string;
  switch (rule.freq) {
    case 'daily':
      base = n === 1 ? 'Every day' : `Every ${n} days`;
      break;
    case 'weekly': {
      const days = (rule.byWeekday?.length ? rule.byWeekday : anchor ? [weekday(anchor)] : []).slice().sort();
      const key = days.join(',');
      const named =
        key === '1,2,3,4,5' ? 'weekday' : key === '0,6' ? 'weekend day' : key === '0,1,2,3,4,5,6' ? 'day' : null;
      if (named && n === 1) base = `Every ${named}`;
      else {
        const list = days
          .slice()
          .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
          .map((d) => WEEKDAY_SHORT[d])
          .join(', ');
        base = n === 1 ? `Weekly on ${list}` : `Every ${n} weeks on ${list}`;
      }
      break;
    }
    case 'monthly': {
      const day = anchor ? fromISODate(anchor).getDate() : 1;
      base = n === 1 ? `Monthly on the ${ordinal(day)}` : `Every ${n} months on the ${ordinal(day)}`;
      break;
    }
    case 'yearly':
      base = n === 1 ? 'Every year' : `Every ${n} years`;
      break;
  }
  if (rule.count) base += `, ${rule.count} times`;
  else if (rule.until) base += `, until ${fromISODate(rule.until).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  return base;
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** RRULE string for export / calendar write-back later. */
export function toRRule(rule: Recurrence): string {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === 'weekly' && rule.byWeekday?.length) {
    parts.push(`BYDAY=${rule.byWeekday.map((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d]).join(',')}`);
  }
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  else if (rule.until) parts.push(`UNTIL=${rule.until.replaceAll('-', '')}`);
  return parts.join(';');
}
