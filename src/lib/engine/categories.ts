import type { CategoryId } from './types';

export interface Category {
  id: CategoryId;
  label: string;
  /** Bezel-insert colour on light dials. */
  light: string;
  /** Lifted variant for dark dials. */
  dark: string;
  /** Default icon when creating a block in this category. */
  icon: string;
}

// Seven bezel-insert colours, spaced around the hue wheel and separated in lightness
// so neighbours stay distinct for common colour-vision differences. Colour is never
// the only signal: every block also carries an icon and a label.
export const CATEGORIES: Category[] = [
  { id: 'focus', label: 'Focus', light: '#3D6FE3', dark: '#7598FF', icon: 'laptop' },
  { id: 'care', label: 'Care', light: '#25976A', dark: '#4FD39A', icon: 'pill' },
  { id: 'routine', label: 'Routine', light: '#D99A06', dark: '#FFC94A', icon: 'house' },
  { id: 'social', label: 'People', light: '#DB4F94', dark: '#FF86BF', icon: 'users' },
  { id: 'rest', label: 'Rest', light: '#8670E6', dark: '#B4A2FF', icon: 'moon' },
  { id: 'learn', label: 'Learn', light: '#138FA6', dark: '#4FD3E6', icon: 'book-open' },
  { id: 'move', label: 'Move', light: '#EA6A2A', dark: '#FF9B5E', icon: 'footprints' },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, Category>;

export function categoryColor(id: CategoryId, dark = false): string {
  const c = CATEGORY_BY_ID[id] ?? CATEGORY_BY_ID.focus;
  return dark ? c.dark : c.light;
}

/** Relative luminance (WCAG) of a #rrggbb colour. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Ink or white — whichever reads better on the given fill. */
export function onColor(hex: string): string {
  const L = luminance(hex);
  const contrastWhite = 1.05 / (L + 0.05);
  const contrastInk = (L + 0.05) / (0.012 + 0.05);
  return contrastWhite >= contrastInk * 0.62 ? '#FFFFFF' : '#141B29';
}

/** WCAG contrast ratio of two hex colours (1..21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * An ink in the hue of `tint` that reads on `bg`: the least-mixed deep or light shade that
 * reaches 4.5:1 (so it keeps as much colour as it can), else the one with the most contrast.
 */
export function inkOn(bg: string, tint: string): string {
  const shades: string[] = [];
  for (const t of [0.35, 0.5, 0.62, 0.74, 0.86]) shades.push(mix(tint, '#0b0f17', t), mix(tint, '#ffffff', t));
  const ok = shades.find((c) => contrast(c, bg) >= 4.5);
  return ok ?? shades.reduce((a, c) => (contrast(c, bg) > contrast(a, bg) ? c : a));
}

/** Mix a hex colour toward another (0..1). */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1, 7), 16);
  const pb = parseInt(b.slice(1, 7), 16);
  const ch = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Nearest Daybloom category for an arbitrary provider colour (keeps calendar events on-palette). */
export function nearestCategory(hex: string): CategoryId {
  const n = parseInt(hex.slice(1, 7), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let best: CategoryId = 'focus';
  let bestD = Infinity;
  for (const c of CATEGORIES) {
    const m = parseInt(c.light.slice(1), 16);
    const d = [(m >> 16) & 255, (m >> 8) & 255, m & 255].reduce((s, v, i) => s + (v - rgb[i]) ** 2, 0);
    if (d < bestD) {
      bestD = d;
      best = c.id;
    }
  }
  return best;
}
