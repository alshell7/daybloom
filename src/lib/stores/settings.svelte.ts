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
    preset: PresetId;
    finish: FinishId;
  };
  cycles: { focus: number; short: number; long: number; rounds: number };
  google: { clientId: string; clientSecret: string };
  onboarded: boolean;
  /** Last day the morning hello was shown. */
  lastGreeted: string;
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
  widget: { visible: false, layer: 'top', preset: 'field12', finish: 'auto' },
  cycles: { focus: 25, short: 5, long: 15, rounds: 4 },
  google: { clientId: '', clientSecret: '' },
  onboarded: false,
  lastGreeted: '',
  timeZone: '',
  recentZones: [],
  autoUpdate: true,
  nudges: { checkIn: true, overrun: true, anchors: 'off', gapIdeas: true, windDown: 22 * 60 - 60 },
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
};

export const settings = persisted<Settings>('settings', DEFAULT_SETTINGS, (raw) => ({
  ...DEFAULT_SETTINGS,
  ...raw,
  widget: { ...DEFAULT_SETTINGS.widget, ...(raw?.widget ?? {}) },
  cycles: { ...DEFAULT_SETTINGS.cycles, ...(raw?.cycles ?? {}) },
  google: { ...DEFAULT_SETTINGS.google, ...(raw?.google ?? {}) },
  nudges: { ...DEFAULT_SETTINGS.nudges, ...(raw?.nudges ?? {}) },
  voice: { ...DEFAULT_SETTINGS.voice, ...(raw?.voice ?? {}) },
  focus: { ...DEFAULT_SETTINGS.focus, ...(raw?.focus ?? {}) },
  screen: { ...DEFAULT_SETTINGS.screen, ...(raw?.screen ?? {}) },
  privacy: { ...DEFAULT_SETTINGS.privacy, ...(raw?.privacy ?? {}) },
  addons: { ...(raw?.addons && typeof raw.addons === 'object' ? raw.addons : {}) },
}));
