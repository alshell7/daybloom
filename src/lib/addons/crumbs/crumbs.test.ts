import { describe, expect, it } from 'vitest';
import { ago, migrateCrumbs, trim, type Crumb } from './crumbs.svelte';

const crumb = (taskId: string, at: number, text = 'note'): Crumb => ({ id: `${taskId}-${at}`, taskId, title: taskId, text, at, source: 'manual' });

describe('breadcrumbs', () => {
  it('keeps the newest notes of each task, oldest first', () => {
    const many = Array.from({ length: 25 }, (_, i) => crumb('a', i));
    const out = trim([...many, crumb('b', 3)]);
    expect(out.filter((c) => c.taskId === 'a')).toHaveLength(20);
    expect(out.filter((c) => c.taskId === 'a')[0].at).toBe(5);
    expect(out.find((c) => c.taskId === 'b')).toBeTruthy();
    expect(out.map((c) => c.at)).toEqual([...out.map((c) => c.at)].sort((x, y) => x - y));
  });

  it('says how long ago, kindly', () => {
    const now = new Date(2026, 9, 20, 12).getTime();
    expect(ago(now - 20_000, now)).toBe('just now');
    expect(ago(now - 12 * 60_000, now)).toBe('12 min ago');
    expect(ago(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(ago(now - 30 * 3_600_000, now)).toBe('yesterday');
    expect(ago(now - 4 * 86_400_000, now)).toBe('4 days ago');
    expect(ago(now - 40 * 86_400_000, now)).toMatch(/^on /);
  });

  it('repairs a damaged or old file', () => {
    expect(migrateCrumbs(null)).toEqual({ version: 1, crumbs: [], parked: [], settings: { askOnLeave: true, askOnStop: true } });
    const m = migrateCrumbs({
      crumbs: [crumb('a', 1), { id: 'x', taskId: 'a', text: '   ', at: 2 }, { nonsense: true }],
      parked: [{ id: 'p', text: 'call Sam', at: 3, from: 'Write' }, { id: 'q', text: '', at: 4 }],
      settings: { askOnStop: false },
    });
    expect(m.crumbs).toHaveLength(1);
    expect(m.parked).toEqual([{ id: 'p', text: 'call Sam', at: 3, from: 'Write' }]);
    expect(m.settings).toEqual({ askOnLeave: true, askOnStop: false });
  });
});
