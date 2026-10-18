// Natural-language "quick add": "Gym tomorrow 6pm 45m" → task fields.
//
// How it works: small regex matchers run over the text in priority order
// (repeat → date → time → duration → later/anytime). Each accepted match claims
// its span of the input, including the connector words it swallowed ("at", "on",
// "for", "from", "to", "every", "in"); later matchers never reuse a claimed span.
// Whatever is left unclaimed becomes the title.
//
// Decisions worth knowing:
// - Bare numbers are never times ("Read 3 chapters"). A number is a time only with
//   am/pm, a colon, "at"/"@", or inside a range ("9-10am", "from 2 to 4").
// - An hour of 1–12 without am/pm is guessed: 1–7 → pm, 8–11 → am, 12 → noon
//   (so "at 5" and "3:15" are afternoon). A leading zero ("07:30") or 0/13–23 is
//   read as a 24-hour clock. "morning"/"evening"/"tonight" next to a guessed hour
//   flip it ("tonight at 9" → 21:00).
// - A plain weekday ("fri") is the next one strictly after today, unless it is
//   today and the named time is still ahead (5-minute grace). "this fri" includes
//   today. "next fri" is the Friday of NEXT calendar week (Mon–Sun): on Monday
//   2026-10-19, "fri" → 10-23 but "next fri" → 10-30, and "next mon" → 10-26.
// - A time that already passed today stays today (the UI shows it as past). The
//   one exception is 00:00 with no date ("midnight"): that is the coming midnight.
// - A weekday recurrence with no date anchors on the first matching day from today
//   (today included). "weekly" without days repeats on the anchor's weekday.
// - Part-of-day words and "sat" are left alone when they open the text bare
//   ("Morning pages", "Midnight snack"); "night" needs "at"/"this"/a date before it;
//   bare "sun" is never a day ("Get some sun") — write "on sun" or "sunday".
// - "later today"/"sometime today" mean today; otherwise "later"/"someday" sends the
//   task to the Later tray and drops any time.
// - Said twice (two times, two dates)? The first wins and the rest stay in the title.

import { addDays, todayISO, weekday } from './engine/time';
import type { ISODate, Minutes, Recurrence } from './engine/types';

export interface QuickParse {
  title: string;
  date: ISODate | null;
  start: Minutes | null;
  hasTime: boolean;
  duration: Minutes | null;
  recurrence: Recurrence | null;
  anytime: boolean;
  /** Spans of the input that were understood, for highlighting: [startIndex, endIndex, kind] */
  tokens: [number, number, 'time' | 'date' | 'duration' | 'repeat' | 'later'][];
}

type Kind = QuickParse['tokens'][number][2];

const DAY = 1440;
const R = String.raw;

// ── Vocabulary ────────────────────────────────────────────────────────────────

const WD = R`(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)`;
const WD_ANY = new RegExp(WD, 'gi');
const wdOf = (word: string) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(word.slice(0, 3).toLowerCase());
/** Between weekdays in a list: ", " / " and " / "&" / "/" / "+" / plain space. */
const SEP = R`(?:\s*[,&/+]\s*(?:and\s+)?|\s+and\s+|\s+)`;

/** "45m", "90 minutes", "1.5h", "1h30", "1h 30m", "2 hours 15 mins", "an hour (and a half)", "half an hour". */
const DUR = R`(half\s+an?\s+hour|(?:an?|one)\s+hour(?:\s+and\s+a\s+half)?|\d+(?:\.\d+)?\s*(?:h|hrs?|hours?)(?:\s*\d{1,2}\s*(?:m|mins?|minutes?)|\d{1,2})?|\d+\s*(?:m|mins?|minutes?))(?!\w)`;

/** One clock reading: hour, optional :mm, optional am/pm ("5", "5:30", "5 pm", "5p.m."). */
const CLOCK = R`(\d{1,2})(?::(\d{2}))?(?:\s*([ap])\.?m\b\.?)?`;
/** Optional "at " / "from " / "@" before a clock; the trailing \b keeps us off mid-word digits. */
const CLOCK_PRE = R`(?:\b(at|from)\s+|(@)\s*)?\b`;

const FREQ: Record<string, [Recurrence['freq'], number]> = {
  day: ['daily', 1], daily: ['daily', 1], everyday: ['daily', 1],
  week: ['weekly', 1], weekly: ['weekly', 1], fortnightly: ['weekly', 2],
  month: ['monthly', 1], monthly: ['monthly', 1],
  year: ['yearly', 1], yearly: ['yearly', 1], annually: ['yearly', 1],
};

/** Part-of-day words → [minutes, implies pm? (null = no am/pm hint)]. */
const PART: Record<string, [Minutes, boolean | null]> = {
  noon: [720, null], midday: [720, null], midnight: [0, null],
  morning: [540, false], afternoon: [840, true], evening: [1080, true], night: [1200, true], tonight: [1200, true],
};

// Repeat
const WEEKPART_RE = /\b(?:every\s+week(?:day|end)|(?:on\s+)?week(?:day|end)s)\b/gi;
const EVERY_WD_RE = new RegExp(R`\b(?:every|each)\s+(other\s+)?(${WD}(?:${SEP}${WD})*)\b`, 'gi');
const EVERY_UNIT_RE = /\b(?:every|each)\s+(?:(other|\d+)\s+)?(day|week|month|year)s?\b/gi;
/** "every morning" → daily; the part-of-day word itself is left for the time matcher. */
const EVERY_PART_RE = /\b(?:every|each)(?=\s+(?:morning|afternoon|evening|night)\b)/gi;
const ADVERB_RE = /\b(daily|everyday|weekly|fortnightly|monthly|yearly|annually)\b/gi;
// Date
const DAYWORD_RE = /\b(?:(?:later|sometime)\s+)?(today|tomm?orr?ow|tmrw?|tmw)\b/gi;
const IN_DAYS_RE = /\bin\s+(\d+|an?)\s+(day|week)s?\b/gi;
const WEEKDAY_RE = new RegExp(R`\b(?:(on)\s+)?(?:(next|this)\s+)?(${WD})\b`, 'gi');
// Time
const REL_RE = new RegExp(R`\bin\s+${DUR}`, 'gi');
const RANGE_RE = new RegExp(R`${CLOCK_PRE}${CLOCK}\s*(?:-|–|—|to|till|until)\s*${CLOCK}(?![\w:])`, 'gi');
const CLOCK_RE = new RegExp(R`${CLOCK_PRE}${CLOCK}(?![\w:])`, 'gi');
const PART_RE = /\b(?:(at|in\s+the|this|later)\s+)?(noon|midday|midnight|morning|afternoon|evening|night|tonight)\b/gi;
// Duration, later, anytime
const DUR_RE = new RegExp(R`\b(?:for\s+)?${DUR}`, 'gi');
const LATER_RE = /\b(?:later|some\s?day|sometime|no\s+date)\b/gi;
const ANYTIME_RE = /\b(?:at\s+)?any\s?time\b/gi;

// ── Clock arithmetic ──────────────────────────────────────────────────────────

interface Clock {
  h: number;
  m: number;
  mer: 'a' | 'p' | null;
  /** Unambiguous 24-hour reading: 0, 13–23, or a leading zero. */
  h24: boolean;
}

function clock(hs: string, ms: string | undefined, mer: string | undefined): Clock | null {
  const h = Number(hs);
  const m = ms ? Number(ms) : 0;
  if (h > 23 || m > 59 || (mer && (h < 1 || h > 12))) return null;
  return {
    h,
    m,
    mer: mer ? (mer.toLowerCase() as 'a' | 'p') : null,
    h24: !mer && (h === 0 || h > 12 || (hs.length === 2 && hs[0] === '0')),
  };
}

/** Possible minutes-after-midnight: one if am/pm or 24h is clear, else [am, pm]. */
function candidates(c: Clock): Minutes[] {
  const base = (c.h % 12) * 60 + c.m;
  if (c.mer) return [c.mer === 'p' ? base + 720 : base];
  if (c.h24) return [c.h * 60 + c.m];
  return [base, base + 720];
}

/** Bare-hour heuristic: 8–11 → am; 1–7 and 12 → pm (12 pm = noon). */
function guess(c: Clock): Minutes {
  const opts = candidates(c);
  return opts.length === 1 || (c.h >= 8 && c.h <= 11) ? opts[0] : opts[1];
}

/** [start, duration] for "a–b". A start without am/pm borrows it from the end so the range is positive and < 12h. */
function range(a: Clock, b: Clock): [Minutes, Minutes] | null {
  const span = (s: Minutes, e: Minutes) => (e - s + DAY) % DAY;
  const short = (d: number) => d > 0 && d < 720;
  const as = candidates(a);
  const bs = candidates(b);
  let s = guess(a);
  if (as.length > 1 && bs.length === 1) s = as.find((x) => short(span(x, bs[0]))) ?? s;
  const e = bs.find((x) => short(span(s, x))) ?? bs[0];
  const d = span(s, e);
  return d > 0 ? [s, d] : null;
}

function durationOf(text: string): Minutes {
  const t = text.toLowerCase();
  if (t.startsWith('half')) return 30;
  if (!/^\d/.test(t)) return t.includes('half') ? 90 : 60; // "an hour (and a half)"
  const [, n, unit, extra] = /^([\d.]+)\s*([hm])\D*(\d*)/.exec(t)!;
  return unit === 'm' ? Number(n) : Math.round(Number(n) * 60) + (Number(extra) || 0);
}

// ── Dates ─────────────────────────────────────────────────────────────────────

function weekdayDate(today: ISODate, wd: number, mode: string, start: Minutes | null, nowMinutes: Minutes): ISODate {
  const cur = weekday(today);
  // That weekday in next Mon–Sun week: back to this Monday, +7, + offset from Monday.
  if (mode === 'next') return addDays(today, 7 - ((cur + 6) % 7) + ((wd + 6) % 7));
  let diff = (wd - cur + 7) % 7;
  const stillAhead = start !== null && start >= nowMinutes - 5;
  if (diff === 0 && mode !== 'this' && !stillAhead) diff = 7;
  return addDays(today, diff);
}

function firstMatching(today: ISODate, days: number[]): ISODate {
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    if (days.includes(weekday(d))) return d;
  }
  return today;
}

// ── Title ─────────────────────────────────────────────────────────────────────

const EDGE = /^[\s,.;:\-–—/&+@~]+|[\s,.;:\-–—/&+@~]+$/g;

function tidy(text: string): string {
  const t = text
    .replace(/\(\s*\)|\[\s*\]/g, ' ') // brackets emptied by a removed token
    .replace(/\s+/g, ' ')
    .replace(/ ([,;])/g, '$1') // "Lunch , with" → "Lunch, with"
    .replace(/([,;])[,;]+/g, '$1') // "Lunch,, with" → "Lunch, with"
    .replace(/([-–—])(?:\s+[-–—])+/g, '$1') // "Gym - - legs" → "Gym - legs"
    .replace(EDGE, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── Parser ────────────────────────────────────────────────────────────────────

interface State {
  recurrence: Recurrence | null;
  dateOf: ((start: Minutes | null) => ISODate) | null;
  start: Minutes | null;
  /** A 1–12 hour read without am/pm — a part-of-day word may flip it. */
  amb: Clock | null;
  part: string | null;
  /** Days added by "in 3 hours" crossing midnight. */
  relDays: number;
  duration: Minutes | null;
  later: boolean;
  anytime: boolean;
}

export function parseQuick(text: string, nowMs: number, nowMinutes: Minutes): QuickParse {
  const src = typeof text === 'string' ? text : '';
  try {
    return parse(src, nowMs, nowMinutes);
  } catch {
    return { title: tidy(src), date: todayISO(nowMs), start: null, hasTime: false, duration: null, recurrence: null, anytime: false, tokens: [] };
  }
}

function parse(src: string, nowMs: number, nowMinutes: Minutes): QuickParse {
  const today = todayISO(nowMs);
  const tokens: QuickParse['tokens'] = [];
  const s: State = { recurrence: null, dateOf: null, start: null, amb: null, part: null, relDays: 0, duration: null, later: false, anytime: false };

  /** Glued to the previous word, or the "30" of "10:30" / "5" of "1.5". */
  const glued = (i: number) => /\w$|\d[:.]$/.test(src.slice(Math.max(0, i - 2), i));
  const atStart = (i: number) => !/\w/.test(src.slice(0, i));
  const afterDate = (i: number) => tokens.some(([, e, k]) => k === 'date' && !src.slice(e, i).trim());

  /** Each match whose handler doesn't return false claims its span; rejected matches retry one char later. */
  const scan = (re: RegExp, kind: Kind, fn: (m: RegExpExecArray) => boolean | void) => {
    re.lastIndex = 0;
    for (let m = re.exec(src); m; m = re.exec(src)) {
      const a = m.index;
      const b = a + m[0].length;
      if (b > a && !glued(a) && tokens.every(([x, y]) => b <= x || a >= y) && fn(m) !== false) tokens.push([a, b, kind]);
      else re.lastIndex = a + 1;
    }
  };
  const repeat = (freq: Recurrence['freq'], interval: number, byWeekday?: number[]) => {
    if (s.recurrence) return false;
    s.recurrence = byWeekday ? { freq, interval, byWeekday } : { freq, interval };
  };
  const onDate = (f: (start: Minutes | null) => ISODate) => {
    if (s.dateOf) return false;
    s.dateOf = f;
  };

  // Repeat — first, so "every fri" isn't read as a one-off Friday.
  scan(WEEKPART_RE, 'repeat', (m) => repeat('weekly', 1, /weekday/i.test(m[0]) ? [1, 2, 3, 4, 5] : [0, 6]));
  scan(EVERY_WD_RE, 'repeat', (m) => {
    const days = [...new Set((m[2].match(WD_ANY) ?? []).map(wdOf))].sort((x, y) => x - y);
    return repeat('weekly', m[1] ? 2 : 1, days);
  });
  scan(EVERY_UNIT_RE, 'repeat', (m) => {
    const n = !m[1] ? 1 : /other/i.test(m[1]) ? 2 : Math.max(1, Number(m[1]));
    return repeat(FREQ[m[2].toLowerCase()][0], n);
  });
  scan(EVERY_PART_RE, 'repeat', () => repeat('daily', 1));
  scan(ADVERB_RE, 'repeat', (m) => repeat(...FREQ[m[1].toLowerCase()]));

  // Date — before times, so "tomorrow night" can see its date.
  scan(DAYWORD_RE, 'date', (m) => onDate(() => addDays(today, /^tod/i.test(m[1]) ? 0 : 1)));
  scan(IN_DAYS_RE, 'date', (m) => {
    const n = /\d/.test(m[1]) ? Number(m[1]) : 1;
    return onDate(() => addDays(today, n * (/^w/i.test(m[2]) ? 7 : 1)));
  });
  scan(WEEKDAY_RE, 'date', (m) => {
    const word = m[3].toLowerCase();
    if (!m[1] && !m[2] && (word === 'sun' || (word === 'sat' && atStart(m.index)))) return false;
    const mode = (m[2] ?? '').toLowerCase();
    return onDate((start) => weekdayDate(today, wdOf(word), mode, start, nowMinutes));
  });

  // Time
  scan(REL_RE, 'time', (m) => {
    if (s.start !== null) return false;
    const t = Math.round(nowMinutes + durationOf(m[1]));
    s.relDays = Math.floor(t / DAY);
    s.start = t % DAY;
  });
  scan(RANGE_RE, 'time', (m) => {
    const a = clock(m[3], m[4], m[5]);
    const b = clock(m[6], m[7], m[8]);
    // "Read 2-3 chapters" isn't a time: need a prefix, a colon or am/pm somewhere.
    if (s.start !== null || !a || !b || !(m[1] || m[2] || m[4] || m[5] || m[7] || m[8])) return false;
    const r = range(a, b);
    if (!r) return false;
    [s.start, s.duration] = r;
  });
  scan(CLOCK_RE, 'time', (m) => {
    const c = clock(m[3], m[4], m[5]);
    if (s.start !== null || !c || !(m[1] || m[2] || m[4] || m[5])) return false;
    s.start = guess(c);
    if (candidates(c).length > 1) s.amb = c;
  });
  scan(PART_RE, 'time', (m) => {
    const word = m[2].toLowerCase();
    const anchored = !!m[1] || word === 'tonight' || afterDate(m.index);
    if (s.part || (!anchored && (word === 'night' || atStart(m.index)))) return false;
    s.part = word;
  });

  // Duration, later, anytime
  scan(DUR_RE, 'duration', (m) => {
    const d = durationOf(m[1]);
    if (s.duration !== null || !(d > 0 && d <= DAY)) return false;
    s.duration = d;
  });
  scan(LATER_RE, 'later', () => {
    s.later = true;
  });
  scan(ANYTIME_RE, 'time', () => {
    s.anytime = true;
  });

  // Resolve
  let start = s.start;
  const partPm = s.part ? PART[s.part][1] : null;
  if (start === null && s.part) start = PART[s.part][0];
  else if (s.amb && partPm !== null && s.amb.h !== 12) start = candidates(s.amb)[partPm ? 1 : 0];
  if (s.later || s.anytime) start = null;

  let date: ISODate | null = null;
  if (!s.later) {
    if (s.dateOf) date = s.dateOf(start);
    else if (s.recurrence?.byWeekday) date = firstMatching(today, s.recurrence.byWeekday);
    else date = addDays(today, s.relDays || (start === 0 ? 1 : 0));
  }

  tokens.sort((x, y) => x[0] - y[0]);
  let rest = '';
  let pos = 0;
  for (const [a, b] of tokens) {
    rest += src.slice(pos, a) + ' ';
    pos = b;
  }
  rest += src.slice(pos);

  return {
    title: tidy(rest),
    date,
    start,
    hasTime: start !== null,
    duration: s.duration,
    recurrence: s.recurrence,
    anytime: s.anytime,
    tokens,
  };
}
