import { describe, expect, it } from 'vitest';
import { chord, GAP, growFor, lineReach, MARQUEE_PASSES, marqueeLeg, marqueeRest, MARGIN, maxHeight, pickSide, typedLength, typingPlan, widthFor, wingPalette, wingShape } from './wing';

const dial = { cx: 140, cy: 140, r: 127 };

describe('pickSide', () => {
  it('auto takes the roomier side, the right on a tie', () => {
    expect(pickSide('auto', { left: 900, right: 300 }, 280).side).toBe('left');
    expect(pickSide('auto', { left: 200, right: 1200 }, 280).side).toBe('right');
    expect(pickSide('auto', { left: 500, right: 500 }, 280).side).toBe('right');
  });
  it('keeps a chosen side while it has room', () => {
    expect(pickSide('left', { left: 300, right: 1200 }, 280)).toEqual({ side: 'left', fit: 280 });
    expect(pickSide('right', { left: 1200, right: 280 }, 280).side).toBe('right');
  });
  it('flips a chosen side only when the other has room (or more of it)', () => {
    expect(pickSide('left', { left: 40, right: 900 }, 280)).toEqual({ side: 'right', fit: 280 });
    expect(pickSide('left', { left: 120, right: 200 }, 280)).toEqual({ side: 'right', fit: 200 });
    expect(pickSide('left', { left: 200, right: 120 }, 280)).toEqual({ side: 'left', fit: 200 });
  });
  it('never reports negative room', () => {
    expect(pickSide('auto', { left: -30, right: -10 }, 280).fit).toBe(0);
  });
});

describe('growFor / widthFor', () => {
  it('grows the window by the wing, its gap and margin', () => {
    // right: centre 140 + r 127 + gap + width + margin, past a 280 window
    expect(growFor(dial, 280, 'right', 260)).toBe(Math.ceil(140 + 127 + GAP + 260 + MARGIN - 280));
    expect(growFor(dial, 280, 'left', 260)).toBe(Math.ceil(127 + GAP + 260 + MARGIN - 140));
  });
  it('is the inverse of widthFor', () => {
    for (const side of ['left', 'right'] as const) {
      const g = growFor(dial, 280, side, 240);
      expect(widthFor(dial, 280, side, g)).toBe(240);
    }
  });
  it('never shrinks the window', () => {
    expect(growFor(dial, 1000, 'right', 100)).toBe(0);
  });
});

describe('wingShape', () => {
  it('sits beside the dial with its inner edge GAP from the case at the middle', () => {
    const s = wingShape(dial, 'right', 260, 120);
    const ri = dial.r + GAP;
    expect(s.ri).toBe(ri);
    // The box's right edge is the apex (cx + ri) plus the width.
    expect(s.box.left + s.box.width).toBeCloseTo(dial.cx + ri + 260, 5);
    expect(s.box.top).toBeCloseTo(dial.cy - 60, 5);
    expect(s.box.height).toBe(120);
    // Its corners reach back around the dial: the box starts left of the apex.
    expect(s.box.left).toBeLessThan(dial.cx + ri);
    expect(s.box.left).toBeGreaterThan(dial.cx);
    expect(s.centre).toEqual({ x: dial.cx - s.box.left, y: 60 });
  });
  it('mirrors on the left, the same distance from the dial', () => {
    const r = wingShape(dial, 'right', 220, 150);
    const l = wingShape(dial, 'left', 220, 150);
    expect(l.box.width).toBeCloseTo(r.box.width, 5);
    expect(l.box.left + l.box.width - dial.cx).toBeCloseTo(dial.cx - r.box.left, 5);
    expect(l.box.left).toBeCloseTo(dial.cx - dial.r - GAP - 220, 5);
    expect(l.centre.x).toBeCloseTo(l.box.width - r.centre.x + 0, 0);
  });
  it('draws a closed outline whose inner arc never crosses the case', () => {
    const s = wingShape(dial, 'right', 260, 200);
    expect(s.path.startsWith('M')).toBe(true);
    expect(s.path.endsWith('Z')).toBe(true);
    // Every point in the path is at least the case radius from the dial's centre.
    const nums = s.path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const pts: [number, number][] = [];
    // M, H, A(7), V, A(7), H, Q(4), A(7), Q(4): pick the coordinates we know are points.
    const p = s.path.split(/(?=[MHAVQZ])/);
    for (const seg of p) {
      const v = seg.slice(1).trim().split(/\s+/).map(Number);
      if (seg[0] === 'A') pts.push([v[5], v[6]]);
      if (seg[0] === 'Q') pts.push([v[2], v[3]]);
    }
    expect(nums.length).toBeGreaterThan(10);
    for (const [x, y] of pts) expect(Math.hypot(x - s.centre.x, y - s.centre.y)).toBeGreaterThanOrEqual(dial.r);
  });
  it('keeps the height inside the circle it hugs', () => {
    const s = wingShape(dial, 'right', 200, 5000);
    expect(s.height).toBeLessThan(2 * (dial.r + GAP));
  });
  it('limits the tallest wing to the window and ~110° of the case', () => {
    expect(maxHeight(127, 280)).toBeCloseTo(2 * 134 * 0.82, 5);
    expect(maxHeight(127, 200)).toBe(180);
    expect(maxHeight(10, 30)).toBe(46);
  });
});

describe('chord / lineReach', () => {
  it('measures a circle across', () => {
    expect(chord(10, 0)).toBe(20);
    expect(chord(10, 6)).toBe(16);
    expect(chord(10, 12)).toBe(0);
  });
  it('finds how near and far a line comes to the centre', () => {
    expect(lineReach(20, 36, 0)).toEqual({ near: 20, far: 36 });
    expect(lineReach(-36, -20, 0)).toEqual({ near: 20, far: 36 });
    expect(lineReach(-5, 10, 0)).toEqual({ near: 0, far: 10 });
  });
});

describe('marquee timing', () => {
  it('stays still when the words fit', () => {
    expect(marqueeLeg(0)).toBeNull();
    expect(marqueeLeg(0.5)).toBeNull();
    expect(marqueeLeg(-20)).toBeNull();
  });
  it('slides unhurried, and comes back quicker', () => {
    const leg = marqueeLeg(120)!;
    expect(leg.travel).toBe(120);
    expect(leg.there).toBeGreaterThanOrEqual(1600);
    expect(leg.there).toBeLessThanOrEqual(12_000);
    expect(leg.back).toBeLessThan(leg.there);
    // Very long titles keep a readable pace, up to a limit.
    expect(marqueeLeg(10_000)!.there).toBe(12_000);
  });
  it('rests at each end, longer after a few passes', () => {
    expect(marqueeRest(0, 'start')!).toBeLessThan(marqueeRest(1, 'start')!);
    expect(marqueeRest(5, 'start')!).toBeGreaterThan(marqueeRest(2, 'start')!);
    expect(marqueeRest(0, 'end')!).toBeGreaterThan(0);
  });
  it('settles at its start after a while', () => {
    expect(marqueeRest(MARQUEE_PASSES - 1, 'start')).not.toBeNull();
    expect(marqueeRest(MARQUEE_PASSES, 'start')).toBeNull();
  });
});

describe('typing', () => {
  it('shows letters at the given speed', () => {
    const plan = typingPlan('abcd', 50);
    expect(plan.at).toEqual([0, 20, 40, 60]);
    expect(typedLength(plan, -1)).toBe(0);
    expect(typedLength(plan, 0)).toBe(1);
    expect(typedLength(plan, 39)).toBe(2);
    expect(typedLength(plan, 1e9)).toBe(4);
  });
  it('breathes after a comma and longer after a sentence', () => {
    const plan = typingPlan('Hi, ok. Go', 100);
    const gap = (i: number) => plan.at[i + 1] - plan.at[i];
    expect(gap(0)).toBe(10); // H → i
    expect(gap(2)).toBeGreaterThan(gap(0)); // after the comma
    expect(gap(6)).toBeGreaterThan(gap(2)); // after the full stop
  });
  it('does not pause inside numbers', () => {
    const plan = typingPlan('3.5', 100);
    expect(plan.at).toEqual([0, 10, 20]);
  });
  it('keeps emoji and accents whole', () => {
    const plan = typingPlan('a👍🏽é', 10);
    expect(plan.end.at(-1)).toBe('a👍🏽é'.length);
    expect(plan.end.length).toBe(3);
  });
  it('handles empty text', () => {
    const plan = typingPlan('', 40);
    expect(plan.total).toBe(0);
    expect(typedLength(plan, 100)).toBe(0);
  });
});

describe('wingPalette', () => {
  const glacier = { face: '#F7F8FA', ink: '#151C2A', dark: false, lume: '#3FBF8A' };
  const inkFinish = { face: '#141B29', ink: '#E9EDF3', dark: true, lume: '#8EF0C1' };
  it('follows the finish on auto', () => {
    expect(wingPalette(glacier, 'auto').dark).toBe(false);
    expect(wingPalette(inkFinish, 'auto').dark).toBe(true);
    expect(wingPalette(glacier, 'auto').ink).toBe(glacier.ink);
  });
  it('turns a light finish dark with its own ink', () => {
    const p = wingPalette(glacier, 'dark');
    expect(p.dark).toBe(true);
    expect(p.ink).toBe(glacier.face);
    expect(p.near).toBeGreaterThan(p.far);
  });
  it('keeps the accent readable on the glass', () => {
    const p = wingPalette(glacier, 'auto', '#8EF0C1');
    // a pale mint on near-white glass is deepened toward the ink
    expect(p.accent).not.toBe('#8EF0C1');
    expect(wingPalette(inkFinish, 'auto', '#8EF0C1').accent).toBe('#8EF0C1');
  });
});
