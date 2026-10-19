import { describe, expect, it } from 'vitest';
import { dedupeEvents } from './calendarBridge.svelte';
import type { CalendarEvent } from './engine/types';

const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({
  id: Math.random().toString(36),
  provider: 'google',
  accountId: 'google:work',
  calendarId: 'c',
  title: 'Design review',
  startMs: 1000,
  endMs: 2000,
  allDay: false,
  ...p,
});

describe('events from several accounts', () => {
  it('merges the same meeting invited to two accounts, remembering both', () => {
    const out = dedupeEvents([ev({}), ev({ accountId: 'google:personal', title: '  design   REVIEW ' })]);
    expect(out).toHaveLength(1);
    expect(out[0].alsoIn).toEqual(['google:personal']);
  });
  it('keeps genuinely different events', () => {
    expect(dedupeEvents([ev({}), ev({ startMs: 1500 }), ev({ title: 'Standup' })])).toHaveLength(3);
  });
});
