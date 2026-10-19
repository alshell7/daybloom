// Reality check: how long things really take next to how long you planned, learned from
// finished blocks. Pure logic (no stores, no clocks), so it's easy to test and to trust.

import { CATEGORY_BY_ID } from '../../engine/categories';
import type { CategoryId } from '../../engine/types';

export type SampleSource = 'tracked' | 'focus' | 'tick';

export interface Sample {
  /** `taskId@date`: one per finished occurrence. */
  id: string;
  taskId: string;
  title: string;
  category: CategoryId;
  icon: string;
  /** Minutes planned. */
  planned: number;
  /** Minutes it really took. */
  actual: number;
  /** Where `actual` came from: tracked time, focus sessions, or when it was ticked (weakest). */
  source: SampleSource;
  /** When it was finished. */
  at: number;
}

export interface Estimate {
  /** Real ÷ planned (median). 1.3 → things take 30% longer. */
  ratio: number;
  /** How many samples it rests on. */
  n: number;
  scope: 'title' | 'category' | 'all';
  label: string;
  /** For the same task: how many minutes it typically really takes (median). */
  typical?: number;
}

/** Ratios are kept in this range: beyond it a sample is more likely a mistake than a habit. */
const MIN_RATIO = 0.25;
const MAX_RATIO = 4;
/** Within this of 1, plans fit: no suggestion. */
const FITS = 0.15;

/** Titles that mean the same task: case, numbers and punctuation don't matter. */
export function kindKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^\p{L}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ratioOf = (s: Sample) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, s.actual / Math.max(1, s.planned)));

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Measured time (tracked, focus) is trusted over tick timing when there's enough of it. */
function pick(samples: Sample[]): Sample[] {
  const measured = samples.filter((s) => s.source !== 'tick');
  return measured.length >= 2 ? measured : samples;
}

/** How long things like this really take, from the closest group with enough samples. */
export function estimate(samples: Sample[], o: { title: string; category: CategoryId }): Estimate | null {
  const key = kindKey(o.title);
  const same = key ? pick(samples.filter((s) => kindKey(s.title) === key)) : [];
  if (same.length >= 2) return { ratio: median(same.map(ratioOf)), n: same.length, scope: 'title', label: o.title.trim(), typical: median(same.map((s) => s.actual)) };
  const cat = pick(samples.filter((s) => s.category === o.category));
  if (cat.length >= 3) return { ratio: median(cat.map(ratioOf)), n: cat.length, scope: 'category', label: CATEGORY_BY_ID[o.category]?.label ?? 'this kind' };
  const all = pick(samples);
  if (all.length >= 5) return { ratio: median(all.map(ratioOf)), n: all.length, scope: 'all', label: 'your blocks' };
  return null;
}

/** A better length for `planned` minutes, or null when the plan already fits. Rounded to 5. */
export function suggest(planned: number, est: Estimate | null): number | null {
  if (!est) return null;
  // The same task: what it typically takes (so taking the suggestion settles it). Else scale.
  if (est.scope === 'title' && est.typical) {
    const m = Math.max(5, Math.round(est.typical / 5) * 5);
    return Math.abs(m - planned) / planned >= FITS && Math.abs(m - planned) >= 5 ? m : null;
  }
  if (Math.abs(est.ratio - 1) < FITS) return null;
  const m = Math.max(5, Math.round((planned * est.ratio) / 5) * 5);
  return Math.abs(m - planned) >= 5 ? m : null;
}

export interface Group {
  key: string;
  label: string;
  category: CategoryId;
  icon: string;
  n: number;
  /** Typical planned and real minutes (medians). */
  planned: number;
  actual: number;
  ratio: number;
}

export interface Summary {
  n: number;
  ratio: number | null;
  /** Tasks you've finished at least twice, most frequent first. */
  byTitle: Group[];
  byCategory: Group[];
}

function group(key: string, label: string, list: Sample[]): Group {
  const use = pick(list);
  const last = list[list.length - 1];
  return {
    key,
    label,
    category: last.category,
    icon: last.icon,
    n: use.length,
    planned: Math.round(median(use.map((s) => s.planned))),
    actual: Math.round(median(use.map((s) => s.actual))),
    ratio: median(use.map(ratioOf)),
  };
}

export function summarize(samples: Sample[]): Summary {
  const sorted = [...samples].sort((a, b) => a.at - b.at);
  const titles = new Map<string, Sample[]>();
  const cats = new Map<CategoryId, Sample[]>();
  for (const s of sorted) {
    const k = kindKey(s.title);
    if (k) titles.set(k, [...(titles.get(k) ?? []), s]);
    cats.set(s.category, [...(cats.get(s.category) ?? []), s]);
  }
  const byTitle = [...titles.entries()]
    .filter(([, l]) => l.length >= 2)
    .map(([k, l]) => group(k, l[l.length - 1].title.trim(), l))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  const byCategory = [...cats.entries()]
    .map(([c, l]) => group(c, CATEGORY_BY_ID[c]?.label ?? c, l))
    .sort((a, b) => b.n - a.n);
  const all = pick(sorted);
  return { n: sorted.length, ratio: all.length ? median(all.map(ratioOf)) : null, byTitle, byCategory };
}

/** Plain words for a ratio: "about 1.3× what you plan", "about what you plan". */
export function ratioWords(r: number): { headline: string; tone: 'longer' | 'fits' | 'shorter' } {
  if (Math.abs(r - 1) < FITS) return { headline: 'Your plans fit how long things really take', tone: 'fits' };
  const x = r.toFixed(1).replace(/\.0$/, '');
  return r > 1
    ? { headline: `Things take about ${x}× what you plan`, tone: 'longer' }
    : { headline: `Things often take less than you plan, about ${x}×`, tone: 'shorter' };
}

/**
 * Tick timing as a measurement: from the block's start to when it was ticked, if that looks
 * like the real thing (not ticked hours later, not ticked before it began).
 */
export function tickMinutes(startMs: number, plannedMin: number, doneAt: number): number | null {
  const m = (doneAt - startMs) / 60_000;
  if (m < Math.max(3, plannedMin * 0.3) || m > plannedMin * 3 || m > plannedMin + 180) return null;
  return Math.round(m);
}
