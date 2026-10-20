import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { atMinutes, MINUTE } from '../../engine/time';
import type { Block, Task } from '../../engine/types';
import { platform } from '../../platform';
import { clock } from '../../stores/clock.svelte';
import { DEFAULT_SETTINGS, settings } from '../../stores/settings.svelte';
import { taskFile } from '../../stores/tasks.svelte';
import { timerFile } from '../../stores/timer.svelte';
import { view } from '../../stores/view.svelte';
import { alef, alefFile, keyAccount, migrateAlef } from './alef.svelte';
import { BEHAVIOR_IDS } from './behaviors';
import { answer, feelingOfResult } from './conversation';
import { moodGlow, moodLed, restPose } from './face';
import { eyeColorFor, screenPalette } from './palette';
import { FINISHES } from '../../presets';
import { lineFor, speaksFor } from './lines';
import { smallTalk, systemPrompt, FEELINGS } from './persona';
import { awakeAt, moments, NOTHING_SEEN, signalsOf, type Snapshot } from './signals';

const TODAY = '2026-10-19';
const NOW = atMinutes(TODAY, 10 * 60 + 40);

function block(p: Partial<Block> & { key: string; start: number; minutes: number }): Block {
  const startMs = atMinutes(TODAY, p.start);
  return {
    kind: 'task',
    date: TODAY,
    title: p.key,
    icon: 'laptop',
    category: 'focus',
    color: '#3D6FE3',
    startMs,
    endMs: startMs + p.minutes * MINUTE,
    floating: false,
    done: false,
    recurring: false,
    readOnly: false,
    ...p,
  };
}

const snap = (now: number, blocks: Block[], o: Partial<Snapshot> = {}): Snapshot => ({ now, blocks, inFocus: false, idleMin: 0, streak: 0, openCheckIns: 0, wake: 7 * 60, sleep: 23 * 60, ...o });

describe('alef: what it notices', () => {
  it('only learns on its first look of the day, then reacts to what changes', () => {
    const a = block({ key: 'a', start: 9 * 60, minutes: 30, done: true });
    const b = block({ key: 'b', start: 10 * 60 + 39, minutes: 45 });
    const first = moments(NOTHING_SEEN, snap(NOW, [a, b]));
    expect(first.moments).toEqual([]);
    // b gets ticked: a "done" moment, once.
    const b2 = { ...b, done: true };
    const second = moments(first.seen, snap(NOW + MINUTE, [a, b2]));
    expect(second.moments.map((m) => m.ev)).toEqual(['allDone']);
    expect(moments(second.seen, snap(NOW + 2 * MINUTE, [a, b2])).moments).toEqual([]);
  });

  it('sees a block start, its last two minutes, and a gentle check-in when it ends unticked', () => {
    const b = block({ key: 'b', start: 10 * 60 + 45, minutes: 30 });
    const other = block({ key: 'o', start: 8 * 60, minutes: 10, done: true });
    let seen = moments(NOTHING_SEEN, snap(NOW, [b, other])).seen;
    const start = moments(seen, snap(atMinutes(TODAY, 10 * 60 + 46), [b, other]));
    expect(start.moments.map((m) => m.ev)).toEqual(['blockStart']);
    seen = start.seen;
    const late = moments(seen, snap(atMinutes(TODAY, 11 * 60 + 13), [b, other]));
    expect(late.moments.map((m) => m.ev)).toEqual(['lastMinute']);
    const ended = moments(late.seen, snap(atMinutes(TODAY, 11 * 60 + 16), [b, other]));
    expect(ended.moments.map((m) => m.ev)).toEqual(['checkIn']);
    expect(ended.moments[0].block?.key).toBe('b');
  });

  it('notices a long block finishing as a big one, and many open check-ins once', () => {
    const big = block({ key: 'big', start: 9 * 60, minutes: 90 });
    const small = block({ key: 'small', start: 8 * 60, minutes: 10 });
    const s0 = moments(NOTHING_SEEN, snap(NOW, [big, small])).seen;
    expect(moments(s0, snap(NOW + MINUTE, [{ ...big, done: true }, small])).moments.map((m) => m.ev)).toEqual(['bigDone']);
    const many = moments(s0, snap(NOW + MINUTE, [big, small], { openCheckIns: 3 }));
    expect(many.moments.map((m) => m.ev)).toContain('manyMissed');
    expect(moments(many.seen, snap(NOW + 2 * MINUTE, [big, small], { openCheckIns: 4 })).moments.map((m) => m.ev)).not.toContain('manyMissed');
  });

  it('turns the day into signals', () => {
    const done = block({ key: 'd', start: 8 * 60, minutes: 30, done: true });
    const open = block({ key: 'o', start: 9 * 60, minutes: 30 });
    const next = block({ key: 'n', start: 10 * 60 + 48, minutes: 30 });
    const s = signalsOf(snap(NOW, [done, open, next], { streak: 3 }));
    expect(s.doneRatio).toBeCloseTo(1 / 2);
    expect(s.nextInMin).toBe(8);
    expect(s.awake).toBe(true);
    expect(awakeAt(atMinutes(TODAY, 23 * 60 + 30), 7 * 60, 23 * 60)).toBe(false);
    // A night shift: awake from 22:00 to 06:00.
    expect(awakeAt(atMinutes(TODAY, 1 * 60), 22 * 60, 6 * 60)).toBe(true);
    expect(awakeAt(atMinutes(TODAY, 12 * 60), 22 * 60, 6 * 60)).toBe(false);
  });
});

describe('alef: words', () => {
  it('speaks up by chattiness, and always answers a poke', () => {
    expect(speaksFor('done', 'quiet')).toBe(false);
    expect(speaksFor('poke', 'quiet')).toBe(true);
    expect(speaksFor('allDone', 'some')).toBe(true);
    expect(speaksFor('blockStart', 'some')).toBe(false);
    expect(speaksFor('blockStart', 'chatty')).toBe(true);
    const line = lineFor('checkIn', { title: 'Deep work', hour: 11, seed: 0 }, 'some');
    expect(line).toContain('Deep work');
    // Never a scold.
    for (let seed = 0; seed < 6; seed++) {
      const l = lineFor('manyMissed', { hour: 15, seed }, 'some') ?? '';
      expect(l).not.toMatch(/fail|lazy|should have|bad/i);
    }
  });

  it('handles small talk itself', () => {
    expect(smallTalk('hi', { hour: 9, seed: 1 })?.say).toMatch(/morning/i);
    expect(smallTalk('Assalamu alaikum', { hour: 9, seed: 1 })?.say).toMatch(/alaikum/i);
    expect(smallTalk('thank you!', { hour: 9, seed: 1 })?.thanks).toBe(true);
    expect(smallTalk("I'm so overwhelmed", { hour: 9, seed: 1 })?.feeling).toBe('loving');
    expect(smallTalk('move lunch to 2pm', { hour: 9, seed: 1 })).toBeNull();
  });

  it('tells an AI brain who Alef is, with today and its limits', () => {
    const p = systemPrompt({ now: '10:40am', date: TODAY, weekday: 'Monday', zone: 'Europe/London', hour12: true, mayChange: false, day: '{"blocks":[]}' });
    expect(p).toContain('Alef');
    expect(p).toContain('may not change');
    expect(p).toContain('{"blocks":[]}');
    for (const f of FEELINGS) expect(BEHAVIOR_IDS).toContain(f);
  });
});

describe('alef: face', () => {
  it('draws both eyes of a frown or a sad face alike (the right eye is the mirror)', async () => {
    const { eyeOf } = await import('./eyes');
    const { BEHAVIORS } = await import('./behaviors');
    for (const id of ['angry', 'grumpy', 'sad', 'miserable', 'afraid'] as const) {
      for (const p of BEHAVIORS[id].poses) {
        const l = eyeOf(p.l, -1);
        const r = eyeOf(p.r, 1);
        expect(r.upB).toBeCloseTo(l.upB);
        expect(r.upA).toBeCloseTo(-l.upA);
      }
    }
  });

  it('shows the mood at rest: round eyes that lift when glad, heavy lids when tired', () => {
    const glad = restPose({ v: 0.8, a: 0 }).l;
    expect(glad.smile).toBe(0);
    expect(glad.sy).toBeGreaterThan(1);
    expect(glad.y).toBeLessThan(0);
    expect(restPose({ v: 0, a: -0.9 }).l.lid).toBeGreaterThan(0.3);
    const low = restPose({ v: -0.8, a: 0 });
    expect(low.l.slant).toBeLessThan(0);
    expect(low.r.slant).toBeGreaterThan(0);
    expect(moodLed({ v: 0.8, a: 0.8 }, null)).toMatch(/^#/);
    expect(moodGlow({ v: 0, a: 0 }, 'victorious')).toBe(1);
  });

  it("wears the dial's colours: inked eyes on light faces, glowing ones on dark", () => {
    const light = screenPalette(FINISHES.glacier, 'dial', 'dial');
    expect(light.dark).toBe(false);
    expect(light.glow).toBe(0);
    const plum = screenPalette(FINISHES.plum, 'dial', 'dial');
    expect(plum.eye.toLowerCase()).toBe(FINISHES.plum.lume.toLowerCase());
    expect(plum.glow).toBeGreaterThan(0.5);
    expect(screenPalette(FINISHES.glacier, 'oled', 'dial').dark).toBe(true);
    // A chosen colour deepens toward the ink on a light face, so it still reads.
    expect(eyeColorFor(FINISHES.glacier, '#5CE1E6', 'dial')).not.toBe('#5CE1E6');
    expect(eyeColorFor(FINISHES.plum, '#5CE1E6', 'dial')).toBe('#5CE1E6');
  });

  it('migrates settings safely', () => {
    const m = migrateAlef({ settings: { eyes: 'red', voice: 'loud', pitch: 9, brain: 'openai', configs: { openai: { model: 'gpt-5.4-mini' }, nope: { model: 'x' } }, consent: { openai: 5 } } });
    expect(m.settings.eyes).toBe('dial');
    expect(m.settings.screen).toBe('dial');
    expect(m.settings.voice).toBe('chirps');
    expect(m.settings.pitch).toBe(1.3);
    expect(m.settings.configs).toEqual({ openai: { model: 'gpt-5.4-mini' } });
    expect(m.settings.consent).toEqual({ openai: 5 });
  });
});

// ── Talking ───────────────────────────────────────────────────────────────────

let n = 0;
function task(p: Partial<Task>): Task {
  n++;
  return { id: `t${n}`, title: `Task ${n}`, icon: 'laptop', category: 'focus', date: TODAY, start: null, duration: 30, notes: '', subtasks: [], recurrence: null, completions: [], completedAt: {}, skips: [], overrides: {}, alerts: [], createdAt: NOW, updatedAt: NOW, list: 'inbox', priority: null, due: null, energy: null, order: n, doneAt: null, acks: [], ...p };
}

describe('alef: conversation', () => {
  beforeAll(() => Object.assign(globalThis, { innerWidth: 1200, innerHeight: 800 }));
  beforeEach(() => {
    settings.value = { ...structuredClone(DEFAULT_SETTINGS), clock: '24', addons: { alef: true } };
    timerFile.value.active = null;
    clock.setOffset(NOW - Date.now());
    view.date = view.today;
    view.calendarEvents = [];
    taskFile.value.tasks = [task({ id: 'deep', title: 'Deep work', start: 11 * 60, duration: 60 }), task({ id: 'lunch', title: 'Lunch', category: 'care', start: 12 * 60 + 30, duration: 40 })];
    alefFile.value = migrateAlef(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('answers on this device with the planner when no AI is set up', async () => {
    const a = await answer("what's next", { history: [], aiReady: false });
    expect(a.via).toBe('device');
    expect(a.text.length).toBeGreaterThan(0);
    expect(a.entry?.result?.say).toBe('');
    expect(BEHAVIOR_IDS).toContain(a.feeling);
  });

  it('uses the AI brain with the planner tools, and its feeling tag', async () => {
    alefFile.value.settings.brain = 'openai';
    alefFile.value.settings.configs = { openai: { model: 'gpt-5.4-mini' } };
    alefFile.value.settings.consent = { openai: Date.now() };
    await platform.secrets.set(keyAccount('openai'), 'sk-test');
    const bodies: any[] = [];
    const replies = [
      { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'create_block', arguments: JSON.stringify({ title: 'Walk', date: 'today', start: '15:00', minutes: 30 }) } }] } }] },
      { choices: [{ message: { content: '[happy] Done! A walk at 3pm.' } }] },
    ];
    vi.spyOn(platform, 'fetch').mockImplementation(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(replies.shift()), { status: 200 });
    });
    const a = await answer('add a walk at 3pm', { history: [], aiReady: true });
    expect(a).toMatchObject({ via: 'ai', feeling: 'happy', text: 'Done! A walk at 3pm.', tools: ['create_block'] });
    expect(taskFile.value.tasks.some((t) => t.title === 'Walk' && t.start === 15 * 60)).toBe(true);
    // The system prompt carries today's plan; the key goes in the header, not the body.
    expect(bodies[0].messages[0].content).toContain('Deep work');
    expect(JSON.stringify(bodies)).not.toContain('sk-test');
    expect(bodies[0].tools.some((t: any) => t.function.name === 'create_block')).toBe(true);
  });

  it("falls back to this device, and says why, when the AI can't be reached", async () => {
    alefFile.value.settings.brain = 'anthropic';
    alefFile.value.settings.configs = { anthropic: { model: 'claude-haiku-5-5' } };
    alefFile.value.settings.consent = { anthropic: Date.now() };
    vi.spyOn(platform, 'fetch').mockResolvedValue(new Response('{"error":{"message":"bad key"}}', { status: 401 }));
    const a = await answer("what's next", { history: [], aiReady: true });
    expect(a.via).toBe('device');
    expect(a.note).toMatch(/didn't accept the key/);
  });

  it('only shares with an AI brain after you agree', async () => {
    alefFile.value.settings.brain = 'openai';
    alefFile.value.settings.configs = { openai: { model: 'gpt-5.4-mini' } };
    alef.hasKey = true;
    expect(alef.aiReady).toBe(false);
    alefFile.value.settings.consent = { openai: Date.now() };
    expect(alef.aiReady).toBe(true);
    alefFile.value.settings.configs = { openai: { model: '' } };
    expect(alef.aiReady).toBe(false);
  });

  it('feels its answers', () => {
    expect(feelingOfResult({ say: '', card: { kind: 'choice', options: [] } })).toBe('confused');
    expect(feelingOfResult({ say: '', card: { kind: 'block', key: 'k', verb: 'done' } })).toBe('delighted');
  });
});

describe('alef: formatting replies', async () => {
  const { md } = await import('./md');
  it('keeps a little Markdown and nothing unsafe', () => {
    expect(md('**Done!** Moved *lunch*.')).toBe('<p><b>Done!</b> Moved <i>lunch</i>.</p>');
    expect(md('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(md('<img src=x onerror=alert(1)> [x](javascript:1)')).toBe('<p>&lt;img src=x onerror=alert(1)&gt; [x](javascript:1)</p>');
    expect(md('a\nb\n\nc')).toBe('<p>a<br>b</p><p>c</p>');
  });
});

describe('alef: a pet', async () => {
  const { gesture, petMoment, FRESH_MEMORY } = await import('./pet');
  const { ACTS, TRICK_IDS } = await import('./behaviors');
  const { PATTERNS } = await import('./chirps');
  const stroke = (n: number, ms: number, amp = 0.35) => Array.from({ length: n }, (_, i) => ({ x: 0.5 + (i % 2 ? amp : -amp) * (i % 4 < 2 ? 1 : 0.9), y: 0.5, t: (i * ms) / n }));

  it('tells petting from tickling, and a pass-over from either', () => {
    expect(gesture(stroke(6, 1200), 1200)).toBe('pet');
    expect(gesture(stroke(14, 700, 0.2), 700)).toBe('tickle');
    expect(gesture([{ x: 0, y: 0.5, t: 0 }, { x: 0.3, y: 0.5, t: 50 }, { x: 0.6, y: 0.5, t: 100 }, { x: 0.9, y: 0.5, t: 150 }, { x: 1, y: 0.5, t: 200 }], 200)).toBeNull();
  });

  const ctx = { now: Date.UTC(2026, 9, 19, 11), awake: true, idleMin: 0, prevIdleMin: 0, activeMin: 10, focus: null, v: 0.2, a: 0, quiet: false, backlog: 0, roll: 0.5 };

  it('welcomes you back, once', () => {
    const a = petMoment({ ...ctx, prevIdleMin: 25 }, FRESH_MEMORY);
    expect(a.moment?.kind).toBe('welcome');
    expect(petMoment({ ...ctx, prevIdleMin: 25, now: ctx.now + 60_000 }, a.memory).moment).toBeNull();
  });

  it('cheers halfway through focus and checks you are still there, once each', () => {
    const f = { progress: 0.55, startedAt: 1 };
    const a = petMoment({ ...ctx, focus: f }, FRESH_MEMORY);
    expect(a.moment?.kind).toBe('halfway');
    const b = petMoment({ ...ctx, focus: f, idleMin: 6 }, a.memory);
    expect(b.moment?.kind).toBe('still-there');
    expect(petMoment({ ...ctx, focus: f, idleMin: 7 }, b.memory).moment).toBeNull();
  });

  it('asks for a stretch after a long stretch of work, and keeps hiccups rare', () => {
    expect(petMoment({ ...ctx, activeMin: 85 }, FRESH_MEMORY).moment?.act).toBe('stretching');
    let mem = FRESH_MEMORY;
    let quirks = 0;
    for (let i = 0; i < 400; i++) {
      const r = petMoment({ ...ctx, now: ctx.now + i * 60_000 * 100, roll: 0.001 }, mem);
      mem = r.memory;
      if (r.moment?.kind === 'quirk') quirks++;
    }
    expect(quirks).toBeLessThanOrEqual(2 * Math.ceil((400 * 100) / (60 * 24)) + 2);
    // At night, Alef leaves you be.
    expect(petMoment({ ...ctx, awake: false, prevIdleMin: 30, activeMin: 200, roll: 0.001 }, FRESH_MEMORY).moment).toBeNull();
  });

  it('has a full performance and a sound for every trick', () => {
    for (const id of TRICK_IDS) {
      expect(ACTS[id].poses.length).toBeGreaterThan(0);
      expect(PATTERNS[ACTS[id].chirp]).toBeDefined();
    }
  });
});

describe('alef: about you', () => {
  it('fits Alef to you: your name in its words, your notes and tone for an AI brain', () => {
    const p = systemPrompt({ now: '9:00am', date: '2026-10-19', weekday: 'Monday', zone: 'UTC', hour12: true, mayChange: true, day: null, you: { name: 'Sam', about: 'Mornings are my best time.', tone: 'brief' } });
    expect(p).toContain("The person's name is Sam");
    expect(p).toContain('Mornings are my best time.');
    expect(p).toContain('very brief');
    expect(systemPrompt({ now: '9:00am', date: '2026-10-19', weekday: 'Monday', zone: 'UTC', hour12: true, mayChange: true, day: null, you: { name: '', about: '', tone: 'warm' } })).not.toContain('name is');
    expect(smallTalk('hello', { hour: 9, seed: 1, name: 'Sam' })?.say).toMatch(/Sam/);
    expect(lineFor('greet', { hour: 9, seed: 0, who: 'Sam' }, 'some')).toMatch(/Sam/);
    expect(migrateAlef({ settings: { you: { name: 'x'.repeat(90), tone: 'shouty' } } }).settings.you).toEqual({ name: 'x'.repeat(40), about: '', tone: 'warm' });
  });
});
