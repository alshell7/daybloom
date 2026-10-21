import { describe, expect, it } from 'vitest';
import { estimatePrompt, parseEstimate, parseTips, similar, tipsPrompt } from './aiReality';
import type { Sample } from './reality';

const s = (title: string, planned: number, actual: number, category: Sample['category'] = 'focus', at = 1): Sample => ({ id: `${title}@${at}`, taskId: title, title, category, icon: 'pen', planned, actual, source: 'focus', at });
const SAMPLES = [s('Write the report', 30, 45, 'focus', 1), s('Write the report', 30, 40, 'focus', 2), s('Report draft', 60, 75, 'focus', 3), s('Lunch', 40, 35, 'care', 4), s('Gym', 45, 60, 'move', 5)];

describe('reality check: AI estimates', () => {
  it('puts the most similar past blocks first', () => {
    expect(similar(SAMPLES, { title: 'Write the report', category: 'focus' }).map((x) => x.title)).toEqual(['Write the report', 'Write the report', 'Report draft']);
  });

  it('gives the service the task and its own record', () => {
    const p = estimatePrompt({ title: 'Write the report', notes: 'Section 3', minutes: 30, category: 'focus', samples: SAMPLES });
    expect(p.user).toContain('planned 30m → really 45m');
    expect(p.user).toContain('Section 3');
    expect(p.user).toMatch(/take \d+% of the planned time/);
  });

  it('reads a realistic length, rounded to 5, and refuses unkind words', () => {
    expect(parseEstimate('{"minutes":47,"confidence":"high","why":"Your report blocks run about 40% long.","tip":"Do the outline first."}')).toEqual({ minutes: 45, confidence: 'high', why: 'Your report blocks run about 40% long.', tip: 'Do the outline first.' });
    expect(parseEstimate('{"minutes":45,"why":"You always underestimate. You failed again."}')).toBeNull();
    expect(parseEstimate('{"minutes":2,"why":"short"}')).toBeNull();
    expect(parseEstimate('nope')).toBeNull();
  });
});

describe('reality check: AI tips', () => {
  const today = [{ key: 'task:a@2026-10-21', title: 'Reply to messages', start: '15:00', planned: 30, usual: 45 }];
  it('shows the record, today and repeating tasks', () => {
    const p = tipsPrompt({ samples: SAMPLES, today, freeMin: 40, recurring: ['Write the report'] });
    expect(p.user).toContain('Write the report: 30m → 43m');
    expect(p.user).toContain('task:a@2026-10-21');
    expect(p.user).toContain('Free time left today: 40 minutes.');
  });

  it('keeps only actions that point at real tasks and blocks', () => {
    const t = parseTips(
      JSON.stringify({
        headline: 'Lunch fits well.',
        tips: [
          { title: 'Give the report its real time', detail: 'It runs about 43 minutes, not 30.', action: { type: 'length', task: 'write the report', minutes: 43 } },
          { title: 'Lighten today', detail: 'Today has 15 minutes more than fits.', action: { type: 'tomorrow', key: 'task:a@2026-10-21' } },
          { title: 'A made-up one', detail: 'Moves a block that is not there.', action: { type: 'tomorrow', key: 'task:zzz@2026-10-21' } },
          { title: 'Fourth', detail: 'Too many tips.' },
        ],
      }),
      { keys: ['task:a@2026-10-21'], recurring: ['Write the report'] },
    )!;
    expect(t.headline).toBe('Lunch fits well.');
    expect(t.tips).toHaveLength(3);
    expect(t.tips[0].action).toEqual({ type: 'length', task: 'write the report', minutes: 45 });
    expect(t.tips[1].action).toEqual({ type: 'tomorrow', key: 'task:a@2026-10-21' });
    expect(t.tips[2].action).toBeUndefined();
  });

  it('drops tips that scold', () => {
    expect(parseTips('{"tips":[{"title":"You are behind","detail":"You failed to finish."}]}', { keys: [], recurring: [] })).toBeNull();
  });
});
