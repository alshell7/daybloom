// Reading a component's props safely. The OpenUI parser already drops what doesn't match a
// schema, but children arrive as element nodes and a model can still surprise, so every
// component checks its own props with zod here and draws nothing it can't trust. Plus the
// one colour rule: a tone is a category colour (light or lifted by the dial finish), lume or ink.

import type { z } from 'zod';
import { categoryColor } from '../../engine/categories';
import type { CategoryId } from '../../engine/types';
import { ICON_NODES } from '../../icons.generated';
import { view } from '../../stores/view.svelte';
import type { Tone } from './schema';

/** A child's props (children arrive as parser element nodes), or the value itself. */
export function propsOf(v: unknown): unknown {
  return v && typeof v === 'object' && (v as { type?: unknown }).type === 'element' ? (v as { props: unknown }).props : v;
}

/** The props when they fit the schema, else null. */
export function valid<S extends z.ZodType>(schema: S, v: unknown): z.infer<S> | null {
  const r = schema.safeParse(propsOf(v));
  return r.success ? r.data : null;
}

/** The items of a list that fit the schema (at most `max`). */
export function each<S extends z.ZodType>(schema: S, list: unknown, max = 20): z.infer<S>[] {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, max)
    .map((x) => valid(schema, x))
    .filter((x): x is z.infer<S> => x !== null);
}

/** A tone as a colour, from the theme and the dial finish. */
export function toneColor(t: Tone | null | undefined, fallback: Tone = 'ink'): string {
  const tone = t ?? fallback;
  if (tone === 'lume') return 'var(--lume)';
  if (tone === 'ink') return 'var(--ink)';
  return categoryColor(tone as CategoryId, view.finish.dark);
}

/** An icon the app has, or the fallback (a model may name one that doesn't exist). */
export function iconOr(name: string | null | undefined, fallback: string): string {
  return name && ICON_NODES[name] ? name : fallback;
}

/** Minutes, short enough for the middle of a ring: "45m", "2h", "1h30". */
export function shortLen(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h${String(m % 60).padStart(2, '0')}` : `${h}h`;
}
