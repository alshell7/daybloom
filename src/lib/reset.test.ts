import { describe, expect, it } from 'vitest';
import { filesFor, PARTS } from './reset';

const ALL = ['tasks', 'trash', 'settings', 'layout', 'addon-alef', 'addon-waqt', 'addon-work', 'ai', 'calendars', 'calendar-cache', 'sync-config', 'sync-base-tasks', 'sync-d1-base-tasks', 'progress', 'event-states', 'odd-one'];

describe('reset', () => {
  it('clears only what each part names', () => {
    expect(filesFor(['blocks'], ALL)).toEqual(['tasks', 'trash', 'event-states', 'timer', 'nudges', 'alarms']);
    expect(filesFor(['addons'], ALL)).toEqual(['addon-alef', 'addon-waqt', 'addon-work']);
    expect(filesFor(['sync'], ALL)).toEqual(['sync-config', 'sync-d1-config', 'sync-base-tasks', 'sync-d1-base-tasks']);
    expect(filesFor(['models'], ALL)).toEqual([]);
  });
  it('everything means every saved file', () => {
    expect(filesFor([], ALL, true).sort()).toEqual([...ALL].sort());
  });
  it('says what every part clears', () => {
    for (const p of PARTS) expect(p.what.length).toBeGreaterThan(20);
  });
});
