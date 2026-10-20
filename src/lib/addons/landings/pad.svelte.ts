// Soft landings: the settings and log, and the "landing pad" that planning uses — while the
// addon is on, meetings and long stretches count as busy a few minutes longer, so free-time
// suggestions, the backlog planner and AI apps leave room to land. Kept light (no actions),
// so the planner can import it.

import type { Block } from '../../engine/types';
import { persisted } from '../../stores/persisted.svelte';
import { isOn } from '../registry';
import { drainOf, STONES, withLandings } from './landings';

export interface LandingsFile {
  version: 1;
  settings: {
    /** Minutes to keep after meetings (and long focus). 0 = off. */
    buffer: number;
    /** Offer a landing when a meeting ends. */
    afterMeetings: boolean;
    /** …and after 90 minutes or more of focus. */
    afterLong: boolean;
    /** Stepping stones to offer (ids from STONES, and 'step'). */
    stones: string[];
  };
  /** Landings offered and taken, newest last (a few weeks). */
  log: { at: number; run: number; stone: string | null }[];
  /** Stones offered lately, so they rotate. */
  recent: string[];
}

export const ALL_STONES = [...STONES.map((s) => s.id), 'step'];

export function migrateLandings(raw: any): LandingsFile {
  const s = raw?.settings ?? {};
  const buffer = [0, 5, 10, 15].includes(s.buffer) ? s.buffer : 10;
  const stones = Array.isArray(s.stones) ? s.stones.filter((x: unknown) => typeof x === 'string' && ALL_STONES.includes(x as string)) : ALL_STONES;
  const log = Array.isArray(raw?.log) ? raw.log.filter((x: any) => x && Number.isFinite(x.at)).map((x: any) => ({ at: x.at, run: Number(x.run) || 1, stone: typeof x.stone === 'string' ? x.stone : null })).slice(-400) : [];
  const recent = Array.isArray(raw?.recent) ? raw.recent.filter((x: unknown) => typeof x === 'string').slice(-6) : [];
  return {
    version: 1,
    settings: { buffer, afterMeetings: s.afterMeetings !== false, afterLong: s.afterLong !== false, stones: stones.length ? stones : ALL_STONES },
    log,
    recent,
  };
}

export const landingsFile = persisted<LandingsFile>('addon-landings', migrateLandings(null), migrateLandings);

/** Minutes kept after draining blocks while the addon is on, else 0. */
export function landingBuffer(): number {
  return isOn('landings') ? landingsFile.value.settings.buffer : 0;
}

/** Busy blocks with room to land after meetings and long stretches (for planning only). */
export function landingPad<T extends Block>(blocks: T[]): T[] {
  return withLandings(blocks, landingBuffer(), (b) => drainOf(b) !== null);
}
