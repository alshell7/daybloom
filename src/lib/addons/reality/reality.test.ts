import { describe, expect, it } from 'vitest';
import { estimate, kindKey, ratioWords, suggest, summarize, tickMinutes, type Sample } from './reality';

let n = 0;
const s = (title: string, planned: number, actual: number, o: Partial<Sample> = {}): Sample => ({
  id: `t${++n}@2026-10-${10 + (n % 10)}`,
  taskId: `t${n}`,
  title,
  category: 'focus',
  icon: 'pen',
  planned,
  actual,
  source: 'focus',
  at: n,
  ...o,
});

describe('reality check', () => {
  it('treats the same task written differently as one kind', () => {
    expect(kindKey('Write report #3')).toBe(kindKey('write report'));
    expect(kindKey('  Écrire le rapport! ')).toBe('écrire le rapport');
  });

  it('learns from the same task first, then the category, then everything', () => {
    const samples = [s('Write report', 30, 45), s('Write report', 30, 40), s('Gym', 60, 60, { category: 'move' })];
    const est = estimate(samples, { title: 'write report', category: 'focus' })!;
    expect(est.scope).toBe('title');
    expect(est.ratio).toBeCloseTo((45 / 30 + 40 / 30) / 2);
    expect(estimate(samples, { title: 'Something new', category: 'focus' })).toBeNull();
    const more = [...samples, s('Read', 20, 30), s('Plan', 20, 26)];
    expect(estimate(more, { title: 'Something new', category: 'focus' })?.scope).toBe('category');
  });

  it('trusts measured time over tick timing when it has enough', () => {
    const samples = [s('Email', 20, 60, { source: 'tick' }), s('Email', 20, 24), s('Email', 20, 26)];
    expect(estimate(samples, { title: 'Email', category: 'focus' })!.ratio).toBeCloseTo(1.25);
  });

  it('suggests what the same task typically takes, so taking it settles it', () => {
    const est = { ratio: 1.5, n: 4, scope: 'title' as const, label: 'x', typical: 46 };
    expect(suggest(30, est)).toBe(45);
    expect(suggest(45, est)).toBeNull();
  });

  it('suggests a rounded length only when the plan is clearly off', () => {
    expect(suggest(30, { ratio: 1.5, n: 4, scope: 'title', label: 'x' })).toBe(45);
    expect(suggest(30, { ratio: 1.1, n: 4, scope: 'title', label: 'x' })).toBeNull();
    expect(suggest(60, { ratio: 0.7, n: 4, scope: 'title', label: 'x' })).toBe(40);
    expect(suggest(30, null)).toBeNull();
  });

  it('summarizes kinds of task, most frequent first', () => {
    const sum = summarize([s('Write report', 30, 45), s('Write report', 30, 45), s('Write report', 30, 50), s('Gym', 60, 55, { category: 'move' }), s('Gym', 60, 65, { category: 'move' }), s('Once', 10, 10)]);
    expect(sum.n).toBe(6);
    expect(sum.byTitle.map((g) => g.label)).toEqual(['Write report', 'Gym']);
    expect(sum.byTitle[0]).toMatchObject({ planned: 30, actual: 45, n: 3 });
    expect(sum.byCategory[0].key).toBe('focus');
  });

  it('says it kindly', () => {
    expect(ratioWords(1.32).headline).toBe('Things take about 1.3× what you plan');
    expect(ratioWords(1.05).tone).toBe('fits');
    expect(ratioWords(0.7).tone).toBe('shorter');
  });

  it('only believes tick timing that looks real', () => {
    const start = 0;
    expect(tickMinutes(start, 30, 40 * 60_000)).toBe(40);
    expect(tickMinutes(start, 30, 2 * 60_000)).toBeNull();
    expect(tickMinutes(start, 30, 5 * 3_600_000)).toBeNull();
  });
});
