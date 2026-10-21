// The app's ten themes and nine dial finishes (src/lib/themes.ts and src/lib/presets.ts),
// as data for the themes gallery. The page itself wears Fog (light) and Midnight (dark);
// their tokens live in styles.css so the first paint needs no script.

import type { CSSProperties } from 'react';
import { contrast, onColor } from './color';

export interface Finish {
  id: string;
  name: string;
  dark: boolean;
  face: string;
  bezel: string;
  track: string;
  rim: string;
  ink: string;
  signal: string;
  lume: string;
}

export const FINISHES: Record<string, Finish> = {
  glacier: { id: 'glacier', name: 'Glacier', dark: false, face: '#F7F8FA', bezel: '#E3E8EE', track: '#8F9AAA', rim: '#CBD3DC', ink: '#151C2A', signal: '#F2551D', lume: '#3FBF8A' },
  salmon: { id: 'salmon', name: 'Salmon', dark: false, face: '#F6C9B6', bezel: '#EDB39C', track: '#9A6A5C', rim: '#D99B84', ink: '#2B1A17', signal: '#1F3C8C', lume: '#2E8F6A' },
  mint: { id: 'mint', name: 'Mint', dark: false, face: '#CDEBDD', bezel: '#B6DFCB', track: '#5E8C78', rim: '#9CCFB7', ink: '#11281F', signal: '#E2482E', lume: '#1C7A55' },
  ink: { id: 'ink', name: 'Ink', dark: true, face: '#141B29', bezel: '#1D2637', track: '#5E6A7E', rim: '#2A3447', ink: '#E9EDF3', signal: '#FF7440', lume: '#8EF0C1' },
  onyx: { id: 'onyx', name: 'Onyx', dark: true, face: '#000000', bezel: '#111111', track: '#565656', rim: '#1c1c1c', ink: '#f2f2f2', signal: '#ff6a3d', lume: '#8ef0c1' },
  moss: { id: 'moss', name: 'Moss', dark: true, face: '#0f1f18', bezel: '#162a21', track: '#5d7a6a', rim: '#1f362b', ink: '#e6f2ea', signal: '#ffb13d', lume: '#b6f5c9' },
  plum: { id: 'plum', name: 'Plum', dark: true, face: '#1b1425', bezel: '#251b33', track: '#7a6a8c', rim: '#2f2442', ink: '#efe7f7', signal: '#ff8a5c', lume: '#c9b6ff' },
  slate: { id: 'slate', name: 'Slate', dark: true, face: '#3A4352', bezel: '#2E3644', track: '#8C97A8', rim: '#495366', ink: '#F1F3F6', signal: '#FFB13D', lume: '#A8F5CF' },
  tropic: { id: 'tropic', name: 'Tropic', dark: true, face: '#3B2618', bezel: '#2E1D12', track: '#A07F5F', rim: '#55392A', ink: '#F4E4CC', signal: '#F2C14E', lume: '#E9F59A' },
};

export type CategoryId = 'focus' | 'care' | 'routine' | 'people' | 'rest' | 'learn' | 'move';

export const CATEGORIES: Record<CategoryId, { label: string; light: string; dark: string }> = {
  focus: { label: 'Focus', light: '#3D6FE3', dark: '#7598FF' },
  care: { label: 'Care', light: '#25976A', dark: '#4FD39A' },
  routine: { label: 'Routine', light: '#D99A06', dark: '#FFC94A' },
  people: { label: 'People', light: '#DB4F94', dark: '#FF86BF' },
  rest: { label: 'Rest', light: '#8670E6', dark: '#B4A2FF' },
  learn: { label: 'Learn', light: '#138FA6', dark: '#4FD3E6' },
  move: { label: 'Move', light: '#EA6A2A', dark: '#FF9B5E' },
};

export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

export interface Theme {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  finish: string;
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
}

const t = (id: string, name: string, mode: 'light' | 'dark', finish: string, v: string): Theme => {
  const [ground, surface, raised, sunken, ink, ink2, ink3, signal, lume, focus] = v.split(' ');
  return { id, name, mode, finish, ground, surface, raised, sunken, ink, ink2, ink3, signal, lume, focus };
};

export const THEMES: Theme[] = [
  t('fog', 'Fog', 'light', 'glacier', '#eceff3 #f7f8fa #ffffff #e2e6ec #151c2a #485365 #5f6a7b #f2551d #2fae7b #3d6fe3'),
  t('linen', 'Linen', 'light', 'salmon', '#efe9e1 #f8f4ee #fffdf9 #e5ddd2 #241d17 #5a4d41 #6f6153 #d9481c #2c9d72 #3a63c9'),
  t('mist', 'Mist', 'light', 'glacier', '#ecebf4 #f6f5fb #ffffff #e0dfec #1d1a2e #4d4866 #625d7c #e8508a #2fae7b #6a55e0'),
  t('sage', 'Sage', 'light', 'mint', '#e7eee8 #f3f7f3 #ffffff #dbe5dc #14231a #3f5546 #55695b #e2482e #1f8f5f #2f7a5a'),
  t('midnight', 'Midnight', 'dark', 'ink', '#0d121c #131a27 #1a2232 #0a0e16 #e9edf3 #b0b9c7 #8f9aab #ff7440 #8ef0c1 #7598ff'),
  t('black', 'Black', 'dark', 'onyx', '#000000 #000000 #121212 #0b0b0b #f2f2f2 #b4b4b4 #8e8e8e #ff6a3d #8ef0c1 #7598ff'),
  t('graphite', 'Graphite', 'dark', 'slate', '#1b1d21 #212328 #2a2d33 #16181b #eceef1 #b7bcc4 #969ca6 #ffb13d #a8f5cf #8aa6ff'),
  t('forest', 'Forest', 'dark', 'moss', '#0b1712 #101f18 #172a21 #08120e #e6f2ea #acc4b5 #8aa595 #ffb13d #b6f5c9 #7fd1a8'),
  t('plum', 'Plum', 'dark', 'plum', '#130e1b #1a1324 #231a31 #0e0a14 #efe7f7 #bfb2d0 #9d90b0 #ff8a5c #c9b6ff #b39cff'),
  t('cocoa', 'Cocoa', 'dark', 'tropic', '#1a120c #211710 #2b1f16 #140e09 #f4e9dc #c9b6a0 #a8937c #f2c14e #e9f59a #f2c14e'),
];

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

/** Every CSS variable the desk, the dial and the blocks read, for one theme (scoped to a subtree). */
export function themeStyle(theme: Theme, finishId = theme.finish): CSSProperties {
  const f = FINISHES[finishId];
  const ink = hexToRgb(theme.ink);
  const vars: Record<string, string> = {
    '--ground': theme.ground,
    '--surface': theme.surface,
    '--raised': theme.raised,
    '--sunken': theme.sunken,
    '--ink': theme.ink,
    '--ink-2': theme.ink2,
    '--ink-3': theme.ink3,
    '--ink-inverse': theme.surface === '#000000' ? '#0b0b0b' : theme.surface,
    '--signal': theme.signal,
    '--lume': theme.lume,
    '--focus-ring': theme.focus,
    '--line': `rgb(${ink} / 0.09)`,
    '--line-strong': `rgb(${ink} / 0.16)`,
    ...finishVars(f),
  };
  return vars as CSSProperties;
}

/** The dial's own colours (face, bezel, ticks, hand, lume) and the block colours that suit it. */
export function finishVars(f: Finish): Record<string, string> {
  const out: Record<string, string> = {
    '--d-face': f.face,
    '--d-bezel': f.bezel,
    '--d-track': f.track,
    '--d-rim': f.rim,
    '--d-ink': f.ink,
    '--d-signal': f.signal,
    '--d-lume': f.lume,
    '--d-film': f.dark ? '0.1' : '0.06',
    '--d-depth': f.dark ? '0.05' : '0.5',
    '--d-done': f.dark ? '42%' : '50%',
    '--d-past': f.dark ? '60%' : '55%',
    '--d-lume-major': f.dark ? '0.5' : '0',
  };
  out['--d-glass'] = f.dark ? '0.28' : '0.2';
  out['--glass-ink'] = f.dark ? '#ffffff' : '#0b0f17';
  out['--d-sleep'] = f.dark ? 'color-mix(in srgb, var(--d-bezel), #000 35%)' : 'color-mix(in srgb, var(--d-bezel), var(--d-ink) 8%)';
  for (const id of CATEGORY_IDS) {
    const c = f.dark ? CATEGORIES[id].dark : CATEGORIES[id].light;
    out[`--c-${id}`] = c;
    out[`--on-${id}`] = onColor(c);
    out[`--text-on-${id}`] = contrast(c, '#ffffff') >= 4.5 ? '#ffffff' : '#0b0f17';
  }
  return out;
}
