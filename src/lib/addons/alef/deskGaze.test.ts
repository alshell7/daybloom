import { describe, expect, it } from 'vitest';
import { lookToward } from './deskGaze.svelte';

describe('alef: looking across the desktop', () => {
  const face = { left: 100, top: 100, width: 100, height: 100 };
  it('looks toward a pointer outside its window, more the farther it is', () => {
    // The face's centre is at (150,150) page px; the window's page starts at (1000,500) on the desktop, 2× pixels.
    const right = lookToward({ x: 1000 + 300 + 2000, y: 500 + 300 }, { x: 1000, y: 500 }, face, 2)!;
    expect(right.x).toBeCloseTo(1, 1);
    expect(Math.abs(right.y)).toBeLessThan(0.05);
    const near = lookToward({ x: 1300 + 240, y: 800 }, { x: 1000, y: 500 }, face, 2)!;
    expect(near.x).toBeGreaterThan(0.2);
    expect(near.x).toBeLessThan(0.7);
    const up = lookToward({ x: 1300, y: 0 }, { x: 1000, y: 500 }, face, 2)!;
    expect(up.y).toBeLessThan(-0.5);
  });
  it('rests when the pointer is on the face', () => {
    expect(lookToward({ x: 1300, y: 800 }, { x: 1000, y: 500 }, face, 2)).toBeNull();
  });
});
