import { describe, expect, it } from 'vitest';
import type { Block } from '../../engine/types';
import { drainOf, handoffs, headline, pickStones, withLandings } from './landings';

const M = 60_000;
let n = 0;
function b(p: Partial<Block> & { s: number; e: number }): Block {
  n++;
  return {
    key: p.key ?? `task:b${n}@2026-10-20`,
    kind: p.kind ?? 'task',
    date: '2026-10-20',
    title: p.title ?? `Block ${n}`,
    icon: p.icon ?? 'laptop',
    category: p.category ?? 'focus',
    color: '#000',
    startMs: p.s * M,
    endMs: p.e * M,
    floating: false,
    done: false,
    recurring: false,
    readOnly: p.kind === 'event',
    event: p.event,
  };
}
const ev = (extra: object = {}) => ({ id: 'x', provider: 'google' as const, accountId: 'a', calendarId: 'c', title: 't', startMs: 0, endMs: 0, allDay: false, ...extra });

describe('soft landings', () => {
  it('knows what drains', () => {
    expect(drainOf(b({ s: 0, e: 30, kind: 'event', event: ev({ meetUrl: 'https://meet.google.com/a' }) }))).toBe('meeting');
    expect(drainOf(b({ s: 0, e: 30, kind: 'event', event: ev({ attendees: [{ email: 'a' }, { email: 'b' }] }) }))).toBe('meeting');
    expect(drainOf(b({ s: 0, e: 30, title: 'Team sync', category: 'focus' }))).toBe('meeting');
    expect(drainOf(b({ s: 0, e: 30, title: 'Call mum', category: 'social', icon: 'phone' }))).toBe('meeting');
    expect(drainOf(b({ s: 0, e: 120, title: 'Deep work' }))).toBe('long');
    expect(drainOf(b({ s: 0, e: 30, title: 'Lunch', category: 'care' }))).toBeNull();
    expect(drainOf(b({ s: 0, e: 15, kind: 'event', title: 'Asr', event: ev({ provider: 'salah' }) }))).toBeNull();
  });

  it('finds back-to-back hand-offs, treating a run of meetings as one', () => {
    const day = [
      b({ s: 540, e: 570, title: 'Stand-up', category: 'focus' }),
      b({ s: 570, e: 600, kind: 'event', title: 'Design review', event: ev({ meetUrl: 'https://zoom.us/j/1' }) }),
      b({ s: 600, e: 690, title: 'Deep work' }),
      b({ s: 720, e: 760, title: 'Lunch', category: 'care' }),
      b({ s: 900, e: 930, title: 'Client call', category: 'social', icon: 'phone' }),
      b({ s: 945, e: 975, title: 'Write the report' }),
    ];
    const h = handoffs(day, 10);
    expect(h.map((x) => [x.from.title, x.to.title, x.gapMin, x.needMin, x.run])).toEqual([['Design review', 'Deep work', 0, 10, 2]]);
    // A 15-minute buffer also catches the call → report (a 15-minute gap is enough; 20 isn't).
    expect(handoffs(day, 20).map((x) => x.from.title)).toEqual(['Design review', 'Client call']);
    expect(handoffs(day, 0)).toEqual([]);
  });

  it('keeps a landing in plans', () => {
    const out = withLandings([{ startMs: 0, endMs: 30 * M, m: true }, { startMs: 40 * M, endMs: 50 * M, m: false }], 10, (x) => x.m);
    expect(out.map((x) => x.endMs / M)).toEqual([40, 50]);
  });

  it('offers a body reset, a spark and a first step into what is next', () => {
    const s = pickStones({ next: { title: 'Write the report', category: 'focus' }, seed: 0 });
    expect(s.map((x) => x.kind)).toEqual(['body', 'spark', 'step']);
    expect(s[2].title).toMatch(/report/i);
    expect(s[2].minutes).toBe(2);
    // Rotates, avoids what was just offered, and respects your list and the hour.
    expect(pickStones({ seed: 1 })[0].id).not.toBe(pickStones({ seed: 0 })[0].id);
    expect(pickStones({ seed: 0, recent: ['breathe'] })[0].id).not.toBe('breathe');
    expect(pickStones({ seed: 0, allowed: ['water', 'song'] }).map((x) => x.id)).toEqual(['water', 'song']);
    expect(pickStones({ seed: 2, hour: 21 }).some((x) => x.id === 'tea')).toBe(false);
  });

  it('words the moment by what happened', () => {
    expect(headline(1, 'meeting')).toBe('Meeting done. Land softly.');
    expect(headline(3, 'meeting')).toBe('3 meetings in a row. Land softly.');
    expect(headline(1, 'long')).toMatch(/long stretch/);
  });
});
