// Whole-app themes. Each one recolours every surface (the "desk") and pairs with a
// dial finish, so the planner, the widget and the dial always agree.

import type { FinishId } from './presets';

export type ThemeId =
  | 'fog'
  | 'linen'
  | 'mist'
  | 'sage'
  | 'midnight'
  | 'black'
  | 'graphite'
  | 'forest'
  | 'plum'
  | 'cocoa';

export interface Theme {
  id: ThemeId;
  name: string;
  mode: 'light' | 'dark';
  /** Dial finish used when the finish is set to "Match theme". */
  finish: Exclude<FinishId, 'auto'>;
  vars: {
    ground: string;
    surface: string;
    raised: string;
    sunken: string;
    ink: string;
    ink2: string;
    ink3: string;
    signal: string;
    lume: string;
    focus: string;
    line: string;
    lineStrong: string;
  };
}

export const THEMES: Theme[] = [
  // --- light ---
  {
    id: 'fog',
    name: 'Fog',
    mode: 'light',
    finish: 'glacier',
    vars: { ground: '#eceff3', surface: '#f7f8fa', raised: '#ffffff', sunken: '#e2e6ec', ink: '#151c2a', ink2: '#485365', ink3: '#5f6a7b', signal: '#f2551d', lume: '#2fae7b', focus: '#3d6fe3', line: 'rgb(21 28 42 / 0.09)', lineStrong: 'rgb(21 28 42 / 0.16)' },
  },
  {
    id: 'linen',
    name: 'Linen',
    mode: 'light',
    finish: 'salmon',
    vars: { ground: '#efe9e1', surface: '#f8f4ee', raised: '#fffdf9', sunken: '#e5ddd2', ink: '#241d17', ink2: '#5a4d41', ink3: '#6f6153', signal: '#d9481c', lume: '#2c9d72', focus: '#3a63c9', line: 'rgb(36 29 23 / 0.09)', lineStrong: 'rgb(36 29 23 / 0.17)' },
  },
  {
    id: 'mist',
    name: 'Mist',
    mode: 'light',
    finish: 'glacier',
    vars: { ground: '#ecebf4', surface: '#f6f5fb', raised: '#ffffff', sunken: '#e0dfec', ink: '#1d1a2e', ink2: '#4d4866', ink3: '#625d7c', signal: '#e8508a', lume: '#2fae7b', focus: '#6a55e0', line: 'rgb(29 26 46 / 0.09)', lineStrong: 'rgb(29 26 46 / 0.16)' },
  },
  {
    id: 'sage',
    name: 'Sage',
    mode: 'light',
    finish: 'mint',
    vars: { ground: '#e7eee8', surface: '#f3f7f3', raised: '#ffffff', sunken: '#dbe5dc', ink: '#14231a', ink2: '#3f5546', ink3: '#55695b', signal: '#e2482e', lume: '#1f8f5f', focus: '#2f7a5a', line: 'rgb(20 35 26 / 0.09)', lineStrong: 'rgb(20 35 26 / 0.16)' },
  },
  // --- dark ---
  {
    id: 'midnight',
    name: 'Midnight',
    mode: 'dark',
    finish: 'ink',
    vars: { ground: '#0d121c', surface: '#131a27', raised: '#1a2232', sunken: '#0a0e16', ink: '#e9edf3', ink2: '#b0b9c7', ink3: '#8f9aab', signal: '#ff7440', lume: '#8ef0c1', focus: '#7598ff', line: 'rgb(233 237 243 / 0.08)', lineStrong: 'rgb(233 237 243 / 0.15)' },
  },
  {
    id: 'black',
    name: 'Black',
    mode: 'dark',
    finish: 'onyx',
    vars: { ground: '#000000', surface: '#000000', raised: '#121212', sunken: '#0b0b0b', ink: '#f2f2f2', ink2: '#b4b4b4', ink3: '#8e8e8e', signal: '#ff6a3d', lume: '#8ef0c1', focus: '#7598ff', line: 'rgb(255 255 255 / 0.09)', lineStrong: 'rgb(255 255 255 / 0.17)' },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    mode: 'dark',
    finish: 'slate',
    vars: { ground: '#1b1d21', surface: '#212328', raised: '#2a2d33', sunken: '#16181b', ink: '#eceef1', ink2: '#b7bcc4', ink3: '#969ca6', signal: '#ffb13d', lume: '#a8f5cf', focus: '#8aa6ff', line: 'rgb(236 238 241 / 0.08)', lineStrong: 'rgb(236 238 241 / 0.15)' },
  },
  {
    id: 'forest',
    name: 'Forest',
    mode: 'dark',
    finish: 'moss',
    vars: { ground: '#0b1712', surface: '#101f18', raised: '#172a21', sunken: '#08120e', ink: '#e6f2ea', ink2: '#acc4b5', ink3: '#8aa595', signal: '#ffb13d', lume: '#b6f5c9', focus: '#7fd1a8', line: 'rgb(230 242 234 / 0.08)', lineStrong: 'rgb(230 242 234 / 0.15)' },
  },
  {
    id: 'plum',
    name: 'Plum',
    mode: 'dark',
    finish: 'plum',
    vars: { ground: '#130e1b', surface: '#1a1324', raised: '#231a31', sunken: '#0e0a14', ink: '#efe7f7', ink2: '#bfb2d0', ink3: '#9d90b0', signal: '#ff8a5c', lume: '#c9b6ff', focus: '#b39cff', line: 'rgb(239 231 247 / 0.08)', lineStrong: 'rgb(239 231 247 / 0.15)' },
  },
  {
    id: 'cocoa',
    name: 'Cocoa',
    mode: 'dark',
    finish: 'tropic',
    vars: { ground: '#1a120c', surface: '#211710', raised: '#2b1f16', sunken: '#140e09', ink: '#f4e9dc', ink2: '#c9b6a0', ink3: '#a8937c', signal: '#f2c14e', lume: '#e9f59a', focus: '#f2c14e', line: 'rgb(244 233 220 / 0.08)', lineStrong: 'rgb(244 233 220 / 0.15)' },
  },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<ThemeId, Theme>;

/** CSS for every theme, injected once at startup (one source of truth, here). */
export function themeCss(): string {
  return THEMES.map((t) => {
    const v = t.vars;
    return `:root[data-palette='${t.id}']{--ground:${v.ground};--surface:${v.surface};--raised:${v.raised};--sunken:${v.sunken};--ink:${v.ink};--ink-2:${v.ink2};--ink-3:${v.ink3};--ink-inverse:${v.surface === '#000000' ? '#0b0b0b' : v.surface};--signal:${v.signal};--lume:${v.lume};--focus-ring:${v.focus};--line:${v.line};--line-strong:${v.lineStrong};}`;
  }).join('\n');
}
