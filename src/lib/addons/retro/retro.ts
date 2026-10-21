// Retrospection: a look back over a week or a month that is honest and kind. What went well
// first (bright spots), then where things could be easier (patterns, each with a gentle tip
// and, where it helps, a one-tap fix), then a few small experiments for next time. Pure.
// What was finished comes from the History tab's list (lib/history.ts), so a calendar event
// marked done counts here as it does in "Your week".

import { taskBlocks } from '../../engine/blocks';
import { CATEGORIES } from '../../engine/categories';
import { addDays, daysBetween, formatDuration, hourOf, MINUTE, minutesOfDay, startOfDayMs } from '../../engine/time';
import type { Block, CalendarEvent, CategoryId, ISODate, Task } from '../../engine/types';
import { completedItems, counts, sourcesFor, type DoneItem } from '../../history';
import { partOfHour, PARTS, type PartOfDay } from '../../insights';
import { drainOf } from '../landings/landings';

export interface JournalEntry {
  at: number;
  taskId: string;
  title: string;
  /** moved: its day or time changed. dropped: removed without being finished. */
  kind: 'moved' | 'dropped';
}

export interface RetroInput {
  tasks: Task[];
  events: CalendarEvent[];
  from: ISODate;
  to: ISODate;
  nowMs: number;
  wake: number;
  sleep: number;
  journal?: JournalEntry[];
  /** Reality check's summary, when it is on and has samples. */
  reality?: { ratio: number | null; byTitle: { label: string; ratio: number; n: number }[] } | null;
  landingsTaken?: number;
  backlogOpen?: number;
  /** Check-in nudges are on. */
  checkIns?: boolean;
}

export interface RetroDay {
  date: ISODate;
  planned: number;
  done: number;
  letGo: number;
  open: number;
  plannedMin: number;
  doneMin: number;
  /** Planned task time as a share of the waking day. */
  load: number;
  meetingMin: number;
  /** Something was finished after bedtime. */
  late: boolean;
}

export type Action = 'landings' | 'reality' | 'checkins' | 'cycles' | 'winddown' | 'backlog' | `smaller:${string}`;

export interface Pattern {
  id: string;
  icon: string;
  title: string;
  detail: string;
  tip: string;
  action?: { label: string; do: Action };
  weight: number;
}

export interface Bright {
  id: string;
  icon: string;
  value: string;
  label: string;
}

export interface Retro {
  from: ISODate;
  to: ISODate;
  days: RetroDay[];
  planned: number;
  done: number;
  letGo: number;
  open: number;
  /** done / (planned − let go), 0..1. */
  kept: number;
  plannedMin: number;
  doneMin: number;
  focusMin: number;
  meetingMin: number;
  byPart: { id: PartOfDay; label: string; planned: number; done: number; rate: number }[];
  byCategory: { id: CategoryId; plannedMin: number; doneMin: number }[];
  perfectDays: number;
  story: { title: string; text: string };
  bright: Bright[];
  patterns: Pattern[];
  experiments: { id: string; text: string; action?: Pattern['action'] }[];
}

const PART_LABEL: Record<PartOfDay, string> = { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const dur = (min: number) => formatDuration(Math.round(min) * MINUTE);

/** A block counts once its time has fully passed, or once it is finished. */
function due(b: Block, nowMs: number) {
  return b.done || (b.floating ? startOfDayMs(addDays(b.date, 1)) <= nowMs : b.endMs <= nowMs);
}

export function analyse(i: RetroInput): Retro {
  const n = daysBetween(i.from, i.to) + 1;
  const waking = Math.max(60, (((i.sleep - i.wake) % 1440) + 1440) % 1440 || 960);
  const days: RetroDay[] = Array.from({ length: n }, (_, k) => ({ date: addDays(i.from, k), planned: 0, done: 0, letGo: 0, open: 0, plannedMin: 0, doneMin: 0, load: 0, meetingMin: 0, late: false }));
  const dayOf = (d: ISODate) => days[daysBetween(i.from, d)];
  const parts = new Map<PartOfDay, { planned: number; done: number }>();
  const cats = new Map<CategoryId, { plannedMin: number; doneMin: number }>();
  let focusMin = 0;
  let longFocus = 0;

  // Finished things, as the history lists them (task blocks by key; events marked done).
  const finished = new Map<string, DoneItem>();
  for (const it of completedItems(sourcesFor(i.tasks, i.from, i.to, { events: i.events }), i.from, i.to, i.nowMs)) {
    if (counts(it) && it.kind !== 'backlog') finished.set(it.key, it);
  }
  const markDone = (d: RetroDay, it: DoneItem, c: { plannedMin: number; doneMin: number }, pp: { planned: number; done: number } | null) => {
    d.done++;
    if (pp) pp.done++;
    const spent = it.spentMs / MINUTE;
    d.doneMin += spent;
    c.doneMin += spent;
    if (it.category === 'focus') focusMin += spent;
    const endMin = it.spentEndMs == null ? null : minutesOfDay(it.spentEndMs);
    if (endMin != null && i.sleep > i.wake && (endMin > i.sleep || endMin < i.wake - 60)) d.late = true;
  };

  for (const t of i.tasks) {
    if (!t.date) continue;
    for (const b of taskBlocks(t, i.from, i.to)) {
      const d = dayOf(b.date);
      if (!d) continue;
      const min = b.floating ? 0 : (b.endMs - b.startMs) / MINUTE;
      d.plannedMin += min;
      const c = cats.get(b.category) ?? { plannedMin: 0, doneMin: 0 };
      c.plannedMin += min;
      cats.set(b.category, c);
      if (!due(b, i.nowMs)) continue;
      d.planned++;
      const acked = t.acks?.includes(b.date);
      const part = b.floating ? null : partOfHour(hourOf(b.startMs));
      const pp = part ? (parts.get(part) ?? { planned: 0, done: 0 }) : null;
      if (pp && !acked) pp.planned++;
      const it = finished.get(b.key);
      if (it) {
        markDone(d, it, c, pp);
        if (b.category === 'focus' && min >= 120) longFocus++;
      } else if (acked) d.letGo++;
      else d.open++;
      if (part && pp) parts.set(part, pp);
    }
  }
  // A calendar event marked done counts as a plan kept (an unmarked one is never held against you).
  for (const it of finished.values()) {
    if (it.source !== 'event') continue;
    const d = dayOf(it.date);
    if (!d) continue;
    d.planned++;
    const c = cats.get(it.category) ?? { plannedMin: 0, doneMin: 0 };
    c.plannedMin += it.startMs != null && it.endMs != null ? (it.endMs - it.startMs) / MINUTE : 0;
    cats.set(it.category, c);
    const part = it.startMs == null ? null : partOfHour(hourOf(it.startMs));
    const pp = part ? (parts.get(part) ?? { planned: 0, done: 0 }) : null;
    if (pp) pp.planned++;
    markDone(d, it, c, pp);
    if (part && pp) parts.set(part, pp);
  }
  for (const e of i.events) {
    if (e.allDay || e.provider === 'salah') continue;
    const d = dayOf(isoFromMs(e.startMs, i.from, n));
    if (!d) continue;
    const blockish = { kind: 'event', title: e.title, event: e, floating: false, category: e.category ?? 'focus', icon: 'calendar', startMs: e.startMs, endMs: e.endMs } as unknown as Block;
    if (drainOf(blockish) === 'meeting') d.meetingMin += (e.endMs - e.startMs) / MINUTE;
  }
  for (const d of days) d.load = d.plannedMin / waking;

  const planned = days.reduce((s, d) => s + d.planned, 0);
  const done = days.reduce((s, d) => s + d.done, 0);
  const letGo = days.reduce((s, d) => s + d.letGo, 0);
  const open = days.reduce((s, d) => s + d.open, 0);
  const kept = planned - letGo > 0 ? done / (planned - letGo) : 0;
  const plannedMin = days.reduce((s, d) => s + d.plannedMin, 0);
  const doneMin = days.reduce((s, d) => s + d.doneMin, 0);
  const meetingMin = days.reduce((s, d) => s + d.meetingMin, 0);
  const byPart = PARTS.map((p) => {
    const v = parts.get(p.id) ?? { planned: 0, done: 0 };
    return { id: p.id, label: PART_LABEL[p.id], planned: v.planned, done: v.done, rate: v.planned ? v.done / v.planned : 0 };
  });
  const byCategory = CATEGORIES.map((c) => ({ id: c.id, ...(cats.get(c.id) ?? { plannedMin: 0, doneMin: 0 }) })).filter((c) => c.plannedMin > 0);
  const perfectDays = days.filter((d) => d.planned >= 2 && d.done === d.planned - d.letGo).length;

  // ── Bright spots ──
  const bright: Bright[] = [];
  const best = days.filter((d) => d.planned >= 2).sort((a, b) => b.done / Math.max(1, b.planned) - a.done / Math.max(1, a.planned) || b.done - a.done)[0];
  if (done) bright.push({ id: 'done', icon: 'circle-check', value: String(done), label: done === 1 ? 'block finished' : 'blocks finished' });
  if (focusMin >= 30) bright.push({ id: 'focus', icon: 'laptop', value: dur(focusMin), label: 'of focus' });
  if (perfectDays) bright.push({ id: 'perfect', icon: 'trophy', value: String(perfectDays), label: perfectDays === 1 ? 'day with every plan kept' : 'days with every plan kept' });
  else if (best && best.done) bright.push({ id: 'best', icon: 'star', value: dayName(best.date), label: `your best day: ${best.done} of ${best.planned}` });
  // Night work is noted as a pattern, never praised as the best time.
  const strongPart = byPart.filter((p) => p.planned >= 3 && p.id !== 'night').sort((a, b) => b.rate - a.rate || b.done - a.done)[0];
  if (strongPart && strongPart.rate >= 0.6) bright.push({ id: 'part', icon: 'sun', value: strongPart.label, label: `your strongest time · ${pct(strongPart.rate)} kept` });
  if (i.landingsTaken) bright.push({ id: 'land', icon: 'leaf', value: String(i.landingsTaken), label: i.landingsTaken === 1 ? 'soft landing taken' : 'soft landings taken' });

  // ── Patterns: where it could be easier ──
  const patterns: Pattern[] = [];
  const morning = byPart.find((p) => p.id === 'morning')!;
  const later = byPart.filter((p) => p.id === 'afternoon' || p.id === 'evening');
  const laterPlanned = later.reduce((s, p) => s + p.planned, 0);
  const laterRate = laterPlanned ? later.reduce((s, p) => s + p.done, 0) / laterPlanned : 0;
  if (morning.planned >= 3 && laterPlanned >= 4 && morning.rate - laterRate >= 0.25) {
    patterns.push({ id: 'afternoon', icon: 'sunset', title: 'Afternoons are harder', detail: `${pct(laterRate)} kept after midday, ${pct(morning.rate)} in the morning.`, tip: 'Put demanding work in the morning, and keep afternoons for lighter things.', weight: (morning.rate - laterRate) * 10 });
  }
  const full = days.filter((d) => d.load > 0.85 && d.planned);
  const light = days.filter((d) => d.load <= 0.85 && d.planned);
  const rate = (ds: RetroDay[]) => {
    const p = ds.reduce((s, d) => s + d.planned - d.letGo, 0);
    return p ? ds.reduce((s, d) => s + d.done, 0) / p : 0;
  };
  if (full.length >= 2 && light.length >= 1 && rate(light) - rate(full) >= 0.15) {
    patterns.push({ id: 'full', icon: 'layers', title: 'Full days slip', detail: `On packed days you kept ${pct(rate(full))}; on lighter ones ${pct(rate(light))}.`, tip: 'Leave an hour unplanned. It catches what runs over.', weight: 8 });
  }
  if (open >= 3) {
    patterns.push({ id: 'open', icon: 'alarm', title: `${open} blocks ended without a check-in`, detail: 'Unticked blocks make the picture fuzzy, and they quietly weigh on you.', tip: 'Tick it, or “let it go”. Both are fine.', ...(i.checkIns === false ? { action: { label: 'Turn on check-ins', do: 'checkins' as const } } : {}), weight: 5 + open / 3 });
  }
  if (meetingMin >= 240 && (meetingMin / Math.max(1, plannedMin + meetingMin) >= 0.3 || days.some((d) => d.meetingMin >= 180))) {
    patterns.push({ id: 'meetings', icon: 'video', title: 'Meeting-heavy', detail: `${dur(meetingMin)} of meetings${days.some((d) => d.meetingMin >= 180) ? `, up to ${dur(Math.max(...days.map((d) => d.meetingMin)))} in a day` : ''}.`, tip: 'Keep a few minutes after each meeting to land before the next thing.', action: { label: 'Use Soft landings', do: 'landings' }, weight: 7 });
  }
  const r = i.reality;
  if (r?.ratio && r.ratio >= 1.25) {
    const worst = [...r.byTitle].filter((g) => g.n >= 2).sort((a, b) => b.ratio - a.ratio)[0];
    patterns.push({ id: 'estimate', icon: 'hourglass', title: 'Things take longer than planned', detail: `About ${r.ratio.toFixed(1).replace(/\.0$/, '')}× what you plan${worst ? `; “${worst.label}” most (${worst.ratio.toFixed(1)}×)` : ''}.`, tip: 'Plan with the time things really take, and the day stops slipping.', action: { label: 'Open Reality check', do: 'reality' }, weight: 6 + r.ratio });
  }
  const moves = new Map<string, { title: string; n: number }>();
  const fromMs = startOfDayMs(i.from);
  const toMs = startOfDayMs(addDays(i.to, 1));
  for (const j of i.journal ?? []) {
    if (j.kind !== 'moved' || j.at < fromMs || j.at >= toMs) continue;
    const m = moves.get(j.taskId) ?? { title: j.title, n: 0 };
    m.n++;
    moves.set(j.taskId, m);
  }
  const pushed = [...moves.entries()].filter(([, m]) => m.n >= 3).sort((a, b) => b[1].n - a[1].n);
  if (pushed.length) {
    const [id, m] = pushed[0];
    const alive = i.tasks.some((t) => t.id === id);
    patterns.push({ id: 'pushed', icon: 'move-later', title: `“${m.title || 'A block'}” keeps moving`, detail: `Moved ${m.n} times${pushed.length > 1 ? `, and ${pushed.length - 1} more moved 3 times or more` : ''}.`, tip: 'When something keeps moving, it is often too big to start. Break off a two-minute first step.', ...(alive ? { action: { label: 'Make it smaller', do: `smaller:${id}` as const } } : {}), weight: 6 + m.n });
  }
  const lateDays = days.filter((d) => d.late).length;
  if (lateDays >= 2) patterns.push({ id: 'late', icon: 'moon', title: `${lateDays} evenings ran long`, detail: 'Some work carried on past your sleep time. Full days happen.', tip: 'An evening wind-down an hour before sleep makes stopping easier.', action: { label: 'Offer a wind-down', do: 'winddown' }, weight: 5 + lateDays });
  if (longFocus >= 2) patterns.push({ id: 'long', icon: 'timer', title: 'Long stretches without a break', detail: `${longFocus} focus blocks of two hours or more.`, tip: 'Focus in rounds with short breaks: it keeps energy for later in the day.', action: { label: 'Focus in rounds', do: 'cycles' }, weight: 4 });
  if ((i.backlogOpen ?? 0) >= 25) patterns.push({ id: 'backlog', icon: 'inbox', title: 'A full backlog', detail: `${i.backlogOpen} things are waiting.`, tip: 'A short session to clear three small ones, or let go of what no longer matters.', action: { label: 'Open the backlog', do: 'backlog' }, weight: 3 });
  patterns.sort((a, b) => b.weight - a.weight);

  // ── Story ──
  const tone = !planned ? 'A quiet stretch' : kept >= 0.8 ? 'A strong stretch' : kept >= 0.6 ? 'A steady stretch' : kept >= 0.4 ? 'A mixed stretch' : 'A heavy stretch';
  const span = n <= 7 ? 'week' : `${n} days`;
  const title = tone.replace('stretch', span);
  const topCat = [...byCategory].sort((a, b) => b.doneMin - a.doneMin)[0];
  const bits: string[] = [];
  if (planned) bits.push(`You kept ${done} of ${planned - letGo} plans (${pct(kept)})${letGo ? `, and let ${letGo} go` : ''}.`);
  if (doneMin >= 30) bits.push(`${dur(doneMin)} of time well spent${topCat && topCat.doneMin >= 30 ? `, most of it on ${CATEGORIES.find((c) => c.id === topCat.id)?.label.toLowerCase()}` : ''}.`);
  if (strongPart && strongPart.planned >= 3) bits.push(`${strongPart.label}s are when things get done.`);
  if (!bits.length) bits.push('Plan a few blocks and finish them; the story of your days starts here.');
  const story = { title, text: bits.join(' ') };

  // ── Experiments ──
  const experiments = patterns.slice(0, 3).map((p) => ({ id: p.id, text: p.tip, ...(p.action ? { action: p.action } : {}) }));
  if (!experiments.length && planned) experiments.push({ id: 'keep', text: 'Keep doing what works: same rhythm, one small stretch goal.' });

  return { from: i.from, to: i.to, days, planned, done, letGo, open, kept, plannedMin, doneMin, focusMin, meetingMin, byPart, byCategory, perfectDays, story, bright: bright.slice(0, 4), patterns, experiments };
}

function isoFromMs(ms: number, from: ISODate, n: number): ISODate {
  for (let k = 0; k < n; k++) {
    const d = addDays(from, k);
    if (ms >= startOfDayMs(d) && ms < startOfDayMs(addDays(d, 1))) return d;
  }
  return addDays(from, -1);
}

function dayName(date: ISODate): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
}
