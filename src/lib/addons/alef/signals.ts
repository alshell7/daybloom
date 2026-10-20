// What Alef notices: a snapshot of the day turned into the affect model's signals, and the
// moments worth a reaction (a block finished, one starting, one ending without a tick…),
// found by comparing this snapshot with what Alef had already seen. Pure.

import { hourOf, isoOf, MINUTE, minutesOfDay } from '../../engine/time';
import type { Block, ISODate } from '../../engine/types';
import type { AffectEvent, Signals } from './affect';

export interface Snapshot {
  now: number;
  /** Today's blocks (timed and anytime). */
  blocks: Block[];
  inFocus: boolean;
  idleMin: number;
  streak: number;
  /** Blocks that ended without a tick or a "let it go". */
  openCheckIns: number;
  /** The waking day, in minutes after midnight. */
  wake: number;
  sleep: number;
}

export interface Seen {
  day: ISODate | null;
  done: string[];
  started: string[];
  ended: string[];
  lastMinute: string[];
  allDone: boolean;
  manyOpen: boolean;
}

export const NOTHING_SEEN: Seen = { day: null, done: [], started: [], ended: [], lastMinute: [], allDone: false, manyOpen: false };

export interface Moment {
  ev: AffectEvent;
  block?: Block;
}

const own = (b: Block) => b.kind === 'task';

export function awakeAt(now: number, wake: number, sleep: number): boolean {
  const m = minutesOfDay(now);
  return wake <= sleep ? m >= wake && m < sleep : m >= wake || m < sleep;
}

export function signalsOf(s: Snapshot): Signals {
  const tasks = s.blocks.filter(own);
  const due = tasks.filter((b) => b.floating ? b.done : b.startMs <= s.now);
  const done = due.filter((b) => b.done).length;
  const current = tasks.find((b) => !b.floating && !b.done && b.startMs <= s.now && s.now < b.endMs + 15 * MINUTE && s.now >= b.endMs);
  const next = s.blocks.filter((b) => !b.floating && b.startMs > s.now).sort((a, b) => a.startMs - b.startMs)[0];
  return {
    hour: hourOf(s.now),
    awake: awakeAt(s.now, s.wake, s.sleep),
    doneRatio: due.length ? done / due.length : null,
    openCheckIns: s.openCheckIns,
    overrunMin: current ? Math.round((s.now - current.endMs) / MINUTE) : 0,
    inFocus: s.inFocus,
    idleMin: s.idleMin,
    streak: s.streak,
    nextInMin: next ? Math.round((next.startMs - s.now) / MINUTE) : null,
  };
}

/**
 * The moments since Alef last looked. The first look of a day only learns what's there (no
 * reactions to old news). One snapshot gives at most a few moments, biggest first.
 */
export function moments(prev: Seen, s: Snapshot): { moments: Moment[]; seen: Seen } {
  const today = isoOf(s.now);
  const first = prev.day !== today;
  const base: Seen = first ? { ...NOTHING_SEEN, day: today } : prev;
  const out: Moment[] = [];
  const tasks = s.blocks.filter(own);
  const timed = s.blocks.filter((b) => !b.floating);

  const doneNow = tasks.filter((b) => b.done).map((b) => b.key);
  const fresh = tasks.filter((b) => b.done && !base.done.includes(b.key));
  const allDone = tasks.length > 1 && tasks.every((b) => b.done);
  if (!first) {
    if (allDone && !base.allDone) out.push({ ev: 'allDone', block: fresh[0] });
    else for (const b of fresh) out.push({ ev: b.endMs - b.startMs >= 60 * MINUTE ? 'bigDone' : 'done', block: b });
  }

  // Starting now (in the last two minutes).
  const starting = timed.filter((b) => b.startMs <= s.now && b.startMs > s.now - 2 * MINUTE && !b.done && !base.started.includes(b.key));
  if (!first) for (const b of starting) out.push({ ev: 'blockStart', block: b });

  // Two minutes left on a block that isn't ticked.
  const closing = tasks.filter((b) => !b.floating && !b.done && b.endMs - s.now > 0 && b.endMs - s.now <= 2 * MINUTE && b.endMs - b.startMs >= 15 * MINUTE && !base.lastMinute.includes(b.key));
  if (!first) for (const b of closing) out.push({ ev: 'lastMinute', block: b });

  // Ended without a tick (in the last three minutes): a gentle "how did it go?".
  const ended = tasks.filter((b) => !b.floating && !b.done && b.endMs <= s.now && b.endMs > s.now - 3 * MINUTE && !base.ended.includes(b.key));
  if (!first) for (const b of ended) out.push({ ev: 'checkIn', block: b });

  const manyOpen = s.openCheckIns >= 3;
  if (!first && manyOpen && !base.manyOpen) out.push({ ev: 'manyMissed' });

  const order: AffectEvent[] = ['allDone', 'bigDone', 'done', 'manyMissed', 'checkIn', 'blockStart', 'lastMinute'];
  out.sort((a, b) => order.indexOf(a.ev) - order.indexOf(b.ev));

  const seen: Seen = {
    day: today,
    done: doneNow,
    started: [...new Set([...base.started, ...timed.filter((b) => b.startMs <= s.now).map((b) => b.key)])].slice(-200),
    ended: [...new Set([...base.ended, ...tasks.filter((b) => !b.floating && b.endMs <= s.now).map((b) => b.key)])].slice(-200),
    lastMinute: [...new Set([...base.lastMinute, ...closing.map((b) => b.key), ...(first ? tasks.filter((b) => !b.floating && b.endMs - s.now <= 2 * MINUTE).map((b) => b.key) : [])])].slice(-200),
    allDone: base.allDone || allDone,
    manyOpen,
  };
  return { moments: out.slice(0, 3), seen };
}
