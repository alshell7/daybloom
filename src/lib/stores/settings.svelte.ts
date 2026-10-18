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
}

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
};

export const settings = persisted<Settings>('settings', DEFAULT_SETTINGS, (raw) => ({
  ...DEFAULT_SETTINGS,
  ...raw,
  widget: { ...DEFAULT_SETTINGS.widget, ...(raw?.widget ?? {}) },
  cycles: { ...DEFAULT_SETTINGS.cycles, ...(raw?.cycles ?? {}) },
  google: { ...DEFAULT_SETTINGS.google, ...(raw?.google ?? {}) },
}));
