import { describe, expect, it } from 'vitest';
import { makeSmaller, subjectOf, variantsOf } from './split';

describe('make it smaller', () => {
  it('starts every plan with a two-minute first step', () => {
    for (const t of ['Write the proposal', 'Call mom', 'Clean the kitchen', 'Fix the login bug', 'Something vague', 'Taxes']) {
      const steps = makeSmaller(t, { minutes: 60 });
      expect(steps.length).toBeGreaterThanOrEqual(3);
      expect(steps[0].minutes).toBe(2);
      for (const s of steps) expect(s.minutes).toBeGreaterThanOrEqual(1);
    }
  });

  it('fits the kind of task and uses its words', () => {
    expect(makeSmaller('Write the proposal')[0].title).toBe('Open a blank page for the proposal');
    expect(makeSmaller('Call the dentist').map((s) => s.title)).toContain('Write the one thing you need to ask');
    expect(makeSmaller('Fix the login bug')[0].title).toBe('Open the project and run it once');
    expect(makeSmaller('Do my taxes')[0].title).toBe('Gather what you need: logins, papers');
  });

  it('shares the block’s time across the steps after the first', () => {
    const steps = makeSmaller('Write the report', { minutes: 60 });
    const total = steps.reduce((a, s) => a + s.minutes, 0);
    expect(total).toBeGreaterThanOrEqual(55);
    expect(total).toBeLessThanOrEqual(65);
  });

  it('offers another phrasing, cycling', () => {
    const n = variantsOf('Write the report');
    expect(n).toBeGreaterThan(1);
    expect(makeSmaller('Write the report', { variant: 1 })[0].title).not.toBe(makeSmaller('Write the report', { variant: 0 })[0].title);
    expect(makeSmaller('Write the report', { variant: n })).toEqual(makeSmaller('Write the report', { variant: 0 }));
  });

  it('falls back to the category, then to friendly generic steps', () => {
    expect(makeSmaller('Nap', { category: 'rest' })[0].title).toBe('Put your phone face down');
    expect(makeSmaller('Quarterly thing')[0].title).toContain('thing');
  });

  it('finds what a task is about', () => {
    expect(subjectOf('Write the proposal')).toBe('the proposal');
    expect(subjectOf('Reply to Sarah')).toBe('Sarah');
    expect(subjectOf('Write blog post')).toBe('blog post');
    expect(subjectOf('Taxes')).toBe('“Taxes”');
  });
});
