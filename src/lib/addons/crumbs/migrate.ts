// Breadcrumbs: the file's shape, repairing a stored (or synced) file, and the size limits.
// Pure: no stores, no clocks.

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
