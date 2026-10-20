import { describe, expect, it } from 'vitest';
import { atMinutes } from '../../engine/time';
import type { Task } from '../../engine/types';
import { analyse } from './retro';

let n = 0;
function task(p: Partial<Task>): Task {
  n++;
  return { id: p.id ?? `t${n}`, title: `Task ${n}`, icon: 'laptop', category: 'focus', date: '2026-10-13', start: 540, duration: 60, notes: '', subtasks: [], recurrence: null, completions: [], completedAt: {}, skips: [], overrides: {}, alerts: [], createdAt: 0, updatedAt: 0, ...p };
}
const week = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];
const NOW = atMinutes('2026-10-19', 12 * 60);

describe('retrospection', () => {
  it('counts kept, let go and open plans; finds bright spots and an afternoon dip', () => {
    const tasks: Task[] = [];
    for (const d of week) {
      // Mornings: done. Afternoons: mostly open.
      tasks.push(task({ date: d, start: 540, duration: 90, completions: [d] }));
      tasks.push(task({ date: d, start: 15 * 60, duration: 60, completions: d === week[0] ? [d] : [] }));
    }
    tasks.push(task({ date: week[4], start: 17 * 60, duration: 30, acks: [week[4]] }));
    const r = analyse({ tasks, events: [], from: '2026-10-13', to: '2026-10-19', nowMs: NOW, wake: 420, sleep: 1380, checkIns: false });
    expect(r.planned).toBe(11);
    expect(r.done).toBe(6);
    expect(r.letGo).toBe(1);
    expect(r.open).toBe(4);
    expect(r.kept).toBeCloseTo(0.6);
    expect(r.focusMin).toBe(5 * 90 + 60);
    expect(r.story.title).toBe('A steady week');
    expect(r.bright.map((b) => b.id)).toContain('focus');
    const ids = r.patterns.map((p) => p.id);
    expect(ids).toContain('afternoon');
    expect(ids).toContain('open');
    expect(r.patterns.find((p) => p.id === 'open')!.action?.do).toBe('checkins');
    expect(r.experiments.length).toBeGreaterThan(0);
  });

  it('sees meetings, underestimates and blocks that keep moving', () => {
    const t = task({ id: 'pass', title: 'Renew passport', date: '2026-10-16', start: 600, duration: 30 });
    const events = week.map((d, i) => ({ id: `m${i}`, provider: 'google' as const, accountId: 'a', calendarId: 'c', title: 'Planning', startMs: atMinutes(d, 600), endMs: atMinutes(d, 780), allDay: false, meetUrl: 'https://meet.google.com/a' }));
    const journal = [1, 2, 3, 4].map((k) => ({ at: atMinutes('2026-10-14', 600 + k), taskId: 'pass', title: 'Renew passport', kind: 'moved' as const }));
    const r = analyse({ tasks: [t], events, from: '2026-10-13', to: '2026-10-19', nowMs: NOW, wake: 420, sleep: 1380, journal, reality: { ratio: 1.5, byTitle: [{ label: 'Write', ratio: 1.8, n: 3 }] } });
    const ids = r.patterns.map((p) => p.id);
    expect(r.meetingMin).toBe(5 * 180);
    expect(ids).toEqual(expect.arrayContaining(['meetings', 'estimate', 'pushed']));
    expect(r.patterns.find((p) => p.id === 'pushed')!.action?.do).toBe('smaller:pass');
    expect(r.patterns.find((p) => p.id === 'meetings')!.action?.do).toBe('landings');
  });

  it('is gentle on an empty stretch', () => {
    const r = analyse({ tasks: [], events: [], from: '2026-10-13', to: '2026-10-19', nowMs: NOW, wake: 420, sleep: 1380 });
    expect(r.story.title).toBe('A quiet week');
    expect(r.patterns).toEqual([]);
    expect(r.story.text).toMatch(/starts here/);
  });
});
