// The planner's layout on this computer (screens differ, so it never syncs): the day rail's
// width. 0 = fit automatically (the rail takes the room the dial doesn't need).

import { persisted } from './persisted.svelte';

/** The rail is never narrower than this, or wider than RAIL_MAX… */
export const RAIL_MIN = 320;
export const RAIL_MAX = 640;
/** …and always leaves the dial's column at least this wide. */
export const DIAL_COLUMN_MIN = 480;

export const layout = persisted<{ railWidth: number }>('layout', { railWidth: 0 }, (raw) => ({
  railWidth: Number.isFinite(raw?.railWidth) && raw.railWidth > 0 ? Math.round(raw.railWidth) : 0,
}));

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
