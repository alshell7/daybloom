import { describe, expect, it } from 'vitest';
import { genieShape } from './genie';

describe('genie', () => {
  it('is the whole panel when open, and pours into the button when gone', () => {
    const open = genieShape(0, 400, 600, 300, -20, 28);
    expect(open.points[0]).toEqual([0, 0]);
    expect(open.points.at(-1)).toEqual([400, 0]);
    expect(open.dy).toBeCloseTo(0);
    expect(open.sy).toBe(1);
    expect(open.origin).toBe('top');
    const gone = genieShape(1, 400, 600, 300, -20, 28);
    // Every point gathers at the button's centre, the shape slides up to it and fades.
    for (const [x] of gone.points) expect(Math.abs(x - 300)).toBeLessThanOrEqual(14);
    expect(gone.dy).toBe(-20);
    expect(gone.sy).toBeLessThan(0.1);
    expect(gone.opacity).toBeCloseTo(0);
  });

  it('slides over to a button off to the side, its tip staying inside the panel', () => {
    const gone = genieShape(1, 400, 600, -300, 100, 28);
    for (const [x] of gone.points) expect(x).toBeGreaterThanOrEqual(0);
    expect(gone.dx).toBeCloseTo(-300 - 14);
    expect(genieShape(0, 400, 600, -300, 100, 28).dx).toBeCloseTo(0);
  });

  it('narrows the edge nearest the button first', () => {
    const mid = genieShape(0.35, 400, 600, 300, -20, 28);
    const n = mid.points.length / 2;
    const near = mid.points[n] [0] - mid.points[n - 1][0];
    const widthAt = (i: number) => mid.points[mid.points.length - 1 - i][0] - mid.points[i][0];
    expect(widthAt(0)).toBeLessThan(widthAt(n - 1));
    expect(near).toBeGreaterThanOrEqual(0);
    // A button below the panel funnels from the bottom edge.
    expect(genieShape(0.5, 400, 600, 200, 700).origin).toBe('bottom');
  });
});
