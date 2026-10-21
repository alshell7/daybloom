import { describe, expect, it } from 'vitest';
import { parseSteps, splitPrompt } from './aiSplit';

describe('make it smaller: AI steps', () => {
  it('reads steps, finish lines and a tip; the first step is always two minutes', () => {
    const r = parseSteps('```json\n{"steps":[{"title":"Open the doc","minutes":5,"done_when":"doc open"},{"title":"Write three bullet points","minutes":10},{"title":"Fill in one","minutes":15}],"tip":"Close the inbox first."}\n```', 30);
    expect(r).toEqual({
      steps: [
        { title: 'Open the doc', minutes: 2, doneWhen: 'doc open' },
        { title: 'Write three bullet points', minutes: 10 },
        { title: 'Fill in one', minutes: 15 },
      ],
      tip: 'Close the inbox first.',
    });
  });

  it('fits steps into the time there is', () => {
    const r = parseSteps('{"steps":[{"title":"Start","minutes":2},{"title":"Middle","minutes":40},{"title":"End","minutes":40}]}', 30)!;
    expect(r.steps.reduce((a, s) => a + s.minutes, 0)).toBeLessThanOrEqual(32);
  });

  it('gives up on answers it cannot use', () => {
    expect(parseSteps('Sure! Here are some steps.', 30)).toBeNull();
    expect(parseSteps('{"steps":[{"title":"Only one"}]}', 30)).toBeNull();
    expect(parseSteps('{"steps": nope}', 30)).toBeNull();
  });

  it('tells the service the moment: time left, what is next, real lengths, existing steps', () => {
    const p = splitPrompt({ title: 'Write the grant report', notes: 'Section 3 only', minutes: 45, until: { minutes: 50, what: 'Team call' }, reality: 'this same task usually takes 140% of what is planned', existing: [{ title: 'Open the doc', done: true }], avoid: ['Open a page'] });
    expect(p.user).toContain('Section 3 only');
    expect(p.user).toContain('50 minutes, then "Team call"');
    expect(p.user).toContain('140%');
    expect(p.user).toContain('[done] Open the doc');
    expect(p.user).toContain('different approach');
    expect(p.system).toMatch(/add up to about 45/);
  });
});
