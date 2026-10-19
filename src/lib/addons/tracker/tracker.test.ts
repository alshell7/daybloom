import { describe, expect, it } from 'vitest';
import { MINUTE } from '../../engine/time';
import { migrateTrackerFile } from './migrate';
import { ACTIVITY_COMMIT_MS, createTracker, IDLE_POLL_MS, REMIND_AFTER_MS } from './tracker.svelte';
import type { Foreground, TrackerFile, TrackerSettings } from './types';

const T0 = Date.UTC(2026, 9, 19, 9, 0);

/** A tracker on a fake clock with fake idle and foreground sources. */
function harness(o: { file?: { value: TrackerFile }; settings?: Partial<TrackerSettings>; beat?: number | null; at?: number } = {}) {
  const s = {
    t: o.at ?? T0,
    idle: 0,
    front: { app: 'Code' } as Foreground | null,
    beat: o.beat ?? (null as number | null),
    asked: [] as boolean[],
    n: 0,
  };
  const file = o.file ?? { value: migrateTrackerFile({ settings: o.settings ?? {} }) };
  const tr = createTracker({
    file,
    now: () => s.t,
    idleSeconds: async () => s.idle,
    foreground: async (withTitle) => {
      s.asked.push(withTitle);
      return s.front && (withTitle ? s.front : { app: s.front.app });
    },
    newId: () => `e${++s.n}`,
    heartbeat: { read: () => s.beat, write: (ms) => (s.beat = ms) },
    setInterval: () => 0,
    clearInterval: () => {},
  });
  /** Step the clock in idle-poll sized steps up to `until`; `idleAt(t)` gives idle seconds. */
  async function pollUntil(until: number, idleAt: (t: number) => number = () => 0) {
    while (s.t + IDLE_POLL_MS <= until) {
      s.t += IDLE_POLL_MS;
      s.idle = idleAt(s.t);
      await tr.pollIdle();
    }
  }
  return { s, tr, file, pollUntil };
}

const min = (n: number) => T0 + n * MINUTE;

describe('start, stop, switch', () => {
  it('starts, counts and stops', () => {
    const { s, tr } = harness();
    const e = tr.start({ taskId: 't1', note: ' draft ' });
    expect(tr.running?.id).toBe(e.id);
    expect(e).toMatchObject({ startMs: T0, endMs: null, taskId: 't1', note: 'draft', source: 'tracker' });
    s.t = min(25);
    expect(tr.elapsedMs).toBe(25 * MINUTE);
    const done = tr.stop()!;
    expect(done.endMs).toBe(min(25));
    expect(tr.running).toBeNull();
    expect(tr.elapsedMs).toBe(0);
    expect(tr.stop()).toBeNull();
  });

  it('starting while another runs stops that one first', () => {
    const { s, tr } = harness();
    tr.start({ taskId: 'a' });
    s.t = min(10);
    tr.start({ blockKey: 'task:b@2026-10-19', source: 'manual' });
    expect(tr.entries.map((e) => [e.taskId, e.endMs])).toEqual([
      ['a', min(10)],
      ['b', null],
    ]);
    expect(tr.running).toMatchObject({ taskId: 'b', blockKey: 'task:b@2026-10-19', source: 'manual' });
    expect(tr.entries.filter((e) => e.endMs == null)).toHaveLength(1);
  });

  it('a start and stop at the same instant leaves nothing', () => {
    const { tr } = harness();
    tr.start({ taskId: 'a' });
    expect(tr.stop()).toBeNull();
    expect(tr.entries).toEqual([]);
  });

  it('toggle and isTracking follow the target', () => {
    const { s, tr } = harness();
    expect(tr.toggle({ taskId: 'a', projectId: 'p' })).not.toBeNull();
    expect(tr.isTracking()).toBe(true);
    expect(tr.isTracking({ taskId: 'a' })).toBe(true);
    expect(tr.isTracking({ projectId: 'p' })).toBe(true);
    expect(tr.isTracking({ taskId: 'b' })).toBe(false);
    s.t = min(5);
    tr.toggle({ taskId: 'b' }); // switches
    expect(tr.running?.taskId).toBe('b');
    s.t = min(6);
    expect(tr.toggle({ taskId: 'b' })).toBeNull(); // stops
    expect(tr.isTracking()).toBe(false);
    expect(tr.entries).toHaveLength(2);
  });
});

describe('manual entries and edits', () => {
  it('rejects an end before the start, and overlaps unless forced', () => {
    const { s, tr } = harness({ at: min(600) });
    expect(tr.addManual({ startMs: min(60), endMs: min(60) })).toMatchObject({ ok: false, error: 'invalid-range' });
    const a = tr.addManual({ startMs: min(0), endMs: min(60), taskId: 't' });
    expect(a.ok && a.value.source).toBe('manual');
    const clash = tr.addManual({ startMs: min(30), endMs: min(90) });
    expect(clash).toMatchObject({ ok: false, error: 'overlap' });
    if (!clash.ok) expect(clash.conflicts.map((e) => e.taskId)).toEqual(['t']);
    expect(tr.addManual({ startMs: min(60), endMs: min(90) }).ok).toBe(true); // touching is fine
    expect(tr.addManual({ startMs: min(30), endMs: min(45) }, { force: true }).ok).toBe(true);
    expect(tr.entries.map((e) => (e.startMs - T0) / MINUTE)).toEqual([0, 30, 60]);
    // The running entry occupies time up to now.
    s.t = min(700);
    tr.start({ taskId: 'live' });
    s.t = min(720);
    expect(tr.addManual({ startMs: min(710), endMs: min(715) })).toMatchObject({ ok: false, error: 'overlap' });
  });

  it('updates with the same rules and keeps start order', () => {
    const { tr } = harness({ at: min(600) });
    const a = tr.addManual({ startMs: min(0), endMs: min(60), note: 'x' });
    const b = tr.addManual({ startMs: min(120), endMs: min(180) });
    if (!a.ok || !b.ok) throw new Error('setup');
    expect(tr.update(b.value.id, { startMs: min(30) })).toMatchObject({ ok: false, error: 'overlap' });
    expect(tr.update(b.value.id, { endMs: min(100) })).toMatchObject({ ok: false, error: 'invalid-range' });
    expect(tr.update('nope', { note: 'x' })).toMatchObject({ ok: false, error: 'not-found' });
    const moved = tr.update(b.value.id, { startMs: min(-60), endMs: min(-30), blockKey: 'task:k@2026-10-19', note: '' });
    expect(moved.ok).toBe(true);
    expect(tr.entries.map((e) => e.id)).toEqual([b.value.id, a.value.id]);
    expect(tr.entries[0]).toEqual({ id: b.value.id, startMs: min(-60), endMs: min(-30), source: 'manual', blockKey: 'task:k@2026-10-19', taskId: 'k' });
    expect(tr.update(a.value.id, { startMs: min(-45) }, { force: true }).ok).toBe(true);
  });

  it('setting an end on the running entry stops it', () => {
    const { s, tr } = harness();
    const e = tr.start({ taskId: 'a' });
    s.t = min(30);
    expect(tr.update(e.id, { endMs: min(20) }).ok).toBe(true);
    expect(tr.running).toBeNull();
    expect(tr.entries[0].endMs).toBe(min(20));
  });

  it('removes, splits and merges', () => {
    const { s, tr } = harness({ at: min(600) });
    const a = tr.addManual({ startMs: min(0), endMs: min(60), taskId: 'a' });
    const b = tr.addManual({ startMs: min(70), endMs: min(90), taskId: 'a' });
    const c = tr.addManual({ startMs: min(200), endMs: min(210) });
    if (!a.ok || !b.ok || !c.ok) throw new Error('setup');

    const sp = tr.split(a.value.id, min(20));
    expect(sp.ok).toBe(true);
    expect(tr.entries.map((e) => [(e.startMs - T0) / MINUTE, ((e.endMs as number) - T0) / MINUTE])).toEqual([
      [0, 20],
      [20, 60],
      [70, 90],
      [200, 210],
    ]);
    expect(tr.split(a.value.id, min(20))).toMatchObject({ ok: false, error: 'invalid-range' });

    const second = tr.entries[1].id;
    expect(tr.merge([a.value.id])).toMatchObject({ ok: false, error: 'too-few' });
    expect(tr.merge([a.value.id, 'ghost'])).toMatchObject({ ok: false, error: 'not-found' });
    // Merging a and c would swallow the entries between them.
    expect(tr.merge([a.value.id, c.value.id])).toMatchObject({ ok: false, error: 'overlap' });
    const m = tr.merge([second, a.value.id, b.value.id]);
    expect(m.ok && [m.value.id, m.value.startMs, m.value.endMs]).toEqual([a.value.id, min(0), min(90)]);
    expect(tr.entries).toHaveLength(2);

    expect(tr.remove(c.value.id)).toBe(true);
    expect(tr.remove(c.value.id)).toBe(false);
    expect(tr.entries).toHaveLength(1);

    // A running entry splits into a finished part and a running part.
    tr.start({ taskId: 'r' });
    s.t = min(640);
    const run = tr.split(tr.running!.id, min(620));
    expect(run.ok && run.value.map((e) => e.endMs)).toEqual([min(620), null]);
    expect(tr.running?.startMs).toBe(min(620));
  });
});

describe('idle', () => {
  const awayFrom = (since: number) => (t: number) => Math.max(0, (t - since) / 1000);

  it('asks once the user has been away for idleMinutes', async () => {
    const { tr, pollUntil } = harness();
    const e = tr.start({ taskId: 'a' });
    await pollUntil(min(14), awayFrom(min(10)));
    expect(tr.idlePrompt).toBeNull();
    await pollUntil(min(15), awayFrom(min(10)));
    expect(tr.idlePrompt).toEqual({ since: min(10), entryId: e.id });
    // Still away: the same prompt stays.
    await pollUntil(min(18), awayFrom(min(10)));
    expect(tr.idlePrompt).toEqual({ since: min(10), entryId: e.id });
  });

  it("'keep' keeps the time running and notes it", async () => {
    const { s, tr, pollUntil } = harness();
    const e = tr.start({ taskId: 'a' });
    await pollUntil(min(16), awayFrom(min(10)));
    s.t = min(20);
    const r = tr.resolveIdle('keep');
    expect(r.started).toBeNull();
    expect(tr.idlePrompt).toBeNull();
    expect(tr.running?.id).toBe(e.id);
    expect(tr.running?.idle).toEqual({ ms: 10 * MINUTE });
    // Back at work: no new prompt for the stretch already answered.
    await pollUntil(min(22), () => 1);
    expect(tr.idlePrompt).toBeNull();
  });

  it("'drop' ends the entry where the idle began and starts again now", async () => {
    const { s, tr, pollUntil } = harness();
    const e = tr.start({ taskId: 'a', projectId: 'p', note: 'n', source: 'focus' });
    await pollUntil(min(16), awayFrom(min(10)));
    s.t = min(20);
    const r = tr.resolveIdle('drop');
    expect(r.stopped).toMatchObject({ id: e.id, endMs: min(10), idle: { ms: 0, droppedMs: 10 * MINUTE } });
    expect(r.started).toMatchObject({ startMs: min(20), endMs: null, taskId: 'a', projectId: 'p', note: 'n', source: 'focus' });
    expect(tr.running?.id).toBe(r.started!.id);
    expect(tr.entries).toHaveLength(2);
  });

  it("'drop-stop' ends the entry where the idle began and stops", async () => {
    const { s, tr, pollUntil } = harness();
    tr.start({ taskId: 'a' });
    await pollUntil(min(16), awayFrom(min(10)));
    s.t = min(20);
    const r = tr.resolveIdle('drop-stop');
    expect(r.stopped?.endMs).toBe(min(10));
    expect(r.started).toBeNull();
    expect(tr.running).toBeNull();
  });

  it('an entry that was all idle is removed by a drop', async () => {
    const { s, tr, pollUntil } = harness();
    tr.start({ taskId: 'a' });
    await pollUntil(min(6), awayFrom(T0 - MINUTE));
    expect(tr.idlePrompt?.since).toBe(T0);
    s.t = min(8);
    const r = tr.resolveIdle('drop-stop');
    expect(r.stopped).toBeNull();
    expect(tr.entries).toEqual([]);
  });

  it('cuts the idle time even if the entry was stopped meanwhile', async () => {
    const { s, tr, pollUntil } = harness();
    const e = tr.start({ taskId: 'a' });
    await pollUntil(min(16), awayFrom(min(10)));
    s.t = min(18);
    tr.stop(); // e.g. the focus session ended while away
    s.t = min(25);
    const r = tr.resolveIdle('drop');
    expect(r.stopped).toMatchObject({ id: e.id, endMs: min(10), idle: { ms: 0, droppedMs: 8 * MINUTE } });
    expect(r.started).toBeNull();
    expect(tr.running).toBeNull();
  });

  it('a gap of more than two polls (sleep) counts as idle', async () => {
    const { s, tr, pollUntil } = harness();
    const e = tr.start({ taskId: 'a' });
    await pollUntil(min(5)); // active, polled every 15 s
    // Asleep for an hour; waking it takes a key press, so native idle is tiny.
    s.t = min(65);
    s.idle = 2;
    await tr.pollIdle();
    expect(tr.idlePrompt).toEqual({ since: min(5), entryId: e.id });
  });

  it('the idle stretch starts at the last input seen before the gap', async () => {
    const { s, tr, pollUntil } = harness();
    tr.start({ taskId: 'a' });
    await pollUntil(min(5), awayFrom(min(3)));
    s.t = min(40);
    s.idle = 1;
    await tr.pollIdle();
    expect(tr.idlePrompt?.since).toBe(min(3));
  });

  it('a short gap is idle but under the limit, and a normal poll is not a gap', async () => {
    const { s, tr, pollUntil } = harness();
    tr.start({ taskId: 'a' });
    await pollUntil(min(5));
    s.t = min(5) + 2.5 * IDLE_POLL_MS; // 37.5 s: a gap, but nowhere near 5 minutes
    s.idle = 0;
    await tr.pollIdle();
    expect(tr.idlePrompt).toBeNull();
    s.t += 2 * IDLE_POLL_MS; // exactly two polls: not a gap
    await tr.pollIdle();
    expect(tr.idlePrompt).toBeNull();
  });

  it('after a restart the heartbeat covers the time the app was closed', async () => {
    const first = harness();
    const e = first.tr.start({ taskId: 'a' });
    await first.pollUntil(min(5));
    // The app quits at about 09:05 and opens again at noon with the entry still running.
    const again = harness({ file: first.file, beat: first.s.beat, at: min(180) });
    again.s.idle = 3;
    await again.tr.pollIdle();
    expect(again.tr.idlePrompt).toEqual({ since: min(5), entryId: e.id });
  });

  it('with askOnIdle off, the idle time is kept and noted when input returns', async () => {
    const { tr, pollUntil } = harness({ settings: { askOnIdle: false } });
    tr.start({ taskId: 'a' });
    await pollUntil(min(20), awayFrom(min(10)));
    expect(tr.idlePrompt).toBeNull();
    // Back at 20:00 (the poll at 20:15 sees 15 s of idle).
    await pollUntil(min(20) + IDLE_POLL_MS, (t) => (t - min(20)) / 1000);
    expect(tr.running?.idle).toEqual({ ms: 10 * MINUTE });
    expect(tr.running?.endMs).toBeNull();
  });

  it('respects a longer idleMinutes', async () => {
    const { tr, pollUntil } = harness({ settings: { idleMinutes: 15 } });
    tr.start({ taskId: 'a' });
    await pollUntil(min(24), awayFrom(min(10)));
    expect(tr.idlePrompt).toBeNull();
    await pollUntil(min(25), awayFrom(min(10)));
    expect(tr.idlePrompt?.since).toBe(min(10));
  });
});

describe('app activity', () => {
  it('samples nothing unless trackApps is on', async () => {
    const { s, tr } = harness();
    tr.start({ taskId: 'a' });
    s.t = min(0.5);
    expect(await tr.pollActivity()).toBeNull();
    tr.flushActivity();
    expect(tr.running?.activity).toBeUndefined();
    expect(s.asked).toEqual([]);
  });

  it('adds the time since the last sample to the front app, merged by name', async () => {
    const { s, tr } = harness({ settings: { trackApps: true } });
    tr.start({ taskId: 'a' });
    const sample = async (app: string | null, idle = 0) => {
      s.t += 30_000;
      s.front = app ? { app } : null;
      s.idle = idle;
      return tr.pollActivity();
    };
    await sample('Code');
    await sample('Safari');
    await sample('Code');
    await sample('Code', 10); // 10 s of that was idle
    await sample(null); // nothing in front (locked screen)
    tr.stop();
    expect(tr.entries[0].activity).toEqual([
      { app: 'Code', ms: 80_000 },
      { app: 'Safari', ms: 30_000 },
    ]);
    expect(s.asked.every((w) => w === false)).toBe(true);
  });

  it('skips a sleep gap and an open idle prompt', async () => {
    const { s, tr, pollUntil } = harness({ settings: { trackApps: true } });
    tr.start({ taskId: 'a' });
    s.t = min(0.5);
    await tr.pollActivity();
    s.t = min(30); // laptop lid closed
    expect(await tr.pollActivity()).toBeNull();
    s.t = min(30.5);
    expect(await tr.pollActivity()).toMatchObject({ app: 'Code', ms: 30_000 });
    await pollUntil(min(40), (t) => (t - min(31)) / 1000); // away → prompt
    expect(tr.idlePrompt).not.toBeNull();
    s.idle = 0;
    await tr.pollActivity(); // re-anchors after the long gap
    s.t += 30_000;
    expect(await tr.pollActivity()).toBeNull(); // a normal span, but the prompt is open
    tr.flushActivity();
    expect(tr.running?.activity).toEqual([{ app: 'Code', ms: 60_000 }]);
  });

  it('records window titles when trackTitles is on, and commits in batches', async () => {
    const { s, tr } = harness({ settings: { trackApps: true, trackTitles: true } });
    tr.start({ taskId: 'a' });
    for (let i = 0; i < ACTIVITY_COMMIT_MS / 30_000; i++) {
      s.t += 30_000;
      s.front = { app: 'chrome', title: `Tab ${i}` };
      await tr.pollActivity();
    }
    // A full batch is written without a flush.
    expect(tr.running?.activity).toEqual([{ app: 'chrome', ms: ACTIVITY_COMMIT_MS, title: `Tab ${ACTIVITY_COMMIT_MS / 30_000 - 1}` }]);
    expect(s.asked.every((w) => w === true)).toBe(true);
  });
});

describe('focus sessions', () => {
  const session = (startedAt: number, target: { key?: string; taskId?: string } | null) => ({ startedAt, target });

  it('a session with a target tracks it, and stops when it ends', () => {
    const { s, tr } = harness();
    tr.observeFocus(null); // launch: nothing running
    s.t = min(1);
    tr.observeFocus(session(min(1), { key: 'task:t1@2026-10-19', taskId: 't1' }));
    expect(tr.running).toMatchObject({ blockKey: 'task:t1@2026-10-19', taskId: 't1', source: 'focus', startMs: min(1) });
    s.t = min(26);
    tr.observeFocus(null);
    expect(tr.running).toBeNull();
    expect(tr.entries[0].endMs).toBe(min(26));
  });

  it('a session without a target is not tracked; manual tracking is left alone', () => {
    const { s, tr } = harness();
    tr.observeFocus(null);
    tr.observeFocus(session(T0, null));
    expect(tr.running).toBeNull();
    tr.start({ taskId: 'mine' });
    s.t = min(5);
    tr.observeFocus(session(min(5), { taskId: 'mine' })); // already tracking it
    expect(tr.entries).toHaveLength(1);
    s.t = min(30);
    tr.observeFocus(null);
    expect(tr.running?.taskId).toBe('mine'); // not a focus entry: keeps running
  });

  it('stopping by hand during a session sticks', () => {
    const { s, tr } = harness();
    tr.observeFocus(null);
    const a = session(T0, { taskId: 't' });
    tr.observeFocus(a);
    s.t = min(5);
    tr.stop();
    tr.observeFocus(a); // the same session seen again (e.g. a reload)
    expect(tr.running).toBeNull();
  });

  it('on launch, adopts the running entry and stops one left without a session', () => {
    const one = harness();
    one.tr.start({ taskId: 't', source: 'focus' });
    one.s.t = min(5);
    const back = harness({ file: one.file, at: min(5) });
    back.tr.observeFocus(session(T0, { taskId: 't' }));
    expect(back.tr.entries).toHaveLength(1);
    expect(back.tr.running?.startMs).toBe(T0);
    const stale = harness({ file: one.file, at: min(6) });
    stale.tr.observeFocus(null);
    expect(stale.tr.running).toBeNull();
  });

  it('does nothing when followFocus is off', () => {
    const { tr } = harness({ settings: { followFocus: false } });
    tr.observeFocus(null);
    tr.observeFocus(session(T0, { taskId: 't' }));
    expect(tr.running).toBeNull();
    tr.setSettings({ followFocus: true });
    tr.observeFocus(session(T0, { taskId: 't' })); // turned on mid-session
    expect(tr.running?.taskId).toBe('t');
  });
});

describe('not-tracking reminder', () => {
  it('reminds when the computer is in use with nothing tracked, at most every 10 minutes', async () => {
    const { s, tr } = harness({ settings: { remindWhenNotTracking: true } });
    s.t = T0 + REMIND_AFTER_MS - 1;
    expect(await tr.pollReminder()).toBeNull();
    s.t = T0 + REMIND_AFTER_MS;
    s.idle = 600; // away: no reminder
    expect(await tr.pollReminder()).toBeNull();
    s.idle = 5;
    expect(await tr.pollReminder()).toEqual({ since: T0, at: T0 + REMIND_AFTER_MS });
    tr.dismissReminder();
    s.t += MINUTE;
    expect(await tr.pollReminder()).toBeNull();
    tr.start({ taskId: 'a' });
    expect(tr.reminder).toBeNull();
    s.t += REMIND_AFTER_MS * 3;
    expect(await tr.pollReminder()).toBeNull(); // tracking
  });

  it('is off by default', async () => {
    const { s, tr } = harness();
    s.t = T0 + REMIND_AFTER_MS * 2;
    expect(await tr.pollReminder()).toBeNull();
  });
});
