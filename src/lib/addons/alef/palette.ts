// Alef's screen in the dial's own colours. With the dial's finish (the default), the screen
// is a soft, recessed well in the face's tone: on a light dial the eyes are inked in the
// finish's colours (like a friendly drawing), on a dark one they glow in its luminous tint.
// "OLED" keeps the classic black screen with glowing eyes. Pure.

import { mix } from '../../engine/categories';
import type { Finish } from '../../presets';

export type ScreenStyle = 'dial' | 'oled';

export interface ScreenPalette {
  /** The screen's fill: centre and edge of a soft radial gradient. */
  well: string;
  wellEdge: string;
  /** The ring around it. */
  bezel: string;
  /** Inner shading: dark at the top edge, light at the bottom (a recess). */
  shadeTop: string;
  shadeBottom: string;
  /** Text on the screen. */
  ink: string;
  ink2: string;
  chip: string;
  /** A glassy shine across the screen. */
  sheen: boolean;
  /** The eyes: colour, glow (0..1) and scanlines (0..1). */
  eye: string;
  glow: number;
  scan: number;
  dark: boolean;
}

/** Inked eyes that suit each light face (the finish's lume is green on all of them). */
const LIGHT_EYES: Partial<Record<Finish['id'], string>> = { glacier: '#2C6E9E', salmon: '#3A4FA0', mint: '#1F7A57' };

/** 'dial' as an eye colour follows the finish. */
export function eyeColorFor(finish: Finish, eyes: string, style: ScreenStyle): string {
  if (style === 'oled') return eyes === 'dial' ? '#5CE1E6' : eyes;
  const base = eyes === 'dial' ? (finish.dark ? finish.lume : (LIGHT_EYES[finish.id] ?? finish.lume)) : eyes;
  // On a light screen, the hue deepens toward the dial's ink so it reads like ink, not light.
  return finish.dark ? base : mix(base, finish.ink, 0.5);
}

export function screenPalette(finish: Finish, style: ScreenStyle, eyes: string, glare = true): ScreenPalette {
  const eye = eyeColorFor(finish, eyes, style);
  const sheen = glare;
  if (style === 'oled')
    return {
      well: '#111722',
      wellEdge: '#030406',
      bezel: finish.dark ? '#0b0e14' : '#1a1f28',
      shadeTop: 'rgba(0,0,0,0.5)',
      shadeBottom: 'rgba(255,255,255,0.07)',
      ink: '#eef4fb',
      ink2: 'rgba(220,230,242,0.62)',
      chip: 'rgba(255,255,255,0.09)',
      sheen,
      eye,
      glow: 1,
      scan: 0.13,
      dark: true,
    };
  if (finish.dark)
    return {
      well: mix(finish.face, '#000000', 0.18),
      wellEdge: mix(finish.face, '#000000', 0.42),
      bezel: mix(finish.bezel, finish.track, 0.3),
      shadeTop: 'rgba(0,0,0,0.4)',
      shadeBottom: 'rgba(255,255,255,0.06)',
      ink: finish.ink,
      ink2: mix(finish.ink, finish.face, 0.42),
      chip: mix(finish.ink, finish.face, 0.9),
      sheen,
      eye,
      glow: 0.85,
      scan: 0.08,
      dark: true,
    };
  return {
    well: mix(finish.face, '#ffffff', 0.35),
    wellEdge: mix(finish.face, finish.ink, 0.06),
    bezel: mix(finish.bezel, finish.track, 0.25),
    shadeTop: mix(finish.ink, finish.face, 0.84),
    shadeBottom: 'rgba(255,255,255,0.85)',
    ink: finish.ink,
    ink2: mix(finish.ink, finish.face, 0.45),
    chip: mix(finish.ink, finish.face, 0.92),
    sheen,
    eye,
    glow: 0,
    scan: 0,
    dark: false,
  };
}
