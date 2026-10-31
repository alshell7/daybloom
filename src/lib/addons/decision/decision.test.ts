import { describe, expect, it } from 'vitest';
import { readLine, ruleDestination, taskFor } from '../../jot';
import { mergeDecisionFiles, migrateDecision, MAX_EXAMPLES } from './file';
import { CAPTURE_QUESTIONS, interpretCapture, KINDS, WHEN, type Answer, type RuleHints } from './questions';

const none: RuleHints = { hasTime: false, day: null, later: false, someday: false, priority: null, energy: null, category: null };
/** Answers as TinyDecide shapes them, in CAPTURE_QUESTIONS order. */
function answers(o: { when?: [number, number]; urgent?: number; kind?: [number, number]; energy?: number } = {}): Answer[] {
  const pick = (i: number, p: number, n: number) => {
    const probs = Array.from({ length: n }, (_, k) => (k === i ? p : (1 - p) / (n - 1)));
    return { type: 'choice' as const, probs, pick: i, confidence: p };
  };
  return CAPTURE_QUESTIONS.map((q) => {
    if (q.id === 'when') return o.when ? pick(o.when[0], o.when[1], WHEN.length) : pick(1, 0.2, WHEN.length);
    if (q.id === 'urgent') return { type: 'noul', p: o.urgent ?? 0.1 };
    if (q.id === 'kind') return o.kind ? pick(o.kind[0], o.kind[1], KINDS.length) : pick(0, 0.2, KINDS.length);
    if (q.id === 'energy') return { type: 'score', probs: [0.3, 0.4, 0.3], pick: 1, confidence: 0.3, score: o.energy ?? 0.5 };
    return { type: 'span', text: '', p_present: 0 };
  });
}

describe('Decision: where a line goes', () => {
  it('written words win: a time puts it on the dial, "someday" in Someday', () => {
    expect(interpretCapture(answers({ when: [2, 0.9] }), { ...none, hasTime: true, day: 'today' }).dest).toBe('today');
    expect(interpretCapture(answers({ when: [0, 0.9] }), { ...none, someday: true }).dest).toBe('someday');
    expect(interpretCapture(answers({ when: [0, 0.9] }), { ...none, day: 'tomorrow' }).dest).toBe('tomorrow');
  });

  it('the model places what was only implied', () => {
    expect(interpretCapture(answers({ when: [2, 0.7] }), none)).toMatchObject({ dest: 'someday', why: 'Sounds like a someday idea' });
    expect(interpretCapture(answers({ when: [0, 0.6] }), none).dest).toBe('today');
    expect(interpretCapture(answers({ when: [1, 0.5] }), none).dest).toBe('next');
  });

  it('not sure: it waits in the Inbox — unless it sounds urgent (then today)', () => {
    expect(interpretCapture(answers({ when: [0, 0.36] }), none).dest).toBe('inbox');
    // A clear lead counts even when it isn't high.
    expect(interpretCapture(answers({ when: [0, 0.42] }), none).dest).toBe('today');
    const urgent = interpretCapture(answers({ when: [0, 0.36], urgent: 0.92 }), none);
    expect(urgent).toMatchObject({ dest: 'today', priority: 1, why: 'Sounds urgent, so today' });
  });

  it('kind and energy only when it is fairly sure, and never over the rules', () => {
    expect(interpretCapture(answers({ kind: [6, 0.7] }), none).category).toBe('move');
    expect(interpretCapture(answers({ kind: [6, 0.3] }), none).category).toBeNull();
    expect(interpretCapture(answers({ kind: [6, 0.9] }), { ...none, category: 'care' }).category).toBe('care');
    expect(interpretCapture(answers({ energy: 0.1 }), none).energy).toBe(1);
  });
});

describe('Jot lines', () => {
  const now = new Date(2026, 9, 31, 9, 0).getTime();
  const slot = () => ({ date: '2026-10-31', start: 600 });

  it('reads times, days, due dates and priorities with the rules', () => {
    expect(ruleDestination(readLine('gym 5pm', now)!)).toBe('today');
    // A time on a later day is still a block on the dial, on that day.
    expect(ruleDestination(readLine('dentist friday 3pm', now)!)).toBe('today');
    expect(taskFor(readLine('dentist friday 3pm', now)!, { dest: 'today', category: null, priority: null, energy: null }, now, slot, 0)).toMatchObject({ date: '2026-11-06', start: 15 * 60 });
    expect(ruleDestination(readLine('call mom tomorrow', now)!)).toBe('tomorrow');
    expect(ruleDestination(readLine('learn piano someday', now)!)).toBe('someday');
    expect(ruleDestination(readLine('pay rent by fri !!', now)!)).toBe('next');
    expect(ruleDestination(readLine('buy milk', now)!)).toBe('inbox');
    expect(readLine('pay rent by fri !!', now)!.hints.priority).toBe(1);
    expect(readLine('   ', now)).toBeNull();
  });

  it('becomes a block at its time, in the next free slot, or a backlog item', () => {
    const gym = taskFor(readLine('gym 5pm 45m', now)!, { dest: 'today', category: null, priority: null, energy: null }, now, slot, 0);
    expect(gym).toMatchObject({ title: 'Gym', date: '2026-10-31', start: 17 * 60, duration: 45 });
    const milk = taskFor(readLine('buy milk', now)!, { dest: 'today', category: null, priority: null, energy: null }, now, slot, 0);
    expect(milk).toMatchObject({ date: '2026-10-31', start: 600 });
    const rent = taskFor(readLine('pay rent by fri !!', now)!, { dest: 'next', category: null, priority: 1, energy: null }, now, slot, 0);
    expect(rent).toMatchObject({ title: 'Pay rent', date: null, start: null, list: 'next', priority: 1, due: '2026-11-06' });
  });
});

describe('Decision: what it learned, synced', () => {
  const ex = (id: string, at: number) => ({ id, k: 1, v: [0.1], z: [0.2], at });
  it('keeps both sides’ lessons, newest first out, and a forgotten one stays forgotten', () => {
    const base = migrateDecision({ examples: { when: [ex('a', 1)] } });
    const local = migrateDecision({ examples: { when: [ex('a', 1), ex('b', 2)] }, kept: 3 });
    const remote = migrateDecision({ examples: { when: [ex('c', 3)] }, kept: 5 });
    const m = mergeDecisionFiles(base, local, remote);
    expect(m.examples.when.map((e) => e.id)).toEqual(['b', 'c']);
    expect(m.kept).toBe(5);
    const many = migrateDecision({ examples: { when: Array.from({ length: 90 }, (_, i) => ex(`x${i}`, i)) } });
    expect(many.examples.when).toHaveLength(MAX_EXAMPLES);
  });
});

import { findings, placeByScores, minutesIn, matrixScore, MATRIX_QUESTIONS } from './questions';
import { readCapture } from './viaAi';

describe('Decision: what it pulls out of a line', () => {
  const span = (text: string, p = 0.9): Answer => ({ type: 'span', text, p_present: p });
  const by = (o: Record<string, Answer>) => new Map(Object.entries(o)) as Map<string, Answer | undefined>;
  it('a person who looks like one, a place, a length', () => {
    expect(findings('reply to Sarah about the contract', by({ person: span('Sarah') }))).toEqual({ person: 'Sarah' });
    expect(findings('call mom', by({ person: span('mom') }))).toEqual({ person: 'mom' });
    expect(findings('buy milk', by({ person: span('milk') }))).toEqual({});
    expect(findings('plan the trip to Lisbon', by({ place: span('Lisbon') }))).toEqual({ place: 'Lisbon' });
    expect(findings('report, takes about two hours', by({ length: span('2 hours') }))).toEqual({ minutes: 120 });
    expect(findings('x', by({ person: span('Sarah', 0.3) }))).toEqual({});
  });
  it('reads lengths', () => {
    expect(minutesIn('half an hour')).toBe(30);
    expect(minutesIn('45 min')).toBe(45);
    expect(minutesIn('1.5 hours')).toBe(90);
    expect(minutesIn('an hour')).toBe(60);
    expect(minutesIn('soon')).toBeNull();
  });
});

describe('Decision: the matrix, judged within your list', () => {
  const noul = (p: number): Answer => ({ type: 'noul', p });
  const s = (id: string, ps: number[], cat?: 'care' | 'rest') => matrixScore(id, ps.map(noul), cat);
  it('tells a list apart even when every score is modest', () => {
    const scores = [
      s('chest pain', [0.78, 0.26, 0.46, 0.5, 0.57]),
      s('passport', [0.46, 0.77, 0.06, 0.08, 0.58]),
      s('tap', [0.42, 0.1, 0.34, 0.39, 0.77]),
      s('dentist', [0.18, 0.04, 0.41, 0.1, 0.6], 'care'),
      s('documentary', [0.04, 0.03, 0.06, 0.07, 0.74], 'rest'),
      s('piano', [0.07, 0.02, 0.07, 0.09, 0.67]),
      s('milk', [0.05, 0.02, 0.25, 0.11, 0.49]),
    ];
    const by = Object.fromEntries(placeByScores(scores).map((p) => [p.taskId, p]));
    expect(by['chest pain']).toMatchObject({ urgent: true, important: true });
    expect(by.passport.urgent).toBe(true);
    expect(by.dentist.important).toBe(true);
    expect(by.documentary).toMatchObject({ urgent: false, important: false });
    expect(by.piano.urgent).toBe(false);
    expect(MATRIX_QUESTIONS).toHaveLength(5);
  });
});

describe('Decision with an AI service', () => {
  const none = { hasTime: false, day: null, later: false, someday: false, priority: null, energy: null, category: null } as const;
  it('reads its JSON, and plain words still win', () => {
    const s = readCapture('{"dest":"next","category":"social","priority":2,"energy":null,"minutes":30,"person":"Sarah","place":null,"why":"A reply this week"}', { ...none });
    expect(s).toMatchObject({ dest: 'next', category: 'social', priority: 2, found: { person: 'Sarah', minutes: 30 } });
    expect(readCapture('{"dest":"next","category":"focus"}', { ...none, someday: true })?.dest).toBe('someday');
    expect(readCapture('nonsense', { ...none })).toBeNull();
  });
});
