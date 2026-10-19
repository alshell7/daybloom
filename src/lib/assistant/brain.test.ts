import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, atMinutes } from '../engine/time';
import type { Task } from '../engine/types';
import { clock } from '../stores/clock.svelte';
import { DEFAULT_SETTINGS, settings } from '../stores/settings.svelte';
import { taskFile } from '../stores/tasks.svelte';
import { view } from '../stores/view.svelte';
import {
  digits,
  dayIn,
  keywordScores,
  LOW_CONFIDENCE,
  NEEDLE_TOOLS,
  normalize,
  prep,
  refine,
  respond,
  route,
  SYSTEM,
  toDay,
  toMinutes,
  toRepeat,
  toTime,
  triggerTool,
} from './brain';
import { clearEmbeddings } from './match';
import { TOOL_SCHEMAS, TOOLS } from './tools';
import type { NeedleCall, NeedleEngine, NeedleResult } from './types';

// Monday 2026-10-19, 10:40 in whatever zone the tests run in.
const TODAY = '2026-10-19';
const TOMORROW = '2026-10-20';
const NOW = atMinutes(TODAY, 10 * 60 + 40);

let n = 0;
function task(p: Partial<Task>): Task {
  n++;
  return {
    id: p.id ?? `t${n}`,
    title: `Task ${n}`,
    icon: 'laptop',
    category: 'focus',
    date: TODAY,
    start: null,
    duration: 30,
    notes: '',
    subtasks: [],
    recurrence: null,
    completions: [],
    completedAt: {},
    skips: [],
    overrides: {},
    alerts: [],
    createdAt: NOW - n * 60_000,
    updatedAt: NOW,
    list: 'inbox',
    priority: null,
    due: null,
    energy: null,
    order: n,
    doneAt: null,
    acks: [],
    ...p,
  };
}

function seed() {
  taskFile.value.tasks = [
    task({ id: 'deep', title: 'Deep work', start: 615, duration: 75 }),
    task({ id: 'lunch', title: 'Lunch & water', icon: 'utensils', category: 'care', start: 720, duration: 40 }),
    task({ id: 'walk', title: 'Walk outside', icon: 'footprints', category: 'move', start: 810, duration: 25 }),
    task({ id: 'dentist', title: 'Book dentist', date: null, duration: 15 }),
  ];
}

beforeEach(() => {
  settings.value = { ...structuredClone(DEFAULT_SETTINGS), clock: '24' };
  clock.setOffset(NOW - Date.now());
  view.date = view.today;
  view.events = [];
  seed();
  clearEmbeddings();
});

// ── Fallback routing: no engine at all ────────────────────────────────────────

const PHRASES: [string, string][] = [
  ["What's now?", 'whats_now'],
  ['what should I be doing', 'whats_now'],
  ["whats next", 'whats_now'],
  ['how much time is left', 'whats_now'],
  ['what time is it', 'whats_now'],
  ['show me tomorrow', 'show_day'],
  ["what's on friday", 'show_day'],
  ['could you please show me what my day looks like', 'show_day'],
  ['tomorrow', 'show_day'],
  ["what's tomorrow", 'show_day'],
  ['what did I get done today', 'summarize_today'],
  ['how was my day', 'summarize_today'],
  ['add gym at 5pm for 45 minutes', 'create_block'],
  ['meds every day at 8am', 'create_block'],
  ['dentist tomorrow 10am', 'create_block'],
  ['remind me to call mum at 6pm', 'create_block'],
  ['remember to buy milk sometime', 'add_to_backlog'],
  ['put call the bank in my backlog', 'add_to_backlog'],
  ['I need to call the bank', 'add_to_backlog'],
  ['someday learn guitar', 'add_to_backlog'],
  ['show my backlog', 'show_backlog'],
  ['check my backlog', 'show_backlog'],
  ['find dentist', 'search_tasks'],
  ['do I have anything about taxes', 'search_tasks'],
  ['I finished lunch', 'complete_block'],
  ['lunch is done', 'complete_block'],
  ['took my meds', 'complete_block'],
  ['I had lunch', 'complete_block'],
  ['check off lunch', 'complete_block'],
  ['done', 'complete_block'],
  ['move lunch to 2pm', 'move_block'],
  ['push the walk to tomorrow', 'move_block'],
  ['move wind down to 9pm', 'move_block'],
  ['give me 15 more minutes', 'extend_block'],
  ['add 10 minutes to deep work', 'extend_block'],
  ['I need more time', 'extend_block'],
  ['give me 15 minutes', 'extend_block'],
  ['delete call a friend', 'delete_block'],
  ['cancel the walk', 'delete_block'],
  ['start a 25 minute focus', 'start_timer'],
  ['set a timer for 10 minutes', 'start_timer'],
  ['twenty five minute timer', 'start_timer'],
  ['I need a break', 'start_timer'],
  ['start 4 pomodoros', 'start_focus_cycles'],
  ['stop the timer', 'stop_timer'],
  ['cancel the timer', 'stop_timer'],
  ['plan my day', 'plan_my_day'],
  ['organise my day', 'plan_my_day'],
  ['when am I free tomorrow', 'find_free_time'],
  ['find me an hour this afternoon', 'find_free_time'],
  ['when do I have 30 minutes', 'find_free_time'],
  ['when is lunch', 'when_is'],
  ['how long until my walk', 'when_is'],
  ['when is wind down', 'when_is'],
  ['how was my week', 'week_review'],
  ['how am I doing', 'week_review'],
  ["how's my streak", 'streaks'],
  ['anything waiting for a check-in?', 'check_ins'],
  ['switch to the black theme', 'set_theme'],
  ['dark mode', 'set_theme'],
  ['use the 24 hour dial', 'set_dial'],
  ["I'm in Tokyo", 'set_timezone'],
  ['back to local time', 'set_timezone'],
  ['show the widget', 'toggle_widget'],
  ['I feel overwhelmed', 'breathe'],
  ['wind down', 'wind_down'],
  ["I'm done for today", 'wind_down'],
  ['what can you do', 'help'],
  ['get the laundry going around four', 'create_block'],
  ['pop the dentist into thursday morning', 'create_block'],
  ['squeeze in a run before dinner', 'create_block'],
  ['make lunch a bit later', 'move_block'],
  ['fit my saved stuff into today', 'plan_my_day'],
  ['is anything coming up soon', 'whats_now'],
  ['how did things go these last days', 'week_review'],
  ['turn everything black', 'set_theme'],
  ["i reckon i'm done with emails", 'complete_block'],
  ['how did things go', 'summarize_today'],
  ['shall we do some deep work', 'start_timer'],
  ['anything i forgot', 'check_ins'],
];

describe('fallback routing (no engine)', () => {
  it.each(PHRASES)('%s → %s', async (text, tool) => {
    const r = await route(text, null, NOW);
    expect(r.call?.tool).toBe(tool);
    expect(r.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE);
  });

  it('covers the cases the model got wrong', async () => {
    // Needle mapped these to start_timer / nothing / plan_my_day; the deterministic path doesn't.
    for (const [text, tool] of [
      ['add gym at 5pm for 45 minutes', 'create_block'],
      ['I finished lunch', 'complete_block'],
      ['remember to buy milk sometime', 'add_to_backlog'],
      ['meds every day at 8am', 'create_block'],
      ['when am I free tomorrow', 'find_free_time'],
    ]) {
      const r = await route(text, null, NOW);
      expect([text, r.call?.tool, r.source]).toEqual([text, tool, 'trigger']);
    }
  });

  it('guards keep triggers honest', () => {
    expect(triggerTool(prep("I'm in a meeting"), NOW)).not.toBe('set_timezone');
    expect(triggerTool(prep("what's at 5pm?"), NOW)).not.toBe('create_block'); // a question, not an add
    expect(triggerTool(prep('delete call a friend'), NOW)).toBe('delete_block'); // "friend" is not "fri"
  });

  it('a bare phrase offers the likely actions instead of guessing', async () => {
    const r = await respond('gym', null, NOW);
    expect(r.route.call).toBeNull();
    expect(r.result.card.kind).toBe('choice');
    if (r.result.card.kind !== 'choice') return;
    expect(r.result.card.options.map((o) => o.call.tool)).toEqual(['create_block', 'add_to_backlog', 'search_tasks']);
  });

  it('a phrase that names a block offers actions on that block', async () => {
    const r = await respond('lunch', null, NOW);
    if (r.result.card.kind !== 'choice') throw new Error('expected a choice');
    expect(r.result.card.options.map((o) => o.call.tool)).toEqual(['when_is', 'complete_block', 'move_block']);
    expect(r.result.card.options[0].call.args.key).toBe(`task:lunch@${TODAY}`);
  });

  it('keyword scores rank the obvious tool first', () => {
    expect(keywordScores(prep('i want to see my rhythm'))[0].tool).toBe('streaks');
    expect(keywordScores(prep('give me some extra minutes please'))[0].tool).toBe('extend_block');
  });
});

describe('refinements fix known confusions', () => {
  it('a clock time means a block, not a timer', () => {
    expect(refine('start_timer', prep('gym at 5pm for 45 minutes'), NOW, 'needle')).toBe('create_block');
    expect(refine('start_timer', prep('a 45 minute timer'), NOW, 'needle')).toBe('start_timer');
  });
  it('"free" means free time, not planning', () => {
    expect(refine('plan_my_day', prep('when am i free tomorrow'), NOW, 'needle')).toBe('find_free_time');
  });
  it('"remind me" with a time schedules; without one it saves for later', () => {
    expect(refine('add_to_backlog', prep('remind me to call mum at 6pm'), NOW, 'trigger')).toBe('create_block');
    expect(refine('create_block', prep('remind me to call mum'), NOW, 'trigger')).toBe('add_to_backlog');
    expect(refine('create_block', prep('add milk someday'), NOW, 'trigger')).toBe('add_to_backlog');
  });
});

// ── Argument normalisation ────────────────────────────────────────────────────

describe('normalising arguments', () => {
  it('reads times', () => {
    expect(toTime('5pm', NOW)).toBe(17 * 60);
    expect(toTime('17:00', NOW)).toBe(17 * 60);
    expect(toTime('5', NOW)).toBe(17 * 60); // a bare 1–7 is afternoon
    expect(toTime('9', NOW)).toBe(9 * 60);
    expect(toTime('noon', NOW)).toBe(12 * 60);
    expect(toTime(17, NOW)).toBe(17 * 60);
    expect(toTime(1020, NOW)).toBe(1020);
    expect(toTime('at four', NOW)).toBe(16 * 60);
    expect(toTime('whenever', NOW)).toBeNull();
  });

  it('reads days', () => {
    expect(toDay('today', NOW)).toBe(TODAY);
    expect(toDay('tomorrow', NOW)).toBe(TOMORROW);
    expect(toDay('friday', NOW)).toBe('2026-10-23');
    expect(toDay('next monday', NOW)).toBe('2026-10-26');
    expect(toDay('yesterday', NOW)).toBe('2026-10-18');
    expect(toDay('2026-11-02', NOW)).toBe('2026-11-02');
    expect(dayIn('call a friend', NOW)).toBeNull();
  });

  it('reads durations', () => {
    expect(toMinutes(25, NOW)).toBe(25);
    expect(toMinutes('25', NOW)).toBe(25);
    expect(toMinutes('45 minutes', NOW)).toBe(45);
    expect(toMinutes('an hour', NOW)).toBe(60);
    expect(toMinutes('1h30', NOW)).toBe(90);
    expect(toMinutes('half an hour', NOW)).toBe(30);
    expect(toMinutes('twenty five minutes', NOW)).toBe(25);
  });

  it('reads repeats', () => {
    expect(toRepeat('daily', NOW)).toEqual({ freq: 'daily', interval: 1 });
    expect(toRepeat('weekdays', NOW)).toEqual({ freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] });
    expect(toRepeat('monday', NOW)).toEqual({ freq: 'weekly', interval: 1, byWeekday: [1] });
    expect(toRepeat({ freq: 'weekly', interval: 0 }, NOW)).toEqual({ freq: 'weekly', interval: 1 });
    expect(toRepeat('sometimes', NOW)).toBeNull();
  });

  it('turns number words into digits only where they mean numbers', () => {
    expect(digits('twenty five minute timer')).toBe('25 minute timer');
    expect(digits("lunch at four o'clock")).toBe('lunch at 4');
    expect(digits('a few more minutes')).toBe('10 more minutes');
    expect(digits('call one friend')).toBe('call one friend');
  });

  it('create_block: title, time, day, length and repeat from the words', () => {
    expect(normalize('create_block', {}, 'add gym at 5pm for 45 minutes', NOW)).toMatchObject({ title: 'Gym', time: 1020, minutes: 45, day: null, repeat: null });
    expect(normalize('create_block', {}, 'meds every day at 8am', NOW)).toMatchObject({ title: 'Meds', time: 480, repeat: { freq: 'daily', interval: 1 } });
    expect(normalize('create_block', {}, 'dentist tomorrow 10am', NOW)).toMatchObject({ title: 'Dentist', time: 600, day: TOMORROW });
    expect(normalize('create_block', {}, 'remind me to call mum at 6pm', NOW)).toMatchObject({ title: 'Call mum', time: 1080 });
    expect(normalize('create_block', {}, 'yoga every weekday at 7am for half an hour', NOW)).toMatchObject({ title: 'Yoga', time: 420, minutes: 30, repeat: { freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] } });
  });

  it("create_block: the model's arguments fill only what the words didn't say", () => {
    const a = normalize('create_block', { title: 'laundry', time: '4pm', minutes: '1 hour' }, 'get the laundry going this arvo', NOW);
    expect(a).toMatchObject({ title: 'Laundry', time: 16 * 60, minutes: 60 });
    // "around four" is read by the words themselves.
    expect(normalize('create_block', {}, 'get the laundry going around four', NOW)).toMatchObject({ title: 'Get the laundry going', time: 16 * 60 });
    expect(normalize('create_block', {}, 'pop the dentist into thursday morning', NOW)).toMatchObject({ title: 'Dentist', day: '2026-10-22', time: 9 * 60 });
    // Words win over a model that misheard.
    expect(normalize('create_block', { time: '3pm', minutes: 10 }, 'gym at 5pm for 45 minutes', NOW)).toMatchObject({ time: 1020, minutes: 45 });
  });

  it('add_to_backlog uses the brain-dump parser', () => {
    expect(normalize('add_to_backlog', {}, 'remember to buy milk sometime', NOW)).toMatchObject({ title: 'Buy milk', list: null });
    expect(normalize('add_to_backlog', {}, 'someday learn guitar', NOW)).toMatchObject({ title: 'Learn guitar', list: 'someday' });
    expect(normalize('add_to_backlog', {}, 'remember to pay rent by friday !!', NOW)).toMatchObject({ title: 'Pay rent', due: '2026-10-23', priority: 1 });
  });

  it('block targets: the name, without verbs, times and filler', () => {
    expect(normalize('complete_block', {}, 'I finished lunch', NOW).title).toBe('Lunch');
    expect(normalize('complete_block', {}, 'mark meds done', NOW).title?.toLowerCase()).toBe('meds');
    expect(normalize('complete_block', {}, 'done', NOW).title).toBeNull();
    expect(normalize('move_block', {}, 'move lunch to 2pm', NOW)).toMatchObject({ title: 'Lunch', time: 840 });
    expect(normalize('move_block', {}, 'push the walk to tomorrow', NOW)).toMatchObject({ title: 'walk', day: TOMORROW, time: null });
    expect(normalize('move_block', {}, 'move gym 30 minutes later', NOW)).toMatchObject({ title: 'Gym', shift: 30 });
    expect(normalize('move_block', {}, 'bring the call forward an hour', NOW)).toMatchObject({ title: 'call', shift: -60 });
    expect(normalize('extend_block', {}, 'give me 15 more minutes', NOW)).toMatchObject({ title: null, minutes: 15 });
    expect(normalize('extend_block', {}, 'add 10 minutes to deep work', NOW)).toMatchObject({ title: 'deep work', minutes: 10 });
    expect(normalize('extend_block', {}, 'a few more minutes', NOW)).toMatchObject({ minutes: 10 });
    expect(normalize('delete_block', {}, 'delete all the meds', NOW)).toMatchObject({ title: 'meds', all: true });
    expect(normalize('when_is', {}, 'how long until my walk', NOW).title).toBe('walk');
    expect(normalize('search_tasks', {}, 'do I have anything about taxes', NOW).query).toBe('taxes');
  });

  it('timers, faces, themes, zones', () => {
    expect(normalize('start_timer', {}, 'start a 25 minute focus', NOW)).toMatchObject({ minutes: 25, label: null });
    expect(normalize('start_timer', {}, 'I need a break', NOW)).toMatchObject({ minutes: null, label: 'Break' });
    expect(normalize('start_timer', {}, 'set a 20 minute timer for laundry', NOW)).toMatchObject({ minutes: 20, label: 'Laundry' });
    expect(normalize('start_focus_cycles', {}, 'start 3 rounds of 50 minutes', NOW)).toMatchObject({ rounds: 3, minutes: 50 });
    expect(normalize('set_dial', {}, 'use the 24 hour dial', NOW).preset).toBe('gmt24');
    expect(normalize('set_dial', {}, 'show the hour timer face', NOW).preset).toBe('timer60');
    expect(normalize('set_theme', {}, 'switch to the black theme', NOW).theme).toBe('black');
    expect(normalize('set_theme', {}, 'it is too bright', NOW).theme).toBe('dark');
    expect(normalize('set_timezone', {}, "I'm in Tokyo", NOW)).toMatchObject({ city: 'Tokyo', zone: 'Asia/Tokyo' });
    expect(normalize('set_timezone', {}, 'switch to new york time', NOW).zone).toBe('America/New_York');
    expect(normalize('set_timezone', {}, 'back to local time', NOW).zone).toBe('');
    expect(normalize('find_free_time', {}, 'find me an hour this afternoon', NOW)).toMatchObject({ minutes: 60, part: 'afternoon', day: TODAY });
    expect(normalize('week_review', {}, 'how was my month', NOW).span).toBe(28);
  });
});

// ── With a (mocked) Needle engine ─────────────────────────────────────────────

/** Compressed like Needle's: a big shared direction + small concept dims. */
const CONCEPTS: [RegExp, number][] = [
  [/\b(?:arrange|leftover|fit saved|plan my day|fill my afternoon)\b/, 1],
  [/\b(?:food|lunch|eat|meal|hungry)\b/, 2],
  [/\b(?:exercise|gym|workout|walk)\b/, 3],
];
function vec(raw: string): Float32Array {
  const text = raw.toLowerCase();
  const v = new Float32Array(48);
  v[0] = 6;
  for (const [re, i] of CONCEPTS) if (re.test(text)) v[i] = 2.5;
  for (const w of text.split(/\W+/).filter(Boolean)) {
    let h = 0;
    for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[8 + (h % 40)] += 0.35;
  }
  let s = 0;
  for (const x of v) s += x * x;
  return v.map((x) => x / Math.sqrt(s));
}

function engine(reply: Partial<NeedleResult> & { calls?: NeedleCall[] } = {}) {
  const e = {
    status: 'ready' as const,
    progress: 1,
    error: null,
    hasWeights: vi.fn(async () => true),
    ensureReady: vi.fn(async () => {}),
    configure: vi.fn(async () => {}),
    complete: vi.fn(async (): Promise<NeedleResult> => ({ calls: reply.calls ?? [], confidence: reply.confidence ?? 0, ms: 400 })),
    embed: vi.fn(async (t: string) => vec(t)),
    unload: vi.fn(),
    forget: vi.fn(async () => {}),
  };
  return e satisfies NeedleEngine;
}

describe('routing with Needle', () => {
  it('triggers answer instantly without asking the model', async () => {
    const e = engine({ calls: [{ name: 'start_timer', arguments: {} }], confidence: 0.9 });
    const r = await route('add gym at 5pm for 45 minutes', e, NOW);
    expect(r.call?.tool).toBe('create_block');
    expect(r.source).toBe('trigger');
    expect(e.complete).not.toHaveBeenCalled();
  });

  it('takes a confident call, configured with the terse catalogue', async () => {
    const e = engine({ calls: [{ name: 'create_block', arguments: { title: 'laundry', time: '4pm' } }], confidence: 0.82 });
    const r = await respond("let's get the laundry going this arvo", e, NOW);
    expect(r.route.source).toBe('needle');
    expect(r.route.call?.tool).toBe('create_block');
    expect(e.configure).toHaveBeenCalledWith(NEEDLE_TOOLS, SYSTEM);
    const t = taskFile.value.tasks.find((x) => x.title === 'Laundry');
    expect(t).toMatchObject({ date: TODAY, start: 16 * 60 });
  });

  it('ignores calls to tools that do not exist', async () => {
    const e = engine({ calls: [{ name: 'launch_rocket', arguments: {} }], confidence: 0.9 });
    const r = await route('blorp the quux', e, NOW);
    expect(r.source).not.toBe('needle');
  });

  it('empty calls fall back to the nearest tool by embeddings', async () => {
    const e = engine({ calls: [], confidence: 0.1 });
    const r = await route('arrange my leftover hours', e, NOW);
    expect(r.source).toBe('embed');
    expect(r.call?.tool).toBe('plan_my_day');
  });

  it('low confidence with no agreement becomes a choice card', async () => {
    const e = engine({ calls: [{ name: 'start_timer', arguments: { minutes: 5 } }], confidence: 0.12 });
    const r = await respond('flibber the gizmo', e, NOW);
    expect(r.route.call).toBeNull();
    expect(r.result.card.kind).toBe('choice');
    if (r.result.card.kind === 'choice') expect(r.result.card.options[0].call.tool).toBe('start_timer');
  });

  it('a low-confidence call that the embeddings agree with is acted on', async () => {
    const e = engine({ calls: [{ name: 'plan_my_day', arguments: {} }], confidence: 0.15 });
    const r = await route('arrange my leftover hours', e, NOW);
    expect(r.call?.tool).toBe('plan_my_day');
    expect(r.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE);
  });

  it('applies refinements to model calls too', async () => {
    const e = engine({ calls: [{ name: 'plan_my_day', arguments: {} }], confidence: 0.7 });
    const r = await route('am i free at all', e, NOW);
    // "free" is a trigger already; the refinement also catches it from the model's side.
    expect(r.call?.tool).toBe('find_free_time');
  });

  it('an engine that is not ready is never asked', async () => {
    const e = { ...engine({ calls: [{ name: 'help', arguments: {} }], confidence: 0.9 }), status: 'absent' as const };
    const r = await route('blorp the quux', e, NOW);
    expect(e.complete).not.toHaveBeenCalled();
    expect(r.source).toBe('none');
  });
});

describe('the catalogue', () => {
  it('every tool has a schema, an icon and examples; names are unique', () => {
    const names = TOOLS.map((t) => t.schema.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of TOOLS) {
      expect(t.schema.description.length).toBeGreaterThan(10);
      expect(t.examples.length).toBeGreaterThan(0);
      for (const tr of t.schema.triggers ?? []) expect(() => new RegExp(tr)).not.toThrow();
    }
    expect(TOOL_SCHEMAS).toHaveLength(TOOLS.length);
  });

  it('Needle gets a small, trigger-free catalogue (init costs ~6 ms per token)', () => {
    expect(NEEDLE_TOOLS.length).toBeLessThanOrEqual(16);
    for (const t of NEEDLE_TOOLS) {
      expect(t.triggers).toBeUndefined();
      expect(t.description.split(' ').length).toBeLessThanOrEqual(12);
    }
    expect(JSON.stringify(NEEDLE_TOOLS).length).toBeLessThan(2800);
  });

  it('every example routes to its own tool without the model', async () => {
    for (const t of TOOLS) {
      for (const ex of t.examples) {
        const r = await route(ex, null, NOW);
        expect([ex, r.call?.tool]).toEqual([ex, t.schema.name]);
      }
    }
  });

  it('tomorrow is tomorrow', () => {
    expect(addDays(TODAY, 1)).toBe(TOMORROW);
  });
});
