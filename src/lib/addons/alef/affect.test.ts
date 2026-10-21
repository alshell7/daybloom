import { describe, expect, it } from 'vitest';
import { behaviorForEvent, coreOf, idleBehavior, impulse, moodTarget, settle, type Signals } from './affect';
import { BEHAVIORS, BEHAVIOR_IDS, BY_CORE, lengthOf } from './behaviors';

const base: Signals = { hour: 11, awake: true, doneRatio: null, openCheckIns: 0, overrunMin: 0, inFocus: false, idleMin: 0, streak: 0, nextInMin: null };

describe('alef: behaviours', () => {
  it('has 32 behaviours across the 8 core states', () => {
    expect(BEHAVIOR_IDS).toHaveLength(32);
    expect(Object.keys(BY_CORE).sort()).toEqual(['active', 'inactive', 'pleasant', 'pleasant-active', 'pleasant-inactive', 'unpleasant', 'unpleasant-active', 'unpleasant-inactive']);
    for (const id of BEHAVIOR_IDS) {
      const b = BEHAVIORS[id];
      expect(b.poses.length).toBeGreaterThan(0);
      expect(lengthOf(b)).toBeLessThan(7000);
    }
  });
});

describe('alef: affect', () => {
  it('maps valence and arousal to the 8 core states', () => {
    expect(coreOf({ v: 0.6, a: 0.6 })).toBe('pleasant-active');
    expect(coreOf({ v: -0.6, a: 0.6 })).toBe('unpleasant-active');
    expect(coreOf({ v: 0, a: 0.6 })).toBe('active');
    expect(coreOf({ v: 0.6, a: -0.6 })).toBe('pleasant-inactive');
    expect(coreOf({ v: -0.6, a: -0.6 })).toBe('unpleasant-inactive');
    expect(coreOf({ v: 0, a: -0.6 })).toBe('inactive');
    expect(coreOf({ v: 0.6, a: 0 })).toBe('pleasant');
    expect(coreOf({ v: -0.6, a: 0 })).toBe('unpleasant');
    expect(coreOf({ v: 0, a: 0 })).toBe('inactive');
  });

  it('feels the day: wins lift the mood; open check-ins make it attentive, never sad', () => {
    expect(moodTarget({ ...base, doneRatio: 1 }).v).toBeGreaterThan(0.4);
    const slipped = moodTarget({ ...base, doneRatio: 0.2, openCheckIns: 4, overrunMin: 30 });
    expect(slipped.v).toBeGreaterThan(0.1);
    expect(slipped.a).toBeGreaterThan(0.3);
    expect(moodTarget({ ...base, awake: false }).a).toBeLessThan(-0.6);
    expect(moodTarget({ ...base, idleMin: 40 }).a).toBeLessThan(-0.4);
  });

  it('never shows disappointment about your plans', () => {
    for (const ev of ['checkIn', 'missed', 'manyMissed', 'overrun', 'overdue', 'pushedAgain', 'ignored'] as const) {
      for (const x of [{ v: -0.9, a: 0.8 }, { v: 0, a: 0 }, { v: 0.9, a: -0.8 }]) {
        const b = behaviorForEvent(ev, impulse(x, ev));
        expect(['sad', 'miserable', 'disappointed', 'disgusted', 'glaring', 'angry', 'grumpy', 'afraid', 'frustrated']).not.toContain(b);
      }
      expect(impulse({ v: 0, a: 0 }, ev).v).toBeGreaterThanOrEqual(0);
    }
  });

  it('lets emotions fade back into the mood', () => {
    const hot = impulse({ v: 0, a: 0 }, 'allDone');
    expect(coreOf(hot)).toBe('pleasant-active');
    const later = settle(hot, { v: 0, a: 0 }, 120_000);
    expect(later.a).toBeLessThan(hot.a / 4);
    expect(later.v).toBeLessThan(hot.v);
    expect(later.v).toBeGreaterThan(0.3);
  });

  it('picks a performance for each event', () => {
    expect(behaviorForEvent('allDone', { v: 1, a: 1 })).toBe('victorious');
    expect(behaviorForEvent('done', { v: 0.8, a: 0.2 })).toBe('delighted');
    expect(behaviorForEvent('done', { v: 0.1, a: 0 })).toBe('pleased');
    expect(behaviorForEvent('thinking', { v: 0, a: 0 })).toBe('spinning');
    expect(behaviorForEvent('pokeTooMuch', { v: 0, a: 0 })).toBe('angry');
    expect(behaviorForEvent('manyMissed', { v: -0.8, a: 0 })).toBe('loving');
  });

  it('idles kindly: blinks and looks, gets sleepy, sleeps at night', () => {
    expect(['blinking', 'looking']).toContain(idleBehavior({ v: 0, a: 0 }, 0, { night: false, idleMin: 0 }));
    expect(idleBehavior({ v: 0, a: -0.5 }, 3, { night: false, idleMin: 30 })).toBe('sleepy');
    expect(idleBehavior({ v: 0, a: -0.8 }, 3, { night: true, idleMin: 20 })).toBe('sleeping');
  });
});
