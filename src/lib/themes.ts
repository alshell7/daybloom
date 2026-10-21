// Whole-app themes. Each one recolours every surface (the "desk") and pairs with a
// dial finish, so the planner, the widget and the dial always agree.

import type { FinishId } from './presets';

export type ThemeId =
  | 'fog'
  | 'linen'
  | 'mist'
  | 'sage'
  | 'dawn'
  | 'sakura'
  | 'sand'
  | 'sky'
  | 'lemon'
  | 'midnight'
  | 'black'
  | 'graphite'
  | 'forest'
  | 'plum'
  | 'cocoa'
  | 'dusk'
  | 'ocean'
  | 'ember'
  | 'cobalt'
  | 'bordeaux';

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
  // In hue order within each mode, as the gallery shows them.
  // --- light ---
  {
    id: 'fog',
    name: 'Fog',
    mode: 'light',
    finish: 'glacier',
    vars: { ground: '#eceff3', surface: '#f7f8fa', raised: '#ffffff', sunken: '#e2e6ec', ink: '#151c2a', ink2: '#485365', ink3: '#5c6778', signal: '#f2551d', lume: '#2fae7b', focus: '#3d6fe3', line: 'rgb(21 28 42 / 0.09)', lineStrong: 'rgb(21 28 42 / 0.16)' },
  },
  {
    id: 'sky',
    name: 'Sky',
    mode: 'light',
    finish: 'azure',
    vars: { ground: '#e2ebf6', surface: '#eff5fb', raised: '#ffffff', sunken: '#d6e1ee', ink: '#0f1d33', ink2: '#3b4c68', ink3: '#51627d', signal: '#e9531c', lume: '#279a6c', focus: '#2563d9', line: 'rgb(15 29 51 / 0.09)', lineStrong: 'rgb(15 29 51 / 0.16)' },
  },
  {
    id: 'mist',
    name: 'Mist',
    mode: 'light',
    finish: 'glacier',
    vars: { ground: '#ecebf4', surface: '#f6f5fb', raised: '#ffffff', sunken: '#e0dfec', ink: '#1d1a2e', ink2: '#4d4866', ink3: '#625d7c', signal: '#c8376f', lume: '#2fae7b', focus: '#6a55e0', line: 'rgb(29 26 46 / 0.09)', lineStrong: 'rgb(29 26 46 / 0.16)' },
  },
  {
    id: 'dawn',
    name: 'Dawn',
    mode: 'light',
    finish: 'lilac',
    vars: { ground: '#f3e9e5', surface: '#faf4f1', raised: '#fffcfa', sunken: '#eadfe0', ink: '#2a1f33', ink2: '#5c4e67', ink3: '#6c5e78', signal: '#e0502a', lume: '#2a9b6f', focus: '#7457d6', line: 'rgb(42 31 51 / 0.09)', lineStrong: 'rgb(42 31 51 / 0.16)' },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    mode: 'light',
    finish: 'blossom',
    vars: { ground: '#f5e8ec', surface: '#fbf3f5', raised: '#fffbfc', sunken: '#eddce2', ink: '#2c1a23', ink2: '#5f4651', ink3: '#745a66', signal: '#d7432a', lume: '#289a6e', focus: '#c0407a', line: 'rgb(44 26 35 / 0.09)', lineStrong: 'rgb(44 26 35 / 0.16)' },
  },
  {
    id: 'linen',
    name: 'Linen',
    mode: 'light',
    finish: 'salmon',
    vars: { ground: '#efe9e1', surface: '#f8f4ee', raised: '#fffdf9', sunken: '#e5ddd2', ink: '#241d17', ink2: '#5a4d41', ink3: '#6c5e50', signal: '#d9481c', lume: '#2c9d72', focus: '#3a63c9', line: 'rgb(36 29 23 / 0.09)', lineStrong: 'rgb(36 29 23 / 0.17)' },
  },
  {
    id: 'sand',
    name: 'Sand',
    mode: 'light',
    finish: 'sandstone',
    vars: { ground: '#ece1ca', surface: '#f6eedd', raised: '#fffaee', sunken: '#e2d4b9', ink: '#2a2015', ink2: '#5b4b36', ink3: '#6a5943', signal: '#c4451b', lume: '#2a8c61', focus: '#2f6cb3', line: 'rgb(42 32 21 / 0.1)', lineStrong: 'rgb(42 32 21 / 0.18)' },
  },
  {
    id: 'lemon',
    name: 'Lemon',
    mode: 'light',
    finish: 'champagne',
    vars: { ground: '#f1edd8', surface: '#f9f7e8', raised: '#fffef5', sunken: '#e6e1c5', ink: '#24220f', ink2: '#535036', ink3: '#66624a', signal: '#dc4f1d', lume: '#2a9164', focus: '#3a62c4', line: 'rgb(36 34 15 / 0.09)', lineStrong: 'rgb(36 34 15 / 0.17)' },
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
    id: 'midnight',
    name: 'Midnight',
    mode: 'dark',
    finish: 'ink',
    vars: { ground: '#0d121c', surface: '#131a27', raised: '#1a2232', sunken: '#0a0e16', ink: '#e9edf3', ink2: '#b0b9c7', ink3: '#8f9aab', signal: '#ff7440', lume: '#8ef0c1', focus: '#7598ff', line: 'rgb(233 237 243 / 0.08)', lineStrong: 'rgb(233 237 243 / 0.15)' },
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    mode: 'dark',
    finish: 'sunray',
    vars: { ground: '#0b1429', surface: '#101b36', raised: '#172443', sunken: '#070e1e', ink: '#e8eefb', ink2: '#afbcd9', ink3: '#8e9cbf', signal: '#ffb547', lume: '#9ff3cc', focus: '#8fb3ff', line: 'rgb(232 238 251 / 0.08)', lineStrong: 'rgb(232 238 251 / 0.15)' },
  },
  {
    id: 'dusk',
    name: 'Dusk',
    mode: 'dark',
    finish: 'twilight',
    vars: { ground: '#17142b', surface: '#1e1a37', raised: '#272343', sunken: '#100e20', ink: '#ece8f8', ink2: '#b9b2d4', ink3: '#9a92b8', signal: '#ff9466', lume: '#9df0c8', focus: '#a493ff', line: 'rgb(236 232 248 / 0.08)', lineStrong: 'rgb(236 232 248 / 0.15)' },
  },
  {
    id: 'plum',
    name: 'Plum',
    mode: 'dark',
    finish: 'plum',
    vars: { ground: '#130e1b', surface: '#1a1324', raised: '#231a31', sunken: '#0e0a14', ink: '#efe7f7', ink2: '#bfb2d0', ink3: '#9d90b0', signal: '#ff8a5c', lume: '#c9b6ff', focus: '#b39cff', line: 'rgb(239 231 247 / 0.08)', lineStrong: 'rgb(239 231 247 / 0.15)' },
  },
  {
    id: 'bordeaux',
    name: 'Bordeaux',
    mode: 'dark',
    finish: 'claret',
    vars: { ground: '#1d0e13', surface: '#25121a', raised: '#301a23', sunken: '#15090d', ink: '#f6e8ec', ink2: '#d0b3bd', ink3: '#b0919c', signal: '#ffbf66', lume: '#b2f2cc', focus: '#f39bb7', line: 'rgb(246 232 236 / 0.08)', lineStrong: 'rgb(246 232 236 / 0.15)' },
  },
  {
    id: 'cocoa',
    name: 'Cocoa',
    mode: 'dark',
    finish: 'tropic',
    vars: { ground: '#1a120c', surface: '#211710', raised: '#2b1f16', sunken: '#140e09', ink: '#f4e9dc', ink2: '#c9b6a0', ink3: '#a8937c', signal: '#f2c14e', lume: '#e9f59a', focus: '#f2c14e', line: 'rgb(244 233 220 / 0.08)', lineStrong: 'rgb(244 233 220 / 0.15)' },
  },
  {
    id: 'ember',
    name: 'Ember',
    mode: 'dark',
    finish: 'copper',
    vars: { ground: '#1a1715', surface: '#211d1a', raised: '#2b2622', sunken: '#131110', ink: '#f3ebe4', ink2: '#c5b7ac', ink3: '#a5968b', signal: '#ff8a4c', lume: '#a6f0c4', focus: '#f0b878', line: 'rgb(243 235 228 / 0.08)', lineStrong: 'rgb(243 235 228 / 0.15)' },
  },
  {
    id: 'forest',
    name: 'Forest',
    mode: 'dark',
    finish: 'moss',
    vars: { ground: '#0b1712', surface: '#101f18', raised: '#172a21', sunken: '#08120e', ink: '#e6f2ea', ink2: '#acc4b5', ink3: '#8aa595', signal: '#ffb13d', lume: '#b6f5c9', focus: '#7fd1a8', line: 'rgb(230 242 234 / 0.08)', lineStrong: 'rgb(230 242 234 / 0.15)' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    mode: 'dark',
    finish: 'lagoon',
    vars: { ground: '#09191d', surface: '#0d2227', raised: '#132c32', sunken: '#061215', ink: '#e2f1f1', ink2: '#a5c3c4', ink3: '#85a6a8', signal: '#ff7d5c', lume: '#b0f5c0', focus: '#62cbe6', line: 'rgb(226 241 241 / 0.08)', lineStrong: 'rgb(226 241 241 / 0.15)' },
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
