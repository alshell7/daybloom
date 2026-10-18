// Dial presets are watch "references": each one decides what span of time the
// dial covers and where 12 o'clock sits. Finishes are dial colourways.

import { HOUR, hourStartMs, isoOf, MINUTE, minutesOfDay, startOfDayMs } from './engine/time';
import type { ISODate } from './engine/types';

export type PresetId = 'field12' | 'gmt24' | 'timer60' | 'chrono';

export interface DialWindow {
  /** Time at angle 0° (12 o'clock). Angles grow clockwise. */
  originMs: number;
  /** Time covered by one full turn. */
  spanMs: number;
  /** Blocks overlapping [startMs, endMs) are drawn. */
  startMs: number;
  endMs: number;
}

export interface Preset {
  id: PresetId;
  name: string;
  /** Short line for the picker. */
  hint: string;
  numerals: { label: string; angle: number }[];
  /** Minor ticks per full turn (minute track). */
  ticks: number;
  /** Every Nth tick is major. */
  majorEvery: number;
  window(now: number, date: ISODate, isToday: boolean): DialWindow;
}

function numerals(labels: (string | number)[], offset = 0) {
  return labels.map((l, i) => ({ label: String(l), angle: offset + (i * 360) / labels.length }));
}

/** Midnight (active zone) of the day containing `ms`. */
function midnightOf(ms: number) {
  return startOfDayMs(isoOf(ms));
}

export const PRESETS: Record<PresetId, Preset> = {
  field12: {
    id: 'field12',
    name: '12 h',
    hint: 'The next 12 hours on a clock face',
    numerals: numerals([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    ticks: 60,
    majorEvery: 5,
    window(now, date, isToday) {
      // Anchor to clock positions: 12 o'clock is noon/midnight.
      const ref = isToday ? now : startOfDayMs(date) + 8 * HOUR;
      const mid = midnightOf(ref);
      const originMs = mid + (minutesOfDay(ref) >= 720 ? 12 * HOUR : 0);
      // One hour of just-passed time behind the hand, eleven ahead.
      return { originMs, spanMs: 12 * HOUR, startMs: ref - HOUR, endMs: ref + 11 * HOUR };
    },
  },
  gmt24: {
    id: 'gmt24',
    name: '24 h',
    hint: 'Your whole day, noon on top, night shaded',
    numerals: numerals([12, 14, 16, 18, 20, 22, 0, 2, 4, 6, 8, 10]),
    ticks: 96,
    majorEvery: 4,
    window(_now, date) {
      const day = startOfDayMs(date);
      return { originMs: day - 12 * HOUR, spanMs: 24 * HOUR, startMs: day, endMs: day + 24 * HOUR };
    },
  },
  timer60: {
    id: 'timer60',
    name: 'Hour',
    hint: 'The next hour as a shrinking wedge',
    numerals: numerals([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]),
    ticks: 60,
    majorEvery: 5,
    window(now) {
      // Minute positions of the wall clock: 12 o'clock is the top of the hour.
      return { originMs: hourStartMs(now), spanMs: HOUR, startMs: now - 2 * MINUTE, endMs: now + HOUR - 2 * MINUTE };
    },
  },
  chrono: {
    id: 'chrono',
    name: 'Cycles',
    hint: 'Focus rounds with built-in breaks',
    numerals: numerals([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]),
    ticks: 60,
    majorEvery: 5,
    window(now) {
      return { originMs: hourStartMs(now), spanMs: HOUR, startMs: now - 2 * MINUTE, endMs: now + HOUR - 2 * MINUTE };
    },
  },
};

export const PRESET_ORDER: PresetId[] = ['field12', 'gmt24', 'timer60', 'chrono'];

export type FinishId = 'auto' | 'glacier' | 'ink' | 'onyx' | 'salmon' | 'mint' | 'slate' | 'moss' | 'plum' | 'tropic';

export interface Finish {
  id: Exclude<FinishId, 'auto'>;
  name: string;
  dark: boolean;
  /** Dial face. */
  face: string;
  /** Outer bezel ring base. */
  bezel: string;
  /** Hour numerals, hands. */
  ink: string;
  /** Minute track ticks. */
  track: string;
  /** The "now" hand. */
  signal: string;
  /** Luminous tint for finished blocks. */
  lume: string;
  /** Case edge (widget). */
  rim: string;
}

export const FINISHES: Record<Finish['id'], Finish> = {
  glacier: {
    id: 'glacier',
    name: 'Glacier',
    dark: false,
    face: '#F7F8FA',
    bezel: '#E3E8EE',
    ink: '#151C2A',
    track: '#8F9AAA',
    signal: '#F2551D',
    lume: '#3FBF8A',
    rim: '#CBD3DC',
  },
  ink: {
    id: 'ink',
    name: 'Ink',
    dark: true,
    face: '#141B29',
    bezel: '#1D2637',
    ink: '#E9EDF3',
    track: '#5E6A7E',
    signal: '#FF7440',
    lume: '#8EF0C1',
    rim: '#2A3447',
  },
  onyx: {
    id: 'onyx',
    name: 'Onyx',
    dark: true,
    face: '#000000',
    bezel: '#111111',
    ink: '#f2f2f2',
    track: '#565656',
    signal: '#ff6a3d',
    lume: '#8ef0c1',
    rim: '#1c1c1c',
  },
  moss: {
    id: 'moss',
    name: 'Moss',
    dark: true,
    face: '#0f1f18',
    bezel: '#162a21',
    ink: '#e6f2ea',
    track: '#5d7a6a',
    signal: '#ffb13d',
    lume: '#b6f5c9',
    rim: '#1f362b',
  },
  plum: {
    id: 'plum',
    name: 'Plum',
    dark: true,
    face: '#1b1425',
    bezel: '#251b33',
    ink: '#efe7f7',
    track: '#7a6a8c',
    signal: '#ff8a5c',
    lume: '#c9b6ff',
    rim: '#2f2442',
  },
  salmon: {
    id: 'salmon',
    name: 'Salmon',
    dark: false,
    face: '#F6C9B6',
    bezel: '#EDB39C',
    ink: '#2B1A17',
    track: '#9A6A5C',
    signal: '#1F3C8C',
    lume: '#2E8F6A',
    rim: '#D99B84',
  },
  mint: {
    id: 'mint',
    name: 'Mint',
    dark: false,
    face: '#CDEBDD',
    bezel: '#B6DFCB',
    ink: '#11281F',
    track: '#5E8C78',
    signal: '#E2482E',
    lume: '#1C7A55',
    rim: '#9CCFB7',
  },
  slate: {
    id: 'slate',
    name: 'Slate',
    dark: true,
    face: '#3A4352',
    bezel: '#2E3644',
    ink: '#F1F3F6',
    track: '#8C97A8',
    signal: '#FFB13D',
    lume: '#A8F5CF',
    rim: '#495366',
  },
  tropic: {
    id: 'tropic',
    name: 'Tropic',
    dark: true,
    face: '#3B2618',
    bezel: '#2E1D12',
    ink: '#F4E4CC',
    track: '#A07F5F',
    signal: '#F2C14E',
    lume: '#E9F59A',
    rim: '#55392A',
  },
};

/** 'auto' means "match the app theme". */
export function resolveFinish(id: FinishId, theme: { finish: Exclude<FinishId, 'auto'> }): Finish {
  if (id === 'auto') return FINISHES[theme.finish];
  return FINISHES[id] ?? FINISHES[theme.finish];
}
