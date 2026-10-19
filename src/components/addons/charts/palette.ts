// Chart colours for addon analytics: Daybloom's category hues in their fixed order, tuned
// so one set passes the categorical checks on both the light and the dark surface
// (lightness band, chroma, CVD separation ≥ 8, normal-vision floor, 3:1 contrast).
import type { CategoryId } from '../../../lib/engine/types';

export const CHART_ORDER: CategoryId[] = ['focus', 'care', 'routine', 'social', 'rest', 'learn', 'move'];

export const CHART_COLOR: Record<CategoryId, string> = {
  focus: '#3D6FE3',
  care: '#25976A',
  routine: '#B07E06',
  social: '#DB4F94',
  rest: '#8670E6',
  learn: '#138FA6',
  move: '#D65A20',
};

/** A project's colour: its category's chart hue, or the hex it was given. */
export function chartColor(c: string | undefined): string {
  if (!c) return CHART_COLOR.focus;
  return (CHART_COLOR as Record<string, string>)[c] ?? c;
}
