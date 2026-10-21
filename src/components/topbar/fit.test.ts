import { describe, expect, it } from 'vitest';
import { BAR, fitBar, weekWidth, type FitInput, type FitItem } from './fit';

const icon = (id: string, priority: number, group = 'do'): FitItem => ({ id, priority, width: 34, group });

const ITEMS: FitItem[] = [
  icon('ask', 80, 'do'),
  icon('backlog', 76, 'do'),
  icon('focus', 78, 'do'),
  icon('insights', 56, 'see'),
  icon('theme', 38, 'see'),
  icon('addon:work', 30.02, 'addons'),
  icon('addon:alef', 30.01, 'addons'),
  icon('addons', 20, 'app'),
  icon('widget', 46, 'app'),
  icon('settings', 70, 'app'),
];

function input(row: number, extra: Partial<FitInput> = {}): FitInput {
  return {
    row,
    row2: row,
    date: { clock: 62, rel: 46, long: 150, short: 92 },
    zone: { full: 112, compact: 40 },
    week: { today: 66 },
    items: ITEMS,
    more: 34,
    ...extra,
  };
}

describe('fitBar', () => {
  it('keeps everything out on a wide window', () => {
    const r = fitBar(input(1600));
    expect(r.date).toBe('long');
    expect(r.zone).toBe('full');
    expect(r.week).toBe('inline');
    expect(r.folded).toEqual([]);
    expect(r.used).toBeLessThanOrEqual(1600);
  });

  it('shows everything until it has measured', () => {
    const r = fitBar(input(0));
    expect(r.folded).toEqual([]);
    expect(r.date).toBe('long');
  });

  it('never uses more than the row, at any width', () => {
    for (let w = 260; w <= 1600; w += 7) {
      const r = fitBar(input(w));
      expect(r.used, `at ${w}px`).toBeLessThanOrEqual(w + 0.5);
    }
  });

  it('shortens the date before anything folds', () => {
    const full = fitBar(input(1600)).used;
    const r = fitBar(input(full - 20));
    expect(r.date).toBe('short');
    expect(r.folded).toEqual([]);
    expect(r.week).toBe('inline');
  });

  it('lets the Today button go before the week leaves the row', () => {
    const full = fitBar(input(1600)).used;
    const r = fitBar(input(full - 60 - 70));
    expect(r.week).toBe('inline');
    expect(r.weekToday).toBe(false);
    expect(r.date).toBe('short');
    expect(r.folded).toEqual([]);
  });

  it('drops the week to its own row, then brings back what that made room for', () => {
    const r = fitBar(input(900));
    expect(r.week).toBe('below');
    // The gallery folded on the way down, but row one has room for it once the week moved.
    expect(r.folded).toEqual([]);
    expect(r.date).toBe('long');
  });

  it('folds the lowest priority first, and equal ones from the right', () => {
    const order: string[] = [];
    for (let w = 1600; w >= 300; w -= 2) {
      for (const id of fitBar(input(w)).folded) if (!order.includes(id)) order.push(id);
    }
    expect(order.slice(0, 4)).toEqual(['addons', 'addon:alef', 'addon:work', 'theme']);
    const same = [icon('a', 50), icon('b', 50), icon('c', 50)];
    const r = fitBar(input(140, { items: same, date: null, zone: null, week: null }));
    expect(r.shown).toEqual(['a', 'b']);
  });

  it('brings items back in order as the window widens', () => {
    let prev = fitBar(input(300));
    for (let w = 304; w <= 1600; w += 4) {
      const r = fitBar(input(w));
      // While the rest of the bar holds still, a wider window only ever adds items.
      if (r.week === prev.week && r.date === prev.date && r.zone === prev.zone) {
        for (const id of prev.shown) expect(r.shown, `${id} at ${w}px`).toContain(id);
      }
      prev = r;
    }
  });

  it('keeps the bar order for what stays', () => {
    const r = fitBar(input(640));
    const order = ITEMS.map((i) => i.id).filter((id) => r.shown.includes(id));
    expect(r.shown).toEqual(order);
  });

  it('keeps the status pills longest', () => {
    const items = [{ id: 'session', priority: 99, width: 170, group: 'now' }, ...ITEMS];
    const r = fitBar(input(360, { items }));
    expect(r.shown).toContain('session');
    expect(r.zone).not.toBe('full');
    expect(r.date).toBe('clock');
  });

  it('counts the space between groups', () => {
    const two = [icon('a', 50, 'x'), icon('b', 50, 'y')];
    const r = fitBar(input(2000, { items: two, date: null, zone: null, week: null }));
    expect(r.used).toBe(BAR.gap + 34 + 34 + 2 * BAR.itemGap + BAR.groupGap + 34);
  });

  it('skips items that draw nothing (a calendar button with no calendars)', () => {
    const items = [{ id: 'calendars', priority: 66, width: 0, group: 'see' }, ...ITEMS];
    const a = fitBar(input(1600, { items })).used;
    const b = fitBar(input(1600)).used;
    expect(a).toBe(b);
  });

  it('sizes the week to its own row, dropping Today when tight', () => {
    const wide = fitBar(input(700, { row2: 760 }));
    expect(wide.week).toBe('below');
    expect(wide.chip).toBe(BAR.chip);
    expect(wide.weekToday).toBe(true);

    const narrow = fitBar(input(300, { row2: 352 }));
    expect(narrow.weekToday).toBe(false);
    expect(weekWidth(narrow.chip, 0)).toBeLessThanOrEqual(352);
    expect(narrow.chip).toBeGreaterThanOrEqual(BAR.chipMin);
  });

  it('hidden parts take no room', () => {
    const r = fitBar(input(1600, { date: null, zone: null, week: null }));
    expect(r.date).toBeNull();
    expect(r.zone).toBeNull();
    expect(r.week).toBeNull();
    expect(r.folded).toEqual([]);
  });

  it('is the same for the same numbers', () => {
    expect(fitBar(input(777))).toEqual(fitBar(input(777)));
  });
});
