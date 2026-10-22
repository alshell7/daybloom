// What fits in the top bar at a given width. Pure: the bar measures every item's natural width
// once (and again only when an item changes), then asks fitBar() with plain numbers.
//
// The bar starts with everything out and shortens itself step by step, cheapest first: the long
// date becomes a short one, the quietest actions fold into More, the date gives way to "Today",
// the zone chip to its globe, and so on. Each step has a priority (STEP, and each item's own);
// everything below the line is taken, nothing above it, so a wider window only ever brings
// things back, in order. One step is different: the week dropping to its own row frees most of
// row one, so the bar first tries to keep the week inline with only the cheap steps, and if that
// fails it starts again with the week below. Same numbers in, same bar out.

import { platform } from '../../lib/platform';

export type DateMode = 'long' | 'short' | 'rel' | 'clock';
export type ZoneMode = 'full' | 'compact' | 'menu';
export type WeekMode = 'inline' | 'below' | 'menu';

/** Sizes the bar's CSS uses (px). Keep in sync with TopBar.svelte and WeekStrip.svelte. */
export const BAR = {
  /** Between the day, the week and the actions. */
  gap: 16,
  /** Between the clock, the date and the zone chip. */
  leadGap: 8,
  /** Between two actions, and the extra space where one group of actions meets the next. */
  itemGap: 2,
  groupGap: 6,
  /** The week strip: chevrons (and its calendar button), day chips (inline size and the
   *  smallest), the gap between them. */
  chevron: 34,
  chip: 42,
  chipMin: 32,
  weekGap: 2,
  /** Space before the week's Today button. */
  todayGap: 8,
} as const;

/** When the bar's own steps happen, against the items' priorities (lower goes first). */
export const STEP = {
  dateShort: 10,
  /** The week's Today button (only shown on other days; its room is kept so moving between
   *  days never reshuffles the bar). The clock pill goes to today too. */
  weekToday: 14,
  /** Only the steps cheaper than this may keep the week inline. */
  weekBelow: 24,
  dateRel: 44,
  zoneCompact: 52,
  dateClock: 62,
  zoneMenu: 86,
} as const;

export interface FitItem {
  id: string;
  /** Higher stays in the bar longer. */
  priority: number;
  /** Natural width in px. */
  width: number;
  /** Items of one group sit a little closer together. */
  group?: string;
}

export interface FitInput {
  /** Row one's width for content, with the macOS traffic-light inset already taken off. */
  row: number;
  /** The width the week has when it drops to its own row (the bar's full content width). */
  row2: number;
  /** The clock pill, "Today", and the long and short date; null when the day is hidden. */
  date: null | { clock: number; rel: number; long: number; short: number };
  /** The zone chip, full and icon-only; null when hidden. */
  zone: null | { full: number; compact: number };
  /** The week strip; null when hidden. `today`: the Today button's width. */
  week: null | { today: number };
  /** The actions, in bar order. */
  items: FitItem[];
  /** The More button (always in the bar). */
  more: number;
}

export interface FitResult {
  date: DateMode | null;
  zone: ZoneMode | null;
  week: WeekMode | null;
  /** Day-chip size for the week (42 inline; smaller on a narrow row of its own). */
  chip: number;
  /** Room for the week's Today button. */
  weekToday: boolean;
  /** Action ids in the bar, in order. */
  shown: string[];
  /** Action ids in More, in bar order. */
  folded: string[];
  /** Row one's width as decided (for tests and debugging). */
  used: number;
}

/** The week strip's width for a chip size, with or without its Today button: the chevrons and
 *  the month-calendar button (all 34px), seven chips, and the gaps between them. */
/** The week's buttons: back, on and the calendar (a phone swipes instead, so only the calendar). */
const WEEK_BUTTONS = platform.isMobile ? 1 : 3;

export function weekWidth(chip: number, today: number): number {
  const base = WEEK_BUTTONS * BAR.chevron + 7 * chip + (6 + WEEK_BUTTONS) * BAR.weekGap;
  return today > 0 ? base + BAR.weekGap + BAR.todayGap + today : base;
}

interface State {
  date: DateMode | null;
  zone: ZoneMode | null;
  week: WeekMode | null;
  /** Room for the week's Today button (inline). */
  today: boolean;
  folded: Set<string>;
}

function dateWidth(d: NonNullable<FitInput['date']>, mode: DateMode): number {
  const g = BAR.leadGap;
  if (mode === 'clock') return d.clock;
  const rel = d.rel > 0 ? g + d.rel : 0;
  if (mode === 'long') return d.clock + rel + g + d.long;
  if (mode === 'short') return d.clock + rel + g + d.short;
  // 'rel': just "Today" when there is one, else the short date stays (something must say the day).
  return d.rel > 0 ? d.clock + rel : d.clock + g + d.short;
}

function actionsWidth(items: FitItem[], folded: Set<string>, more: number): number {
  let w = more;
  let prev: string | undefined;
  let first = true;
  for (const it of items) {
    if (folded.has(it.id) || it.width <= 0) continue;
    w += it.width + BAR.itemGap;
    if (!first && it.group !== prev) w += BAR.groupGap;
    prev = it.group;
    first = false;
  }
  return w;
}

function rowWidth(input: FitInput, s: State): number {
  let lead = 0;
  if (input.date && s.date) lead += dateWidth(input.date, s.date);
  if (input.zone && s.zone && s.zone !== 'menu') {
    if (lead) lead += BAR.leadGap;
    lead += s.zone === 'full' ? input.zone.full : input.zone.compact;
  }
  const week = input.week && s.week === 'inline' ? BAR.gap + weekWidth(BAR.chip, s.today ? input.week.today : 0) : 0;
  return lead + week + BAR.gap + actionsWidth(input.items, s.folded, input.more);
}

interface Step {
  pri: number;
  /** Which part of the bar it changes (an item's steps have none). */
  key?: 'date' | 'zone' | 'today';
  /** Take the step (a no-op when the bar isn't where this step starts). */
  apply: (s: State) => void;
}

function stepsFor(input: FitInput): Step[] {
  const steps: Step[] = [];
  const set = <K extends 'date' | 'zone' | 'today'>(key: K, from: State[K], to: State[K], pri: number): Step => ({
    pri,
    key,
    apply: (s) => {
      if (s[key] === from) s[key] = to;
    },
  });
  if (input.date) {
    steps.push(set('date', 'long', 'short', STEP.dateShort));
    steps.push(set('date', 'short', 'rel', STEP.dateRel));
    steps.push(set('date', 'rel', 'clock', STEP.dateClock));
  }
  if (input.week) steps.push(set('today', true, false, STEP.weekToday));
  if (input.zone) {
    steps.push(set('zone', 'full', 'compact', STEP.zoneCompact));
    steps.push(set('zone', 'compact', 'menu', STEP.zoneMenu));
  }
  for (const it of input.items) {
    steps.push({
      pri: it.priority,
      apply: (s) => void s.folded.add(it.id),
    });
  }
  // Stable: equal priorities fold right to left (the later item goes first).
  return steps
    .map((st, i) => ({ st, i }))
    .sort((a, b) => a.st.pri - b.st.pri || b.i - a.i)
    .map((x) => x.st);
}

/** Decide the bar for a width. */
export function fitBar(input: FitInput): FitResult {
  const fresh = (week: WeekMode | null): State => ({
    date: input.date ? 'long' : null,
    zone: input.zone ? 'full' : null,
    week,
    today: true,
    folded: new Set(),
  });
  let s = fresh(input.week ? 'inline' : null);
  const fits = () => rowWidth(input, s) <= input.row + 0.5;
  /** Take steps, cheapest first, until the row fits. */
  const shorten = (steps: Step[]) => {
    for (const st of steps) {
      if (fits()) return;
      st.apply(s);
    }
  };

  // Not measured yet: everything out (the first measurement decides before anything is painted).
  if (input.row > 0) {
    const steps = stepsFor(input);
    if (input.week) {
      shorten(steps.filter((st) => st.pri < STEP.weekBelow));
      if (!fits()) {
        s = fresh('below');
        // Down there the week has its own row; Today is decided below.
        shorten(steps.filter((st) => st.key !== 'today'));
      }
    } else shorten(steps);
  }

  // The week's own row: the largest chips that fit; Today only when there's room (the clock
  // pill goes to today too).
  let chip: number = BAR.chip;
  let weekToday = !!input.week && s.today;
  if (input.week && s.week === 'below') {
    const today = input.week.today;
    const room = (t: number) => Math.floor((input.row2 - weekWidth(0, t)) / 7);
    chip = Math.min(BAR.chip, room(today));
    if (chip < 36) {
      weekToday = false;
      chip = Math.min(BAR.chip, room(0));
    }
    if (chip < BAR.chipMin) s.week = 'menu';
    chip = Math.max(BAR.chipMin, chip);
  }

  const shown = input.items.filter((it) => !s.folded.has(it.id)).map((it) => it.id);
  const folded = input.items.filter((it) => s.folded.has(it.id)).map((it) => it.id);
  return { date: s.date, zone: s.zone, week: s.week, chip, weekToday, shown, folded, used: rowWidth(input, s) };
}
