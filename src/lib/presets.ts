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

export type FinishId =
  | 'auto'
  | 'glacier'
  | 'ink'
  | 'onyx'
  | 'salmon'
  | 'mint'
  | 'slate'
  | 'moss'
  | 'plum'
  | 'tropic'
  | 'ceramic'
  | 'lilac'
  | 'blossom'
  | 'sandstone'
  | 'azure'
  | 'champagne'
  | 'twilight'
  | 'lagoon'
  | 'copper'
  | 'sunray'
  | 'claret';

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
    lume: '#0F5A3E',
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
  ceramic: {
    id: 'ceramic',
    name: 'Ceramic',
    dark: false,
    face: '#F6F2EA',
    bezel: '#E9E3D7',
    ink: '#151311',
    track: '#9A9184',
    signal: '#D8461B',
    lume: '#2B9A6B',
    rim: '#D3CBBB',
  },
  lilac: {
    id: 'lilac',
    name: 'Lilac',
    dark: false,
    face: '#E8E1F3',
    bezel: '#DBD1EC',
    ink: '#221A33',
    track: '#8B7DA7',
    signal: '#D0481F',
    lume: '#23875F',
    rim: '#C6B9DF',
  },
  blossom: {
    id: 'blossom',
    name: 'Blossom',
    dark: false,
    face: '#F8E0E5',
    bezel: '#F1D2DA',
    ink: '#2D1720',
    track: '#A57886',
    signal: '#C73D1F',
    lume: '#22855D',
    rim: '#E0B8C3',
  },
  sandstone: {
    id: 'sandstone',
    name: 'Sandstone',
    dark: false,
    face: '#EDDFC5',
    bezel: '#E3D0AE',
    ink: '#291D11',
    track: '#97805F',
    signal: '#B03C16',
    lume: '#1E7350',
    rim: '#CFB78F',
  },
  azure: {
    id: 'azure',
    name: 'Azure',
    dark: false,
    face: '#DAE8F6',
    bezel: '#C6DAEF',
    ink: '#0E1B32',
    track: '#6F87A7',
    signal: '#D9491A',
    lume: '#1E875D',
    rim: '#ADC6E3',
  },
  champagne: {
    id: 'champagne',
    name: 'Champagne',
    dark: false,
    face: '#F0E6C8',
    bezel: '#E4D6AE',
    ink: '#272011',
    track: '#9F8C5F',
    signal: '#1E46A3',
    lume: '#24855B',
    rim: '#CFBD8C',
  },
  twilight: {
    id: 'twilight',
    name: 'Twilight',
    dark: true,
    face: '#211E3E',
    bezel: '#2A264D',
    ink: '#EEEAFB',
    track: '#7B75A8',
    signal: '#FF9466',
    lume: '#A3F2CD',
    rim: '#38336A',
  },
  lagoon: {
    id: 'lagoon',
    name: 'Lagoon',
    dark: true,
    face: '#0F2D33',
    bezel: '#14383F',
    ink: '#E4F3F2',
    track: '#5E8B8F',
    signal: '#FF7D5C',
    lume: '#B4F5BE',
    rim: '#1D4A51',
  },
  copper: {
    id: 'copper',
    name: 'Copper',
    dark: true,
    face: '#5A3423',
    bezel: '#352119',
    ink: '#F8EDE4',
    track: '#B08A74',
    signal: '#FFA04D',
    lume: '#A9F2C6',
    rim: '#7A4A30',
  },
  sunray: {
    id: 'sunray',
    name: 'Sunray',
    dark: true,
    face: '#1D3B76',
    bezel: '#162F5E',
    ink: '#F2F5FC',
    track: '#8098C7',
    signal: '#FFB547',
    lume: '#A9F5D2',
    rim: '#2B4C8A',
  },
  claret: {
    id: 'claret',
    name: 'Claret',
    dark: true,
    face: '#3A1622',
    bezel: '#2C1019',
    ink: '#F8E9ED',
    track: '#9C6A77',
    signal: '#FFBF66',
    lume: '#B6F2CF',
    rim: '#52202E',
  },
};

/** Finishes as the pickers show them: light, then dark, each in hue order. */
export const FINISH_ORDER: Finish['id'][] = [
  'ceramic', 'glacier', 'azure', 'lilac', 'blossom', 'salmon', 'sandstone', 'champagne', 'mint',
  'onyx', 'slate', 'ink', 'sunray', 'twilight', 'plum', 'claret', 'copper', 'tropic', 'moss', 'lagoon',
];

/** The light or the dark finishes, in picker order. */
export function finishesOf(dark: boolean): Finish[] {
  return FINISH_ORDER.map((id) => FINISHES[id]).filter((f) => f.dark === dark);
}

/** 'auto' means "match the app theme". */
export function resolveFinish(id: FinishId, theme: { finish: Exclude<FinishId, 'auto'> }): Finish {
  if (id === 'auto') return FINISHES[theme.finish];
  return FINISHES[id] ?? FINISHES[theme.finish];
}
