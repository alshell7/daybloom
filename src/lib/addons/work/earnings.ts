// Earnings: which project a piece of work bills to, at what rate, and the work items
// (one row per occurrence, event or day of project time) in a date range. Pure.

import { categoryColor } from '../../engine/categories';
import { taskBlocks } from '../../engine/blocks';
import { isoOf, MINUTE } from '../../engine/time';
import type { CalendarEvent, CategoryId, ISODate, Task } from '../../engine/types';
import { blockKey, isEventKey, normalizeKey, parseBlockKey, parseProjectTimeKey, projectTimeKey, taskIdOf } from './keys';
import { hourlyAmount } from './money';
import type {
  Assignment,
  Client,
  DateRange,
  Project,
  Rate,
  RateResolution,
  RateSource,
  Resolved,
  TrackedEntry,
  WorkContext,
  WorkData,
  WorkItem,
  WorkItemKind,
} from './types';

const priced = (r: Rate | undefined): r is Exclude<Rate, { kind: 'none' }> => !!r && r.kind !== 'none';

export function projectById(data: WorkData, id: string | undefined): Project | undefined {
  return id ? data.projects.find((p) => p.id === id) : undefined;
}

export function clientById(data: WorkData, id: string | undefined): Client | undefined {
  return id ? data.clients.find((c) => c.id === id) : undefined;
}

/** The currency a project bills in: its client's, else the default. */
export function projectCurrency(data: WorkData, project: Project | undefined): string {
  return clientById(data, project?.clientId)?.currency ?? data.settings.currency;
}

/** Resolve a CSS colour for a project (category id → its colour; hex stays). */
export function projectColor(project: Pick<Project, 'color'>, dark = false): string {
  return project.color.startsWith('#') ? project.color : categoryColor(project.color as CategoryId, dark);
}

/**
 * Rate precedence: occurrence assignment > task assignment > project > client default.
 * A level with no rate (or `none`) passes to the next one.
 */
export function rateChain(
  levels: { occurrence?: Rate; task?: Rate; project?: Rate; client?: Rate },
  currency: string,
): RateResolution {
  const order: [Exclude<RateSource, 'none'>, Rate | undefined][] = [
    ['occurrence', levels.occurrence],
    ['task', levels.task],
    ['project', levels.project],
    ['client', levels.client],
  ];
  for (const [source, rate] of order) if (priced(rate)) return { rate, source, currency };
  return { rate: { kind: 'none' }, source: 'none', currency };
}

/**
 * Who a key bills to. `key` may be a task id, a block key (`task:<id>@<date>`), an event
 * key (`cal:…`) or a project-time key (`project:<id>@<date>`). `entryProjectId` is the
 * project a tracked entry named, used only when nothing is assigned. Null = not work.
 */
export function resolveKey(data: WorkData, rawKey: string, entryProjectId?: string): Resolved | null {
  const key = normalizeKey(rawKey);
  const pt = parseProjectTimeKey(key);
  if (pt) {
    const project = projectById(data, pt.projectId);
    if (!project) return null;
    const client = clientById(data, project.clientId);
    const currency = client?.currency ?? data.settings.currency;
    return { key, project, client, billable: true, assignedBy: 'project', ...rateChain({ project: project.rate, client: client?.defaultRate }, currency) };
  }

  const block = parseBlockKey(key);
  const taskId = block ? block.taskId : taskIdOf(key);
  const occ: Assignment | undefined = block || isEventKey(key) ? data.assignments[key] : undefined;
  const task: Assignment | undefined = taskId ? data.assignments[taskId] : undefined;

  let chosen: Assignment | undefined;
  let assignedBy: Resolved['assignedBy'];
  if (occ && projectById(data, occ.projectId)) {
    chosen = occ;
    assignedBy = 'occurrence';
  } else if (task && projectById(data, task.projectId)) {
    chosen = task;
    assignedBy = 'task';
  } else if (entryProjectId && projectById(data, entryProjectId)) {
    chosen = { projectId: entryProjectId, billable: true };
    assignedBy = 'entry';
  } else return null;

  const project = projectById(data, chosen.projectId)!;
  const client = clientById(data, project.clientId);
  const currency = client?.currency ?? data.settings.currency;
  return {
    key,
    taskId,
    project,
    client,
    billable: chosen.billable,
    assignedBy,
    ...rateChain({ occurrence: occ?.rate, task: task?.rate, project: project.rate, client: client?.defaultRate }, currency),
  };
}

/** Price of an item: hourly on billed minutes, fixed once when done, 0 otherwise. */
export function itemAmount(rate: Rate, billable: boolean, billedMinutes: number, done: boolean): number {
  if (!billable) return 0;
  if (rate.kind === 'hourly') return hourlyAmount(billedMinutes, rate.amount);
  if (rate.kind === 'fixed') return done ? rate.amount : 0;
  return 0;
}

export function inRange(date: ISODate, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

interface Tracked {
  ms: number;
  date: ISODate;
  projectId?: string;
}

/** Which item key an entry counts toward, and on which date. Null = it cannot be placed. */
export function entryKey(e: TrackedEntry): { key: string; date: ISODate } | null {
  if (!Number.isFinite(e.startMs)) return null;
  if (e.blockKey) {
    const k = normalizeKey(e.blockKey);
    const b = parseBlockKey(k);
    if (b) return { key: k, date: b.date };
    if (isEventKey(k)) return { key: k, date: isoOf(e.startMs) };
  }
  const date = isoOf(e.startMs);
  if (e.taskId) return { key: blockKey(e.taskId, date), date };
  if (e.projectId) return { key: projectTimeKey(e.projectId, date), date };
  return null;
}

function collectTracked(entries: TrackedEntry[], range: DateRange, now: number): Map<string, Tracked> {
  const out = new Map<string, Tracked>();
  for (const e of entries) {
    if (!e) continue;
    const end = e.endMs == null ? now : e.endMs;
    if (!Number.isFinite(end) || end <= e.startMs) continue;
    const placed = entryKey(e);
    if (!placed || !inRange(placed.date, range)) continue;
    const t = out.get(placed.key) ?? { ms: 0, date: placed.date };
    t.ms += end - e.startMs;
    t.projectId ??= e.projectId;
    out.set(placed.key, t);
  }
  return out;
}

function plannedOf(task: Task, date: ISODate, startMs: number, endMs: number, floating: boolean, done: boolean, doneAt?: number) {
  if (floating) return Math.max(0, task.overrides?.[date]?.duration ?? task.duration);
  // Same rule as the dial: ticked early, only the time up to the tick counts.
  const end = done && doneAt && doneAt > startMs && doneAt < endMs ? doneAt : endMs;
  return Math.max(0, Math.round((end - startMs) / MINUTE));
}

export interface WorkItemsOptions {
  /** Also return non-billable items (amount 0). Default false. */
  includeNonBillable?: boolean;
  /** Only these projects. */
  projectIds?: string[];
  /** Only this client's projects (null = projects with no client). */
  clientId?: string | null;
}

/** One row per assigned occurrence, event or day of project time in `range`, sorted by time. */
export function workItems(ctx: WorkContext, range: DateRange, opts: WorkItemsOptions = {}): WorkItem[] {
  const { data } = ctx;
  const now = ctx.now ?? Date.now();
  const tracked = collectTracked(ctx.entries ?? [], range, now);
  const out = new Map<string, WorkItem>();

  const make = (
    key: string,
    kind: WorkItemKind,
    date: ISODate,
    startMs: number | null,
    title: string | undefined,
    planned: number,
    done: boolean,
    taskId?: string,
  ) => {
    if (out.has(key)) return;
    const t = tracked.get(key);
    const r = resolveKey(data, key, t?.projectId);
    if (!r) return;
    const trackedMinutes = t ? Math.round(t.ms / MINUTE) : 0;
    const billedMinutes = t && t.ms > 0 ? trackedMinutes : done && data.settings.billPlanned ? planned : 0;
    out.set(key, {
      key,
      kind,
      taskId,
      date,
      startMs,
      title: title || r.project.name,
      projectId: r.project.id,
      projectName: r.project.name,
      projectColor: projectColor(r.project),
      clientId: r.client?.id,
      clientName: r.client?.name,
      billable: r.billable,
      plannedMinutes: planned,
      trackedMinutes,
      billedMinutes,
      rate: r.rate,
      rateSource: r.source,
      amount: itemAmount(r.rate, r.billable, billedMinutes, done),
      currency: r.currency,
      done,
      invoiceId: data.invoicedKeys[key],
    });
  };

  // Tasks that can bill: assigned as a whole, per occurrence, or named by a tracked entry.
  const workTasks = new Set<string>();
  for (const k of Object.keys(data.assignments)) {
    const id = taskIdOf(k);
    if (id) workTasks.add(id);
  }
  for (const k of tracked.keys()) {
    const b = parseBlockKey(k);
    if (b) workTasks.add(b.taskId);
  }

  const taskById = new Map<string, Task>();
  for (const task of ctx.tasks) {
    taskById.set(task.id, task);
    if (!workTasks.has(task.id)) continue;
    if (task.date) {
      for (const b of taskBlocks(task, range.from, range.to)) {
        make(b.key, 'occurrence', b.date, b.floating ? null : b.startMs, b.title, plannedOf(task, b.date, b.startMs, b.endMs, b.floating, b.done, b.doneAt), b.done, task.id);
      }
    } else if (task.doneAt) {
      // Finished from the backlog: one item on the day it was done.
      const date = isoOf(task.doneAt);
      if (inRange(date, range)) make(blockKey(task.id, date), 'occurrence', date, null, task.title, Math.max(0, task.duration), true, task.id);
    }
  }

  // Calendar events assigned to a project (or tracked against one).
  for (const ev of ctx.events ?? []) {
    const key = `cal:${ev.accountId}:${ev.id}`;
    if (!data.assignments[key] && !tracked.has(key)) continue;
    const date = isoOf(ev.startMs);
    if (!inRange(date, range)) continue;
    make(key, 'event', date, ev.allDay ? null : ev.startMs, ev.title, eventMinutes(ev), ev.endMs <= now);
  }

  // Tracked time with no occurrence: off-day work on a task, project time, unseen events.
  for (const [key, t] of tracked) {
    if (out.has(key)) continue;
    const b = parseBlockKey(key);
    if (b) {
      const task = taskById.get(b.taskId);
      const done = !!task && (task.completions.includes(b.date) || (!task.date && !!task.doneAt && isoOf(task.doneAt) === b.date));
      make(key, 'occurrence', b.date, null, task?.title, 0, done, b.taskId);
      continue;
    }
    const pt = parseProjectTimeKey(key);
    if (pt) {
      make(key, 'project', pt.date, null, undefined, 0, true);
      continue;
    }
    // An event outside the loaded calendar window: dated by its first entry.
    make(key, 'event', t.date, null, undefined, 0, true);
  }

  let items = [...out.values()];
  if (!opts.includeNonBillable) items = items.filter((i) => i.billable);
  if (opts.projectIds) {
    const want = new Set(opts.projectIds);
    items = items.filter((i) => want.has(i.projectId));
  }
  if (opts.clientId !== undefined) items = items.filter((i) => (i.clientId ?? null) === opts.clientId);
  return items.sort(
    (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.startMs ?? Infinity) - (b.startMs ?? Infinity) || a.title.localeCompare(b.title) || (a.key < b.key ? -1 : 1),
  );
}

function eventMinutes(ev: CalendarEvent): number {
  return ev.allDay ? 0 : Math.max(0, Math.round((ev.endMs - ev.startMs) / MINUTE));
}
