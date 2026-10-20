// The planner's layout on this computer (screens differ, so it never syncs): the day rail's
// width. 0 = fit automatically (the rail takes the room the dial doesn't need).

import type { Block, CategoryId } from '../engine/types';
import { persisted } from './persisted.svelte';

/** The rail is never narrower than this, or wider than RAIL_MAX… */
export const RAIL_MIN = 320;
export const RAIL_MAX = 640;
/** …and always leaves the dial's column at least this wide. */
export const DIAL_COLUMN_MIN = 480;

/** What the timeline leaves out. Empty = everything shows. */
export interface RailFilter {
  /** Sources: 'tasks' (your blocks), 'calendar', or an addon's own ('salah'). */
  hide: string[];
  /** Leave out finished blocks (unfinished only). */
  done: boolean;
  /** Leave out the free-time rows. */
  free: boolean;
  /** Kinds (categories) left out. */
  categories: CategoryId[];
}
export const NO_FILTER: RailFilter = { hide: [], done: false, free: false, categories: [] };

export const layout = persisted<{ railWidth: number; filter: RailFilter }>('layout', { railWidth: 0, filter: NO_FILTER }, (raw) => ({
  railWidth: Number.isFinite(raw?.railWidth) && raw.railWidth > 0 ? Math.round(raw.railWidth) : 0,
  filter: {
    hide: Array.isArray(raw?.filter?.hide) ? raw.filter.hide.filter((x: unknown) => typeof x === 'string') : [],
    done: raw?.filter?.done === true,
    free: raw?.filter?.free === true,
    categories: Array.isArray(raw?.filter?.categories) ? raw.filter.categories.filter((x: unknown) => typeof x === 'string') : [],
  },
}));

/** Where a block comes from, for the filter. */
export function sourceOf(b: Block): string {
  if (b.kind === 'task') return 'tasks';
  const p = b.event?.provider;
  return p === 'google' || p === 'ics' || !p ? 'calendar' : p;
}
export function filterActive(f: RailFilter): boolean {
  return f.hide.length > 0 || f.done || f.free || f.categories.length > 0;
}
export function shows(b: Block, f: RailFilter): boolean {
  return !f.hide.includes(sourceOf(b)) && !(f.done && b.done) && !f.categories.includes(b.category);
}

/** The widest the rail may be in a window this wide. */
export function railMax(viewWidth: number): number {
  return Math.max(RAIL_MIN, Math.min(RAIL_MAX, viewWidth - DIAL_COLUMN_MIN));
}

/**
 * Where a drag to `raw` px lands: inside the limits it follows the pointer; past them it gives
 * a little (rubber band) and springs back on release. Near the automatic width it snaps to it.
 */
export function dragWidth(raw: number, auto: number, max: number, snap = 14): { shown: number; keep: number; auto: boolean } {
  if (Math.abs(raw - auto) <= snap) return { shown: auto, keep: 0, auto: true };
  const give = (over: number) => Math.min(28, over * 0.25);
  const shown = raw < RAIL_MIN ? RAIL_MIN - give(RAIL_MIN - raw) : raw > max ? max + give(raw - max) : raw;
  return { shown: Math.round(shown), keep: Math.round(Math.min(max, Math.max(RAIL_MIN, raw))), auto: false };
}

/**
 * The live width while the handle is held (the grid follows it without a transition), and
 * `settling` for the short glide after a release or a reset.
 */
export const railDrag = $state({ active: false, width: 0, auto: false, settling: false });
