// Analytics over work items: totals, per-project / per-client / per-day series, budget
// burn and a comparison with the previous period of the same length. Pure.

import { addDays, daysBetween, fromISODate, isoOf, toISODate, weekday } from '../../engine/time';
import type { ISODate } from '../../engine/types';
import { clientById, inRange, projectById, projectColor, projectCurrency, workItems } from './earnings';
import { taskIdOf } from './keys';
import { mulDiv } from './money';
import type { Budget, DateRange, Minor, WorkContext, WorkItem } from './types';

// --- ranges -----------------------------------------------------------------

/** Every date in the range, inclusive. */
export function datesIn(range: DateRange): ISODate[] {
  const out: ISODate[] = [];
  const n = daysBetween(range.from, range.to);
  for (let i = 0; i <= n; i++) out.push(addDays(range.from, i));
  return out;
}

/** The same number of days, ending the day before `range.from`. */
export function previousRange(range: DateRange): DateRange {
  const len = Math.max(0, daysBetween(range.from, range.to));
  const to = addDays(range.from, -1);
  return { from: addDays(to, -len), to };
}

/** The week containing `date`; `weekStartsOn` 0 = Sunday … 6 = Saturday. */
export function weekRange(date: ISODate, weekStartsOn = 1): DateRange {
  const back = (weekday(date) - weekStartsOn + 7) % 7;
  const from = addDays(date, -back);
  return { from, to: addDays(from, 6) };
}

/** The calendar month containing `date`. */
export function monthRange(date: ISODate): DateRange {
  const d = fromISODate(date);
  return { from: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), to: toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

// --- shapes -----------------------------------------------------------------

export interface PeriodTotals {
  range: DateRange;
  /** Minor units of the summary currency. */
  earned: Minor;
  /** Billed minutes of billable items (all currencies). */
  billedMinutes: number;
  nonBillableMinutes: number;
  /** Earned per hour (minor units), over billable minutes in the summary currency; null with no time. */
  effectiveHourly: Minor | null;
}

export interface BudgetBurn {
  projectId: string;
  kind: Budget['kind'];
  /** Hours, or minor units of the project's currency. */
  budget: number;
  used: number;
  remaining: number;
  /** Percentage used (may exceed 100). */
  pct: number;
  over: boolean;
  currency: string;
}

export interface ProjectStat {
  projectId: string;
  name: string;
  color: string;
  clientId?: string;
  currency: string;
  earned: Minor;
  billedMinutes: number;
  nonBillableMinutes: number;
  /** Billable, priced, not yet on an invoice. */
  uninvoiced: Minor;
  effectiveHourly: Minor | null;
  items: number;
  budget?: BudgetBurn;
}

export interface ClientStat {
  /** null = projects with no client. */
  clientId: string | null;
  name: string;
  currency: string;
  earned: Minor;
  billedMinutes: number;
  nonBillableMinutes: number;
  uninvoiced: Minor;
}

export interface DayStat {
  date: ISODate;
  /** Summary currency only. */
  earned: Minor;
  billedMinutes: number;
  nonBillableMinutes: number;
}

/** Relative change against the previous period (0.25 = +25 %); null when the previous value is 0. */
export interface PeriodChange {
  earned: number | null;
  billedMinutes: number | null;
  nonBillableMinutes: number | null;
  effectiveHourly: number | null;
}

export interface WorkSummary extends PeriodTotals {
  currency: string;
  /** Earned per currency, when clients bill in several. */
  earnedByCurrency: Record<string, Minor>;
  /** billed / (billed + non-billable); null with no time at all. */
  billableShare: number | null;
  /** Billable and priced, in the summary currency, not yet on an invoice. */
  uninvoiced: Minor;
  itemCount: number;
  byProject: ProjectStat[];
  byClient: ClientStat[];
  /** One entry per date in the range (zeros included), ready for a bar chart. */
  byDay: DayStat[];
  topProjects: ProjectStat[];
  /** Every project with a budget, lifetime use up to `range.to`. */
  budgets: BudgetBurn[];
  previous: PeriodTotals;
  change: PeriodChange;
}

export interface SummaryOptions {
  /** Headline currency. Default: the only currency in use, else the settings currency. */
  currency?: string;
  /** How many top projects. Default 5. */
  top?: number;
}

// --- maths ------------------------------------------------------------------

export function effectiveHourly(earned: Minor, minutes: number): Minor | null {
  return minutes > 0 ? mulDiv(earned, 60, minutes) : null;
}

function change(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before === 0) return null;
  return (now - before) / before;
}

function totals(items: WorkItem[], range: DateRange, currency: string): PeriodTotals {
  let earned = 0;
  let billed = 0;
  let non = 0;
  let billedHere = 0;
  for (const i of items) {
    if (i.billable) {
      billed += i.billedMinutes;
      if (i.currency === currency) {
        earned += i.amount;
        billedHere += i.billedMinutes;
      }
    } else non += i.billedMinutes;
  }
  return { range, earned, billedMinutes: billed, nonBillableMinutes: non, effectiveHourly: effectiveHourly(earned, billedHere) };
}

/** Lifetime budget use per budgeted project, counting work up to and including `until`. */
export function budgetBurn(ctx: WorkContext, until: ISODate): BudgetBurn[] {
  const budgeted = ctx.data.projects.filter((p) => p.budget);
  if (!budgeted.length) return [];
  // Start from the earliest point any of this work could have happened.
  let from = until;
  const consider = (d: ISODate | null | undefined) => {
    if (d && d < from) from = d;
  };
  for (const p of budgeted) consider(isoOf(p.createdAt));
  const assigned = new Set(Object.keys(ctx.data.assignments).map(taskIdOf).filter(Boolean));
  for (const t of ctx.tasks) if (assigned.has(t.id)) consider(t.date ?? (t.doneAt ? isoOf(t.doneAt) : null));
  for (const e of ctx.entries ?? []) if (e && Number.isFinite(e.startMs)) consider(isoOf(e.startMs));
  // Bounded: ten years of history is plenty for a budget.
  const floor = addDays(until, -3660);
  if (from < floor) from = floor;

  const items = workItems(ctx, { from, to: until }, { includeNonBillable: true, projectIds: budgeted.map((p) => p.id) });
  return budgeted.map((p) => {
    const mine = items.filter((i) => i.projectId === p.id);
    const b = p.budget!;
    const currency = projectCurrency(ctx.data, p);
    // Hours budgets count all time worked on the project; money budgets count what it earned.
    const used = b.kind === 'hours' ? mine.reduce((s, i) => s + i.billedMinutes, 0) / 60 : mine.reduce((s, i) => s + i.amount, 0);
    const pct = b.amount > 0 ? (used / b.amount) * 100 : 0;
    return { projectId: p.id, kind: b.kind, budget: b.amount, used, remaining: b.amount - used, pct, over: used > b.amount, currency };
  });
}

/** Totals and chart series for a range, with the previous period alongside. */
export function summary(ctx: WorkContext, range: DateRange, opts: SummaryOptions = {}): WorkSummary {
  const { data } = ctx;
  const items = workItems(ctx, range, { includeNonBillable: true });
  const used = new Set(items.filter((i) => i.billable).map((i) => i.currency));
  const currency = opts.currency ?? (used.size === 1 ? [...used][0] : data.settings.currency);

  const head = totals(items, range, currency);
  const prevRange = previousRange(range);
  const previous = totals(workItems(ctx, prevRange, { includeNonBillable: true }), prevRange, currency);

  const earnedByCurrency: Record<string, Minor> = {};
  let uninvoiced = 0;
  for (const i of items) {
    if (!i.billable) continue;
    earnedByCurrency[i.currency] = (earnedByCurrency[i.currency] ?? 0) + i.amount;
    if (!i.invoiceId && i.currency === currency) uninvoiced += i.amount;
  }

  const budgets = budgetBurn(ctx, range.to);
  const budgetOf = new Map(budgets.map((b) => [b.projectId, b]));

  // Per project.
  const projects = new Map<string, ProjectStat>();
  for (const i of items) {
    let s = projects.get(i.projectId);
    if (!s) {
      const p = projectById(data, i.projectId);
      s = {
        projectId: i.projectId,
        name: i.projectName,
        color: p ? projectColor(p) : i.projectColor,
        clientId: i.clientId,
        currency: i.currency,
        earned: 0,
        billedMinutes: 0,
        nonBillableMinutes: 0,
        uninvoiced: 0,
        effectiveHourly: null,
        items: 0,
        budget: budgetOf.get(i.projectId),
      };
      projects.set(i.projectId, s);
    }
    s.items++;
    if (i.billable) {
      s.earned += i.amount;
      s.billedMinutes += i.billedMinutes;
      if (!i.invoiceId) s.uninvoiced += i.amount;
    } else s.nonBillableMinutes += i.billedMinutes;
  }
  const byProject = [...projects.values()];
  for (const s of byProject) s.effectiveHourly = effectiveHourly(s.earned, s.billedMinutes);
  byProject.sort((a, b) => b.earned - a.earned || b.billedMinutes - a.billedMinutes || a.name.localeCompare(b.name));

  // Per client.
  const clients = new Map<string, ClientStat>();
  for (const i of items) {
    const id = i.clientId ?? null;
    const k = `${id ?? ''}|${i.currency}`;
    let s = clients.get(k);
    if (!s) {
      s = { clientId: id, name: id ? (clientById(data, id)?.name ?? i.clientName ?? '') : '', currency: i.currency, earned: 0, billedMinutes: 0, nonBillableMinutes: 0, uninvoiced: 0 };
      clients.set(k, s);
    }
    if (i.billable) {
      s.earned += i.amount;
      s.billedMinutes += i.billedMinutes;
      if (!i.invoiceId) s.uninvoiced += i.amount;
    } else s.nonBillableMinutes += i.billedMinutes;
  }
  const byClient = [...clients.values()].sort((a, b) => b.earned - a.earned || b.billedMinutes - a.billedMinutes || a.name.localeCompare(b.name));

  // Per day.
  const days = new Map<ISODate, DayStat>(datesIn(range).map((d) => [d, { date: d, earned: 0, billedMinutes: 0, nonBillableMinutes: 0 }]));
  for (const i of items) {
    const s = days.get(i.date);
    if (!s || !inRange(i.date, range)) continue;
    if (i.billable) {
      s.billedMinutes += i.billedMinutes;
      if (i.currency === currency) s.earned += i.amount;
    } else s.nonBillableMinutes += i.billedMinutes;
  }

  const all = head.billedMinutes + head.nonBillableMinutes;
  return {
    ...head,
    currency,
    earnedByCurrency,
    billableShare: all > 0 ? head.billedMinutes / all : null,
    uninvoiced,
    itemCount: items.length,
    byProject,
    byClient,
    byDay: [...days.values()],
    topProjects: byProject.filter((p) => p.earned > 0 || p.billedMinutes > 0).slice(0, opts.top ?? 5),
    budgets,
    previous,
    change: {
      earned: change(head.earned, previous.earned),
      billedMinutes: change(head.billedMinutes, previous.billedMinutes),
      nonBillableMinutes: change(head.nonBillableMinutes, previous.nonBillableMinutes),
      effectiveHourly: change(head.effectiveHourly, previous.effectiveHourly),
    },
  };
}
