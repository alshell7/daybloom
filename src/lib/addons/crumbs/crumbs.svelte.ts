// Breadcrumbs: one line about where you were, left when you step away from a task, and shown
// first when you come back. Plus a parking spot for stray thoughts during focus, so they wait
// instead of pulling you away. Kept on this computer, in its own file (never inside tasks).

import { untrack } from 'svelte';
import { backlog } from '../../backlog';
import { categoryColor } from '../../engine/categories';
import { parseBlockKey } from '../../engine/blocks';
import { persisted } from '../../stores/persisted.svelte';
import { taskFile } from '../../stores/tasks.svelte';
import { timer } from '../../stores/timer.svelte';
import { view } from '../../stores/view.svelte';

export interface Crumb {
  id: string;
  taskId: string;
  /** The task's title when the crumb was left (in case the task goes away). */
  title: string;
  text: string;
  at: number;
  source: 'leave' | 'stop' | 'manual';
}

export interface Parked {
  id: string;
  text: string;
  at: number;
  /** What you were focusing on when it came up. */
  from?: string;
}

export interface CrumbsFile {
  version: 1;
  crumbs: Crumb[];
  parked: Parked[];
  settings: { askOnLeave: boolean; askOnStop: boolean };
}

const PER_TASK = 20;
const MAX = 600;
const ASK_AGAIN_MS = 2 * 60_000;

const EMPTY: CrumbsFile = { version: 1, crumbs: [], parked: [], settings: { askOnLeave: true, askOnStop: true } };

export function migrateCrumbs(raw: any): CrumbsFile {
  const str = (x: unknown) => (typeof x === 'string' ? x : '');
  const crumbs: Crumb[] = Array.isArray(raw?.crumbs)
    ? raw.crumbs
        .filter((c: any) => str(c?.id) && str(c?.taskId) && str(c?.text).trim() && Number.isFinite(c?.at))
        .map((c: any) => ({ id: c.id, taskId: c.taskId, title: str(c.title), text: str(c.text).slice(0, 500), at: c.at, source: ['leave', 'stop', 'manual'].includes(c.source) ? c.source : 'manual' }))
    : [];
  const parked: Parked[] = Array.isArray(raw?.parked)
    ? raw.parked.filter((p: any) => str(p?.id) && str(p?.text).trim() && Number.isFinite(p?.at)).map((p: any) => ({ id: p.id, text: str(p.text).slice(0, 500), at: p.at, ...(str(p.from) ? { from: p.from } : {}) }))
    : [];
  const s = raw?.settings ?? {};
  return { version: 1, crumbs, parked, settings: { askOnLeave: s.askOnLeave !== false, askOnStop: s.askOnStop !== false } };
}

export const crumbsFile = persisted<CrumbsFile>('addon-crumbs', EMPTY, migrateCrumbs);

const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Keep the newest PER_TASK crumbs of each task, and MAX overall. */
export function trim(list: Crumb[]): Crumb[] {
  const seen = new Map<string, number>();
  const out: Crumb[] = [];
  for (const c of [...list].sort((a, b) => b.at - a.at)) {
    const n = seen.get(c.taskId) ?? 0;
    if (n >= PER_TASK) continue;
    seen.set(c.taskId, n + 1);
    out.push(c);
    if (out.length >= MAX) break;
  }
  return out.sort((a, b) => a.at - b.at);
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago", "on 2 Oct". */
export function ago(at: number, now = Date.now()): string {
  const d = Math.max(0, now - at);
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} h ago`;
  if (d < 2 * 86_400_000) return 'yesterday';
  if (d < 14 * 86_400_000) return `${Math.floor(d / 86_400_000)} days ago`;
  return `on ${new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

export interface Ask {
  taskId: string;
  title: string;
  color: string;
  reason: 'leave' | 'stop';
  /** Parked thoughts from this stretch of focus, to sort before moving on. */
  parkedSince: number;
}

class Crumbs {
  /** The "where did you leave off?" card, when it is up. */
  asking = $state<Ask | null>(null);
  #askedAt = new Map<string, number>();
  #focusSince = 0;

  get list() {
    return crumbsFile.value.crumbs;
  }
  get parked() {
    return crumbsFile.value.parked;
  }
  get settings() {
    return crumbsFile.value.settings;
  }

  /** Newest first. */
  of(taskId: string): Crumb[] {
    return this.list.filter((c) => c.taskId === taskId).sort((a, b) => b.at - a.at);
  }
  latest(taskId: string): Crumb | null {
    return this.of(taskId)[0] ?? null;
  }

  add(taskId: string, text: string, source: Crumb['source'] = 'manual'): Crumb | null {
    const t = text.trim();
    if (!t) return null;
    const task = taskFile.value.tasks.find((x) => x.id === taskId);
    const c: Crumb = { id: id(), taskId, title: task?.title ?? '', text: t.slice(0, 500), at: Date.now(), source };
    crumbsFile.value.crumbs = trim([...this.list, c]);
    return c;
  }
  remove(crumbId: string) {
    crumbsFile.value.crumbs = this.list.filter((c) => c.id !== crumbId);
  }

  park(text: string, from?: string): Parked | null {
    const t = text.trim();
    if (!t) return null;
    const p: Parked = { id: id(), text: t.slice(0, 500), at: Date.now(), ...(from ? { from } : {}) };
    crumbsFile.value.parked = [...this.parked, p];
    return p;
  }
  letGo(ids: string[]) {
    const drop = new Set(ids);
    crumbsFile.value.parked = this.parked.filter((p) => !drop.has(p.id));
  }
  /** Send parked thoughts to the backlog's Inbox (and out of the parking spot). */
  toBacklog(ids: string[]): number {
    const pick = this.parked.filter((p) => ids.includes(p.id));
    if (!pick.length) return 0;
    const made = backlog.capture(pick.map((p) => p.text.replace(/\n+/g, ' ')).join('\n'), 'inbox');
    this.letGo(pick.map((p) => p.id));
    return made.length;
  }
  parkedSince(t: number): Parked[] {
    return this.parked.filter((p) => p.at >= t);
  }

  /** Ask "where did you leave off?" for a task (not twice in a row, not for a finished one). */
  askFor(taskId: string, reason: Ask['reason']) {
    const task = taskFile.value.tasks.find((x) => x.id === taskId);
    if (!task) return;
    const today = view.today;
    const done = task.date === null ? !!task.doneAt : task.completions.includes(today);
    if (done) return;
    if (reason === 'leave' && !this.settings.askOnLeave) return;
    if (reason === 'stop' && !this.settings.askOnStop) return;
    const last = this.#askedAt.get(taskId) ?? 0;
    if (Date.now() - last < ASK_AGAIN_MS) return;
    this.#askedAt.set(taskId, Date.now());
    this.asking = { taskId, title: task.title || 'This task', color: categoryColor(task.category, view.finish.dark), reason, parkedSince: this.#focusSince || Date.now() };
  }
  dismiss() {
    this.asking = null;
  }

  /** Called when a stretch of focus begins (parked thoughts from here belong to it). */
  focusBegan(at = Date.now()) {
    this.#focusSince = at;
  }
}

export const crumbs = new Crumbs();

/** The task a focus view or session is about, if any. */
export function focusedTaskId(): string | null {
  const t = timer.active?.target;
  if (t?.taskId) return t.taskId;
  if (t?.key) return parseBlockKey(t.key)?.taskId ?? null;
  const cur = view.now.current;
  return cur?.taskId ?? null;
}

/**
 * Watch for the moments to ask: the focus view shrinks with a task in it, or a session for a
 * task ends. Main window only, while the addon is on.
 */
export function startCrumbs(): () => void {
  return $effect.root(() => {
    let wasFocus = view.focus;
    let lastTask: string | null = focusedTaskId();
    let lastSession = timer.active?.startedAt ?? 0;
    $effect(() => {
      const f = view.focus;
      const task = focusedTaskId();
      if (f && !wasFocus) crumbs.focusBegan();
      const leaving = !f && wasFocus ? lastTask : null;
      if (leaving) untrack(() => crumbs.askFor(leaving, 'leave'));
      wasFocus = f;
      if (f) lastTask = task;
    });
    $effect(() => {
      const a = timer.active;
      const started = a?.startedAt ?? 0;
      if (started && started !== lastSession) crumbs.focusBegan(started);
      const ended = lastSession && started !== lastSession ? lastTask : null;
      if (ended) untrack(() => crumbs.askFor(ended, 'stop'));
      lastSession = started;
      if (a) lastTask = focusedTaskId() ?? lastTask;
    });
  });
}
