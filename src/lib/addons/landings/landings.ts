// Soft landings: after meetings (and long stretches of focus) energy dips, and the next task
// is hard to pick up straight away. This notices those moments — what drains, which hand-offs
// are back-to-back — and offers small stepping stones: a body reset, a little novelty, and a
// two-minute first step into what's next. Pure, so it tests fast.

import { makeSmaller } from '../smaller/split';
import type { Block } from '../../engine/types';

const MIN = 60_000;

export type Drain = 'meeting' | 'long' | null;

const MEETING_WORDS =
  /\b(meet|meeting|meetings|sync|stand-?up|1:1|1-1|one[- ]on[- ]one|call|catch[- ]?up|interview|review|demo|workshop|retro|retrospective|planning|kick-?off|all[- ]hands|townhall|town hall|webinar|session|briefing|huddle|presentation|standup)\b/i;

/** Does this block tend to drain energy? Meetings (people or a video link), or a long focus. */
export function drainOf(b: Block): Drain {
  if (b.floating || b.event?.provider === 'salah') return null;
  const ev = b.event;
  const people = ev?.attendees?.length ?? 0;
  if (ev && (people >= 2 || ev.meetUrl)) return 'meeting';
  if (MEETING_WORDS.test(b.title) && (b.kind === 'event' || b.category === 'social' || b.category === 'focus' || b.icon === 'video' || b.icon === 'phone')) return 'meeting';
  if (b.kind === 'task' && b.category === 'focus' && b.endMs - b.startMs >= 90 * MIN) return 'long';
  return null;
}

export interface Handoff {
  /** The block that drains (the last of a run of meetings). */
  from: Block;
  /** What comes next, if it starts soon. */
  to: Block;
  /** Minutes between them. */
  gapMin: number;
  /** Minutes to add to reach the landing you asked for. */
  needMin: number;
  /** Meetings in a row ending here (1 = just this one). */
  run: number;
}

/**
 * Back-to-back hand-offs on a day: a draining block followed by a block that starts sooner
 * than `bufferMin` after it. Runs of meetings count as one (the landing goes after the last).
 */
export function handoffs(blocks: Block[], bufferMin: number): Handoff[] {
  if (bufferMin <= 0) return [];
  const timed = blocks.filter((b) => !b.floating).sort((a, b) => a.startMs - b.startMs);
  const out: Handoff[] = [];
  let run = 0;
  for (let i = 0; i < timed.length; i++) {
    const b = timed[i];
    const d = drainOf(b);
    const next = timed.slice(i + 1).find((x) => x.startMs >= b.endMs - MIN);
    if (!d) {
      run = 0;
      continue;
    }
    run = d === 'meeting' ? run + 1 : 1;
    if (!next) continue;
    const gap = Math.round((next.startMs - b.endMs) / MIN);
    // Another meeting straight after: keep counting the run; the landing goes after the last.
    if (drainOf(next) === 'meeting' && gap < bufferMin) continue;
    if (gap < bufferMin && gap > -1) out.push({ from: b, to: next, gapMin: Math.max(0, gap), needMin: bufferMin - Math.max(0, gap), run });
    run = 0;
  }
  return out;
}

/** Busy spans for planning: draining blocks reach `bufferMin` further, so plans keep a landing. */
export function withLandings<T extends Pick<Block, 'startMs' | 'endMs'>>(blocks: T[], bufferMin: number, isDraining: (b: T) => boolean): T[] {
  if (bufferMin <= 0) return blocks;
  return blocks.map((b) => (isDraining(b) ? { ...b, endMs: b.endMs + bufferMin * MIN } : b));
}

export type StoneKind = 'body' | 'spark' | 'step';
export interface Stone {
  id: string;
  kind: StoneKind;
  title: string;
  minutes: number;
  icon: string;
  /** 'breathe' opens the breathing guide; 'timer' starts a short countdown. */
  action: 'breathe' | 'timer';
}

export const STONES: Stone[] = [
  { id: 'breathe', kind: 'body', title: 'Breathe for a minute', minutes: 1, icon: 'wind', action: 'breathe' },
  { id: 'stretch', kind: 'body', title: 'Stand up and stretch', minutes: 3, icon: 'activity', action: 'timer' },
  { id: 'water', kind: 'body', title: 'Get a glass of water', minutes: 3, icon: 'droplet', action: 'timer' },
  { id: 'walk', kind: 'body', title: 'Walk to a window and look far away', minutes: 3, icon: 'footprints', action: 'timer' },
  { id: 'eyes', kind: 'body', title: 'Close your eyes for a moment', minutes: 2, icon: 'eye-off', action: 'timer' },
  { id: 'song', kind: 'spark', title: 'Play one song you love', minutes: 4, icon: 'music', action: 'timer' },
  { id: 'doodle', kind: 'spark', title: 'Doodle for two minutes', minutes: 2, icon: 'palette', action: 'timer' },
  { id: 'tea', kind: 'spark', title: 'Make a cup of tea', minutes: 5, icon: 'coffee', action: 'timer' },
  { id: 'note', kind: 'spark', title: 'Write one line: what went well', minutes: 2, icon: 'pen', action: 'timer' },
  { id: 'tidy', kind: 'spark', title: 'Clear one thing off your desk', minutes: 2, icon: 'sparkles', action: 'timer' },
];

/**
 * Three stepping stones: one for the body, one small spark, and a two-minute first step into
 * what's next (the hook back in). `seed` rotates the choices so they don't repeat every time;
 * `allowed` is the user's list; `recent` are ids offered lately (offered less).
 */
export function pickStones(o: { next?: Pick<Block, 'title' | 'category'> | null; seed: number; allowed?: string[]; recent?: string[]; hour?: number }): Stone[] {
  const ok = (s: Stone) => !o.allowed || o.allowed.includes(s.id);
  const recent = new Set(o.recent ?? []);
  const pick = (kind: StoneKind) => {
    let pool = STONES.filter((s) => s.kind === kind && ok(s));
    // Tea late in the evening is a poor gift.
    if (o.hour !== undefined && o.hour >= 19) pool = pool.filter((s) => s.id !== 'tea');
    const fresh = pool.filter((s) => !recent.has(s.id));
    const from = fresh.length ? fresh : pool;
    return from.length ? from[Math.abs(o.seed) % from.length] : null;
  };
  const out: Stone[] = [];
  const body = pick('body');
  if (body) out.push(body);
  const spark = pick('spark');
  if (spark) out.push(spark);
  if (o.next?.title?.trim() && (!o.allowed || o.allowed.includes('step'))) {
    const first = makeSmaller(o.next.title, { category: o.next.category })[0];
    if (first) out.push({ id: 'step', kind: 'step', title: first.title, minutes: 2, icon: 'arrow-right', action: 'timer' });
  }
  return out;
}

/** The card's first line, by what just happened. */
export function headline(run: number, drain: Drain): string {
  if (drain === 'long') return 'That was a long stretch. Land softly.';
  if (run >= 3) return `${run} meetings in a row. Land softly.`;
  if (run === 2) return 'Two meetings back to back. Take a breath.';
  return 'Meeting done. Land softly.';
}
