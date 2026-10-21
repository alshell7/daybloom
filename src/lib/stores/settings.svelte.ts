import type { Minutes } from '../engine/types';
import type { WidgetLayer } from '../platform';
import type { FinishId, PresetId } from '../presets';
import type { ThemeId } from '../themes';
import { persisted } from './persisted.svelte';

export interface Settings {
  preset: PresetId;
  finish: FinishId;
  theme: 'system' | 'light' | 'dark';
  /** Which preset each mode uses. */
  lightTheme: ThemeId;
  darkTheme: ThemeId;
  clock: 'auto' | '12' | '24';
  /** 'calm' trims spatial motion; 'system' follows prefers-reduced-motion. */
  motion: 'system' | 'full' | 'calm';
  sound: boolean;
  volume: number;
  /** Heads-up this many minutes before a block ends (0 = off). */
  headsUp: number;
  notify: boolean;
  /** Waking day — shaded on the GMT dial, used to size free time. */
  wake: Minutes;
  sleep: Minutes;
  showSeconds: boolean;
  font: 'lexend' | 'atkinson';
  launchAtLogin: boolean;
  /** macOS: show the countdown next to the menu-bar icon. */
  menuBarTimer: boolean;
  widget: {
    visible: boolean;
    layer: WidgetLayer;
    /** Its own dial face (`preset`); otherwise it shows the planner's. */
    own: boolean;
    preset: PresetId;
    /** 'auto' = the same finish as the planner. */
    finish: FinishId;
    /** Long words on the widget: titles slide, and Alef's replies and full titles open in a wing beside the dial. */
    wing: {
      /** Slide long titles along their line (off: they end with "…"). */
      marquee: boolean;
      /** Alef's replies show in a wing (off: in the bubble over the dial). */
      replies: boolean;
      /** Which side the wing opens on; 'auto' picks the side with room on the screen. */
      side: 'auto' | 'left' | 'right';
      /** 'auto' follows the dial's finish; or a dark or light glass. */
      style: 'auto' | 'dark' | 'light';
      /** The wing's width, in points. */
      width: number;
      /** Replies appear letter by letter. */
      typing: boolean;
      /** Letters a second for the typing (about 20–90). */
      speed: number;
    };
  };
  cycles: { focus: number; short: number; long: number; rounds: number };
  google: { clientId: string; clientSecret: string };
  onboarded: boolean;
  /** Last day the morning hello was shown. */
  lastGreeted: string;
  /** The version whose "what's new" was last offered (this computer). */
  seenVersion: string;
  /** IANA zone the whole app follows; '' = this computer's zone. */
  timeZone: string;
  recentZones: string[];
  /** Look for new versions in the background (installing always needs a tap). */
  autoUpdate: boolean;
  /** Proactive support. */
  nudges: {
    /** Ask "did you finish?" when a block ends unticked. */
    checkIn: boolean;
    /** Speak up when a block runs well past its end (hyperfocus guard). */
    overrun: boolean;
    /** Gentle time anchors so hours don't vanish. */
    anchors: 'off' | 'hourly' | 'half';
    /** Suggest something from the backlog that fits a free gap. */
    gapIdeas: boolean;
    /** Help me start: a tiny first step (2 or 5 minutes) for a block that hasn't started. */
    firstStep: boolean;
    /** Offer an end-of-day wind-down at this minute of the day (sleep − 60 by default; -1 = off). */
    windDown: number;
  };
  /** Voice input (Whistle). */
  voice: {
    /** Spoken language: 'auto' detects it; commands are understood in English. */
    language: VoiceLanguage;
    /** Soft tones when listening starts and stops. */
    chimes: boolean;
    /** Hold or tap V to talk. */
    hotkey: boolean;
  };
  /** Focus sessions (the launcher's memory). */
  focus: {
    /** Last length picked, in minutes. */
    minutes: number;
    rhythm: 'single' | 'cycles';
    /** Lengths offered as one-tap chips. */
    presets: number[];
    /** Open the full-screen focus view when a session starts. */
    fullscreen: boolean;
  };
  /** Screen cues around the edge of the display (this computer only). */
  screen: {
    /** Only during a focus session, or for every block that is running. */
    when: 'focus' | 'blocks';
    glow: boolean;
    glowStrength: 'soft' | 'medium' | 'strong';
    bar: boolean;
    barDock: 'top' | 'bottom' | 'left' | 'right';
    barSize: 'thin' | 'bold';
    hud: boolean;
    hudCorner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    /** 'task' follows the category colour of what's being timed; otherwise a fixed colour. */
    color: 'task' | string;
  };
  /** Privacy mode: Daybloom's windows are left out of screenshots and screen recordings. */
  privacy: {
    on: boolean;
    /** Also hide block names on the widget, HUD and menu bar. */
    hideNames: boolean;
  };
  /** Addons the user switched on. */
  addons: Record<string, boolean>;
  /** Other places' time beside your own (the active `timeZone` is the primary). */
  worldClock: {
    /** Up to two IANA zones to compare with. */
    zones: string[];
    /** Show their day and night as rings on the dial. */
    onDial: boolean;
  };
  /** The breathing guide on the dial. */
  breathe: {
    /** 'box': in, hold, out, rest — all the same length; 'calm': a longer out-breath (4·4·6·2). */
    pattern: 'box' | 'calm';
    /** Seconds per side of the box (3–6). */
    seconds: number;
    rounds: number;
    /** Sound: a soft real-sounding breath, gentle tones, or none. */
    sound: 'breath' | 'tones' | 'off';
  };
  /** The top bar: items you chose to hide (ids from TopBar.svelte). */
  topBar: { hidden: string[] };
  /** How a block set as an alarm rings. */
  alarm: {
    /** A tone id from lib/alarm.ts. */
    tone: string;
    volume: number;
    /** Minutes a snooze lasts. */
    snooze: number;
    /** Start soft and grow louder. */
    gentle: boolean;
    /** Stop ringing by itself after this many minutes. */
    ringFor: number;
  };
}

export type VoiceLanguage = 'auto' | 'en' | 'de' | 'fr' | 'es' | 'it' | 'nl' | 'pl';

export const DEFAULT_SETTINGS: Settings = {
  preset: 'field12',
  finish: 'auto',
  theme: 'system',
  lightTheme: 'fog',
  darkTheme: 'midnight',
  clock: 'auto',
  motion: 'system',
  sound: true,
  volume: 0.5,
  headsUp: 5,
  notify: true,
  wake: 7 * 60,
  sleep: 23 * 60,
  showSeconds: false,
  font: 'lexend',
  launchAtLogin: false,
  menuBarTimer: true,
  widget: { visible: false, layer: 'top', own: false, preset: 'field12', finish: 'auto', wing: { marquee: true, replies: true, side: 'auto', style: 'auto', width: 260, typing: true, speed: 45 } },
  cycles: { focus: 25, short: 5, long: 15, rounds: 4 },
  google: { clientId: '', clientSecret: '' },
  onboarded: false,
  lastGreeted: '',
  seenVersion: '',
  timeZone: '',
  recentZones: [],
  autoUpdate: true,
  nudges: { checkIn: true, overrun: true, anchors: 'off', gapIdeas: true, firstStep: true, windDown: 22 * 60 - 60 },
  voice: { language: 'en', chimes: true, hotkey: true },
  focus: { minutes: 25, rhythm: 'single', presets: [15, 25, 50, 90], fullscreen: true },
  screen: {
    when: 'focus',
    glow: false,
    glowStrength: 'medium',
    bar: false,
    barDock: 'top',
    barSize: 'thin',
    hud: false,
    hudCorner: 'top-right',
    color: 'task',
  },
  privacy: { on: false, hideNames: false },
  addons: {},
  worldClock: { zones: [], onDial: true },
  topBar: { hidden: [] },
  breathe: { pattern: 'box', seconds: 4, rounds: 4, sound: 'breath' },
  alarm: { tone: 'dawn', volume: 0.7, snooze: 5, gentle: true, ringFor: 3 },
};

export const settings = persisted<Settings>('settings', DEFAULT_SETTINGS, (raw) => ({
  ...DEFAULT_SETTINGS,
  ...raw,
  widget: {
    ...DEFAULT_SETTINGS.widget,
    ...(raw?.widget ?? {}),
    // Before `own`: a face picked apart from the planner's stays the widget's own.
    own: typeof raw?.widget?.own === 'boolean' ? raw.widget.own : !!raw?.widget?.preset && raw.widget.preset !== (raw?.preset ?? DEFAULT_SETTINGS.preset),
    wing: { ...DEFAULT_SETTINGS.widget.wing, ...(raw?.widget?.wing ?? {}) },
  },
  cycles: { ...DEFAULT_SETTINGS.cycles, ...(raw?.cycles ?? {}) },
  google: { ...DEFAULT_SETTINGS.google, ...(raw?.google ?? {}) },
  nudges: { ...DEFAULT_SETTINGS.nudges, ...(raw?.nudges ?? {}) },
  voice: { ...DEFAULT_SETTINGS.voice, ...(raw?.voice ?? {}) },
  focus: { ...DEFAULT_SETTINGS.focus, ...(raw?.focus ?? {}) },
  screen: { ...DEFAULT_SETTINGS.screen, ...(raw?.screen ?? {}) },
  privacy: { ...DEFAULT_SETTINGS.privacy, ...(raw?.privacy ?? {}) },
  addons: { ...(raw?.addons && typeof raw.addons === 'object' ? raw.addons : {}) },
  worldClock: {
    ...DEFAULT_SETTINGS.worldClock,
    ...(raw?.worldClock ?? {}),
    zones: Array.isArray(raw?.worldClock?.zones) ? raw.worldClock.zones.filter((z: unknown): z is string => typeof z === 'string' && !!z).slice(0, 2) : [],
  },
  alarm: { ...DEFAULT_SETTINGS.alarm, ...(raw?.alarm ?? {}) },
  breathe: { ...DEFAULT_SETTINGS.breathe, ...(raw?.breathe ?? {}) },
  topBar: { hidden: Array.isArray(raw?.topBar?.hidden) ? raw.topBar.hidden.filter((x: unknown): x is string => typeof x === 'string').slice(0, 40) : [] },
}));
