import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateCrumbs, type Crumb, type CrumbsFile } from '../addons/crumbs/migrate';
import { migrateReality, type RealityFile, type Sample } from '../addons/reality/reality';
import { migrateTrackerFile } from '../addons/tracker/migrate';
import type { Entry, TrackerFile } from '../addons/tracker/types';
import { migrateWaqt } from '../addons/waqt/defaults';
import type { WaqtFile } from '../addons/waqt/types';
import { migrateWork } from '../addons/work/migrate';
import type { Invoice, WorkData } from '../addons/work/types';
import type { Task } from '../engine/types';
import { DEFAULT_SETTINGS, type Settings } from '../stores/settings.svelte';
import { decodeBase64, encodeBase64, type FetchLike } from './github';
import type { Tombstone } from './merge';
import { BASE_PREFIX, createSyncService, SETTLE_MS, SYNC_INTERVAL_MS, TOKEN_ACCOUNT, type SyncService, type SyncStores } from './sync.svelte';

// A test-only token for the fake repo below. Nothing here talks to the real GitHub.
const TOKEN = 'github_pat_TEST_ONLY_fake_repo_token_0000000';
const clock = { t: 1_760_000_000_000 };

function fnv(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Just enough of the Contents API: blob shas are content hashes, writes need the current sha. */
class FakeRepo {
  files = new Map<string, { text: string; sha: string }>();
  isPrivate = true;
  token = TOKEN;
  puts = 0;
  gets = 0;
  conflicts = 0;
  messages: string[] = [];
  beforePut: ((path: string) => void | Promise<void>) | null = null;

  fetch: FetchLike = async (url, init) => {
    await Promise.resolve(); // let concurrent syncs interleave
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (auth !== `Bearer ${this.token}`) return json(401, { message: 'Bad credentials' });
    const u = new URL(url);
    const m = /^\/repos\/me\/data(\/contents(?:\/(.*))?)?$/.exec(u.pathname);
    if (!m) return json(404, { message: 'Not Found' });
    if (!m[1]) return json(200, { full_name: 'me/data', private: this.isPrivate, default_branch: 'main', html_url: 'https://github.com/me/data' });
    const path = decodeURIComponent(m[2] ?? '');

    if (init?.method === 'PUT') {
      await this.beforePut?.(path);
      const body = JSON.parse(String(init.body));
      const cur = this.files.get(path);
      if (cur && !body.sha) {
        this.conflicts++;
        return json(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
      }
      if ((cur && body.sha !== cur.sha) || (!cur && body.sha)) {
        this.conflicts++;
        return json(409, { message: `${path} does not match ${body.sha}` });
      }
      const text = decodeBase64(body.content);
      const sha = fnv(text);
      this.files.set(path, { text, sha });
      this.puts++;
      this.messages.push(body.message);
      return json(cur ? 200 : 201, { content: { sha, path } });
    }

    this.gets++;
    if (this.files.size === 0) return json(404, { message: 'This repository is empty.' });
    const f = this.files.get(path);
    const name = (p: string) => p.split('/').pop()!;
    if (f) return json(200, { type: 'file', name: name(path), path, sha: f.sha, size: f.text.length, encoding: 'base64', content: encodeBase64(f.text) });
    const prefix = path ? `${path}/` : '';
    const entries = [...this.files]
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map(([p, x]) => ({ type: 'file', name: name(p), path: p, sha: x.sha, size: x.text.length }));
    return entries.length ? json(200, entries) : json(404, { message: 'Not Found' });
  };

  read(file: string) {
    const f = this.files.get(`daybloom/${file}`);
    return f ? JSON.parse(f.text) : null;
  }
}

interface Data {
  tasks: { version: 1; tasks: Task[]; deleted: Tombstone[] };
  settings: Settings;
  progress: { version: 1; unlocked: { id: string; at: number }[]; viewedAt: number };
  streaks: { celebrated: number };
  work: WorkData;
  tracker: TrackerFile;
  crumbs: CrumbsFile;
  reality: RealityFile;
  waqt: WaqtFile;
}

interface Device {
  svc: SyncService;
  data: Data;
  storage: Map<string, string>;
  secrets: Map<string, string>;
  /** Fire the store watcher, as a real store change would. */
  touch(): void;
}

function makeDevice(repo: FakeRepo, id: string, name: string, settings: Partial<Settings> = {}, opts: { canSync?: () => boolean } = {}): Device {
  const data: Data = {
    tasks: { version: 1, tasks: [], deleted: [] },
    settings: structuredClone({ ...DEFAULT_SETTINGS, ...settings }),
    progress: { version: 1, unlocked: [], viewedAt: 0 },
    streaks: { celebrated: 0 },
    work: migrateWork(null),
    tracker: migrateTrackerFile(null),
    crumbs: migrateCrumbs(null),
    reality: migrateReality(null),
    waqt: migrateWaqt(null),
  };
  const bind = <K extends keyof Data>(k: K) => ({
    read: () => structuredClone(data[k]),
    write: (v: Data[K]) => {
      data[k] = structuredClone(v);
    },
  });
  let watcher: { cb: () => void; active: () => boolean } | null = null;
  const stores: SyncStores = {
    tasks: bind('tasks'),
    settings: bind('settings'),
    progress: bind('progress'),
    streaks: bind('streaks'),
    work: bind('work'),
    tracker: bind('tracker'),
    crumbs: bind('crumbs'),
    reality: bind('reality'),
    waqt: bind('waqt'),
    watch(cb, active) {
      watcher = { cb, active };
      return () => (watcher = null);
    },
  };
  const storage = new Map<string, string>();
  const secrets = new Map<string, string>();
  const svc = createSyncService({
    fetch: repo.fetch,
    storage: { load: async (k) => storage.get(k) ?? null, save: async (k, v) => void storage.set(k, v) },
    secrets: { get: async (a) => secrets.get(a) ?? null, set: async (a, v) => void secrets.set(a, v), delete: async (a) => void secrets.delete(a) },
    stores: () => stores,
    os: 'mac',
    now: () => clock.t,
    sleep: async () => {},
    newId: () => id,
    canSync: opts.canSync,
  });
  return {
    svc,
    data,
    storage,
    secrets,
    touch: () => {
      if (watcher?.active()) watcher.cb();
    },
  };
  void name;
}

function task(id: string, p: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    icon: 'laptop',
    category: 'focus',
    date: '2026-10-19',
    start: 9 * 60,
    duration: 30,
    notes: '',
    subtasks: [],
    recurrence: null,
    completions: [],
    completedAt: {},
    skips: [],
    overrides: {},
    alerts: [],
    createdAt: clock.t,
    updatedAt: clock.t,
    list: 'inbox',
    priority: null,
    due: null,
    energy: null,
    order: clock.t,
    doneAt: null,
    acks: [],
    ...p,
  };
}

function find(d: Device, id: string) {
  return d.data.tasks.tasks.find((t) => t.id === id);
}

async function connect(d: Device, name: string, join?: 'replace' | 'merge') {
  await d.svc.configure({ repo: 'me/data', deviceName: name });
  await d.svc.saveToken(TOKEN);
  const result = await d.svc.test();
  await d.svc.enable(true, join);
  return result;
}

const synced = (d: Device) => ({
  tasks: d.data.tasks,
  shared: { theme: d.data.settings.theme, clock: d.data.settings.clock, wake: d.data.settings.wake, nudges: d.data.settings.nudges },
  badges: d.data.progress.unlocked,
  streaks: d.data.streaks,
  work: d.data.work,
  tracker: d.data.tracker,
  crumbs: d.data.crumbs,
  reality: d.data.reality,
  waqt: d.data.waqt,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('github sync, end to end', () => {
  it('uploads everything on the first sync to an empty repo, without the token ever reaching disk', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac', { theme: 'dark', timeZone: 'Europe/Berlin' });
    a.data.tasks.tasks.push(task('t1'), task('t2'));
    const result = await connect(a, 'Work Mac');

    expect(result.hasData).toBe(false);
    expect(result.repo.private).toBe(true);
    expect(a.svc.status).toEqual({ state: 'ok', lastSyncAt: clock.t });
    expect([...repo.files.keys()].sort()).toEqual([
      'daybloom/device-mac-a.json',
      'daybloom/progress.json',
      'daybloom/settings.json',
      'daybloom/streaks.json',
      'daybloom/tasks.json',
    ]);
    expect(repo.read('tasks.json').tasks.map((t: Task) => t.id)).toEqual(['t1', 't2']);
    expect(repo.read('settings.json').settings.theme).toBe('dark');
    expect(repo.read('settings.json').settings).not.toHaveProperty('timeZone');
    expect(repo.read('device-mac-a.json')).toMatchObject({ id: 'mac-a', name: 'Work Mac', lastSyncAt: clock.t });
    expect(repo.messages.every((m) => m === 'Daybloom sync from Work Mac')).toBe(true);

    expect(a.secrets.get(TOKEN_ACCOUNT)).toBe(TOKEN);
    expect([...a.storage.values()].join('\n')).not.toContain(TOKEN);
    expect(JSON.stringify(a.svc.config)).not.toContain(TOKEN);
    expect(a.svc.devices.map((d) => d.name)).toEqual(['Work Mac']);
  });

  it('a second computer can adopt the repo while keeping its own device settings', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac', { theme: 'dark', wake: 6 * 60 });
    a.data.tasks.tasks.push(task('t1'), task('t2'));
    await connect(a, 'Work Mac');
    const putsAfterA = repo.puts;

    const b = makeDevice(repo, 'pc-b', 'Home PC', { timeZone: 'Asia/Dubai', widget: { ...DEFAULT_SETTINGS.widget, visible: true, layer: 'desktop' } });
    b.data.tasks.tasks.push(task('sample'));
    await b.svc.configure({ repo: 'me/data', deviceName: 'Home PC' });
    await b.svc.saveToken(TOKEN);
    const result = await b.svc.test();
    expect(result.hasData).toBe(true);
    expect(result.deviceCount).toBe(1);
    expect(b.svc.firstSync).toBe(true);
    await b.svc.enable(true, 'replace');

    expect(b.data.tasks.tasks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(b.data.settings.theme).toBe('dark');
    expect(b.data.settings.wake).toBe(360);
    expect(b.data.settings.timeZone).toBe('Asia/Dubai');
    expect(b.data.settings.widget).toMatchObject({ visible: true, layer: 'desktop' });
    expect(b.svc.firstSync).toBe(false);
    // Joining wrote nothing but B's heartbeat.
    expect(repo.puts - putsAfterA).toBe(1);
    expect(b.svc.devices.map((d) => d.name)).toEqual(['Home PC', 'Work Mac']);
  });

  it('"combine both" keeps the joining computer’s blocks too', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    a.data.tasks.tasks.push(task('t1'));
    await connect(a, 'Work Mac');
    const b = makeDevice(repo, 'pc-b', 'Home PC');
    b.data.tasks.tasks.push(task('mine'));
    await connect(b, 'Home PC', 'merge');
    expect(b.data.tasks.tasks.map((t) => t.id)).toEqual(['t1', 'mine']);
    expect(repo.read('tasks.json').tasks.map((t: Task) => t.id)).toEqual(['t1', 'mine']);
  });

  it('two computers converge after interleaved edits, deletes and settings changes', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    const daily = task('meds', { recurrence: { freq: 'daily', interval: 1 } });
    a.data.tasks.tasks.push(daily, task('report'), task('old'), task('keep'));
    await connect(a, 'Work Mac');
    const b = makeDevice(repo, 'pc-b', 'Home PC');
    await connect(b, 'Home PC', 'replace');
    expect(synced(b)).toEqual(synced(a));
    const t0 = clock.t;

    // A, offline for a while.
    clock.t = t0 + 100_000;
    Object.assign(find(a, 'meds')!, { completions: ['2026-10-18'], completedAt: { '2026-10-18': clock.t }, updatedAt: clock.t });
    Object.assign(find(a, 'report')!, { title: 'Quarterly report', updatedAt: clock.t });
    Object.assign(find(a, 'old')!, { notes: 'edited before it was deleted', updatedAt: clock.t });
    a.data.settings.theme = 'dark';
    a.data.progress.unlocked.push({ id: 'first-tick', at: clock.t });

    // B, meanwhile.
    clock.t = t0 + 200_000;
    Object.assign(find(b, 'meds')!, { completions: ['2026-10-19'], completedAt: { '2026-10-19': clock.t }, updatedAt: clock.t });
    b.data.tasks.tasks = b.data.tasks.tasks.filter((t) => t.id !== 'old' && t.id !== 'keep');
    b.data.tasks.deleted.push({ id: 'old', at: clock.t }, { id: 'keep', at: clock.t });
    b.data.tasks.tasks.push(task('from-b'));
    b.data.settings.clock = '24';
    b.data.settings.nudges.anchors = 'hourly';
    b.data.progress.unlocked.push({ id: 'first-tick', at: t0 + 50_000 }, { id: 'week', at: clock.t });
    b.data.streaks.celebrated = 3;

    // A edits "keep" after B deleted it: the edit wins.
    clock.t = t0 + 300_000;
    Object.assign(find(a, 'keep')!, { title: 'Keep this one', updatedAt: clock.t });

    clock.t = t0 + 400_000;
    await b.svc.syncNow();
    await a.svc.syncNow();
    await b.svc.syncNow();
    expect(a.svc.status.state).toBe('ok');
    expect(b.svc.status.state).toBe('ok');

    expect(synced(a)).toEqual(synced(b));
    expect(a.data.tasks).toEqual(repo.read('tasks.json'));
    const ids = a.data.tasks.tasks.map((t) => t.id);
    expect(ids).toContain('keep');
    expect(ids).toContain('from-b');
    expect(ids).not.toContain('old');
    expect([...find(a, 'meds')!.completions].sort()).toEqual(['2026-10-18', '2026-10-19']);
    expect(find(a, 'report')!.title).toBe('Quarterly report');
    expect(find(a, 'keep')!.title).toBe('Keep this one');
    expect(a.data.tasks.deleted.map((d) => d.id)).toEqual(['old']);
    expect(a.data.settings.theme).toBe('dark');
    expect(a.data.settings.clock).toBe('24');
    expect(a.data.settings.nudges.anchors).toBe('hourly');
    expect(a.data.progress.unlocked).toEqual([
      { id: 'first-tick', at: t0 + 50_000 },
      { id: 'week', at: t0 + 200_000 },
    ]);
    expect(a.data.streaks.celebrated).toBe(3);

    // Nothing left to say: another round writes nothing.
    const puts = repo.puts;
    clock.t += SYNC_INTERVAL_MS;
    await a.svc.syncNow();
    await b.svc.syncNow();
    expect(repo.puts).toBe(puts);
  });

  it('re-fetches, re-merges and retries when another computer writes in between', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    a.data.tasks.tasks.push(task('t1'));
    await connect(a, 'Work Mac');

    // Someone else's write lands just before A's PUT.
    let injected = false;
    repo.beforePut = (path) => {
      if (injected || !path.endsWith('tasks.json')) return;
      injected = true;
      const other = repo.read('tasks.json');
      other.tasks.push(task('from-elsewhere'));
      const text = JSON.stringify(other);
      repo.files.set(path, { text, sha: fnv(text) });
    };
    clock.t += 1000;
    a.data.tasks.tasks.push(task('a1'));
    await a.svc.syncNow();

    expect(repo.conflicts).toBe(1);
    expect(a.svc.status.state).toBe('ok');
    expect(repo.read('tasks.json').tasks.map((t: Task) => t.id)).toEqual(['t1', 'from-elsewhere', 'a1']);
    expect(a.data.tasks.tasks.map((t) => t.id)).toEqual(['t1', 'from-elsewhere', 'a1']);
  });

  it('converges when both computers sync at the same moment', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    await connect(a, 'Work Mac');
    const b = makeDevice(repo, 'pc-b', 'Home PC');
    await connect(b, 'Home PC');

    clock.t += 1000;
    a.data.tasks.tasks.push(task('a1'));
    a.data.settings.theme = 'dark';
    b.data.tasks.tasks.push(task('b1'));
    b.data.settings.sound = false;
    await Promise.all([a.svc.syncNow(), b.svc.syncNow()]);
    expect(a.svc.status.state).toBe('ok');
    expect(b.svc.status.state).toBe('ok');
    expect(repo.conflicts).toBeGreaterThan(0);

    await a.svc.syncNow();
    await b.svc.syncNow();
    expect(synced(a)).toEqual(synced(b));
    expect(a.data.tasks.tasks.map((t) => t.id).sort()).toEqual(['a1', 'b1']);
    expect(b.data.settings.theme).toBe('dark');
    expect(a.data.settings.sound).toBe(false);
  });

  it('keeps edits made while a sync is on the network', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    a.data.tasks.tasks.push(task('t1'));
    await connect(a, 'Work Mac');

    clock.t += 1000;
    a.data.tasks.tasks.push(task('before'));
    repo.beforePut = (path) => {
      if (path.endsWith('tasks.json') && !find(a, 'during')) a.data.tasks.tasks.push(task('during'));
    };
    await a.svc.syncNow();
    repo.beforePut = null;
    expect(a.data.tasks.tasks.map((t) => t.id)).toEqual(['t1', 'before', 'during']);
    expect(repo.read('tasks.json').tasks.map((t: Task) => t.id)).toEqual(['t1', 'before']);
    await a.svc.syncNow();
    expect(repo.read('tasks.json').tasks.map((t: Task) => t.id)).toEqual(['t1', 'before', 'during']);
  });

  it('keeps requests and commits few: no heartbeat every sync, no PUT when nothing changed', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    a.data.tasks.tasks.push(task('t1'));
    await connect(a, 'Work Mac');
    const puts = repo.puts;
    const gets = repo.gets;
    for (let i = 0; i < 5; i++) {
      clock.t += SYNC_INTERVAL_MS;
      await a.svc.syncNow();
    }
    expect(repo.puts).toBe(puts);
    expect(repo.gets - gets).toBe(5); // one folder listing per sync
    clock.t += 7 * 3_600_000;
    await a.svc.syncNow();
    expect(repo.puts).toBe(puts + 1); // the heartbeat, a few times a day
  });

  it('explains a revoked token, pauses background syncs, and resumes once a new token is saved', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    await connect(a, 'Work Mac');
    repo.token = 'github_pat_TEST_ONLY_rotated_token_00000000';
    clock.t += 1000;
    await a.svc.syncNow();
    expect(a.svc.status).toMatchObject({ state: 'error', kind: 'auth' });
    expect((a.svc.status as { message: string }).message).toMatch(/token/i);
    expect((a.svc.status as { message: string }).message).not.toContain(TOKEN);

    await a.svc.saveToken(repo.token);
    await a.svc.syncNow();
    expect(a.svc.status.state).toBe('ok');
  });

  it('refuses to overwrite a repo file it cannot read', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    a.data.tasks.tasks.push(task('t1'));
    await connect(a, 'Work Mac');
    repo.files.set('daybloom/tasks.json', { text: '{ oops', sha: fnv('{ oops') });
    clock.t += 1000;
    await a.svc.syncNow();
    expect(a.svc.status).toMatchObject({ state: 'error', kind: 'invalid' });
    expect(repo.files.get('daybloom/tasks.json')!.text).toBe('{ oops');
    expect(a.data.tasks.tasks.map((t) => t.id)).toEqual(['t1']);
  });

  it('reports a public repo from the connection test', async () => {
    const repo = new FakeRepo();
    repo.isPrivate = false;
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    await a.svc.configure({ repo: 'https://github.com/me/data.git' });
    await a.svc.saveToken(TOKEN);
    const r = await a.svc.test();
    expect(r.repo.private).toBe(false);
    expect(a.svc.config.repo).toBe('me/data');
    expect(a.svc.config.repoPrivate).toBe(false);
  });

  it('disconnect forgets the token and snapshots but leaves the repo alone', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    a.data.tasks.tasks.push(task('t1'));
    await connect(a, 'Work Mac');
    const before = new Map(repo.files);
    await a.svc.disconnect();
    expect(a.secrets.has(TOKEN_ACCOUNT)).toBe(false);
    expect(a.svc.hasToken).toBe(false);
    expect(a.svc.config.enabled).toBe(false);
    for (const k of ['tasks', 'settings', 'progress', 'streaks', 'work', 'tracker', 'crumbs', 'reality', 'waqt']) expect(a.storage.get(BASE_PREFIX + k)).toBe('');
    expect(repo.files).toEqual(before);
    expect(a.data.tasks.tasks.map((t) => t.id)).toEqual(['t1']);
  });

  it('pointing at another repo needs a fresh go-ahead', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    await connect(a, 'Work Mac');
    expect(a.svc.firstSync).toBe(false);
    await a.svc.configure({ deviceName: 'Studio Mac' });
    expect(a.svc.config.enabled).toBe(true);
    await a.svc.configure({ folder: 'elsewhere/' });
    expect(a.svc.config.folder).toBe('elsewhere');
    expect(a.svc.config.enabled).toBe(false);
    expect(a.svc.firstSync).toBe(true);
  });

  it('never syncs from the widget window', async () => {
    const repo = new FakeRepo();
    const w = makeDevice(repo, 'mac-a', 'Work Mac', {}, { canSync: () => false });
    await w.svc.configure({ repo: 'me/data' });
    await w.svc.saveToken(TOKEN);
    await w.svc.enable(true);
    await w.svc.syncNow();
    expect(repo.files.size).toBe(0);
    expect(repo.puts + repo.gets).toBe(0);
  });

  it('syncs on start, ~20 s after local changes settle, and every 5 minutes', async () => {
    vi.useFakeTimers();
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    await connect(a, 'Work Mac');
    const stop = a.svc.start();
    await vi.advanceTimersByTimeAsync(0);
    const listings = () => repo.gets;
    const afterStart = listings();
    expect(afterStart).toBeGreaterThan(0); // the launch sync

    // A local change: nothing for 19 s, then one sync that writes it.
    clock.t += 1000;
    a.data.tasks.tasks.push(task('new'));
    a.touch();
    await vi.advanceTimersByTimeAsync(SETTLE_MS - 1000);
    expect(listings()).toBe(afterStart);
    await vi.advanceTimersByTimeAsync(1000);
    expect(repo.read('tasks.json').tasks.map((t: Task) => t.id)).toEqual(['new']);

    // A store write that matches what's synced (e.g. the sync's own apply) doesn't sync again.
    const settled = listings();
    a.touch();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
    expect(listings()).toBe(settled);

    // The 5-minute heartbeat of polling.
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(listings()).toBe(settled + 1);

    stop();
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);
    expect(listings()).toBe(settled + 1);
  });
});

describe('github sync, addon files', () => {
  /** 09:00 UTC on 19 October 2026. */
  const T = Date.UTC(2026, 9, 19, 9);
  const MIN = 60_000;

  const entry = (id: string, startMin: number, endMin: number | null, p: Partial<Entry> = {}): Entry => ({
    id,
    startMs: T + startMin * MIN,
    endMs: endMin === null ? null : T + endMin * MIN,
    source: 'tracker',
    ...p,
  });

  const invoice = (id: string, number: string, createdAt: number, keys: string[] = []): Invoice => ({
    id,
    number,
    clientId: 'c1',
    currency: 'USD',
    issueDate: '2026-10-19',
    dueDate: '2026-11-02',
    from: '2026-10-01',
    to: '2026-10-31',
    lines: [{ description: 'Work', quantity: 1, unit: 'hour', unitPrice: 10_000, amount: 10_000, sourceKeys: keys }],
    taxPct: 0,
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
  });

  const acme = { id: 'c1', name: 'Acme', currency: 'USD' };
  const entryIds = (f: TrackerFile) => f.entries.map((e) => e.id);
  const numbers = (w: WorkData) => Object.fromEntries(w.invoices.map((i) => [i.id, i.number]));

  function putRaw(repo: FakeRepo, file: string, text: string) {
    repo.files.set(`daybloom/${file}`, { text, sha: fnv(text) });
  }

  it('writes no addon file until an addon is used, then carries it to the other computer', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    await connect(a, 'Work Mac');
    const b = makeDevice(repo, 'pc-b', 'Home PC');
    await connect(b, 'Home PC', 'merge');
    clock.t += SYNC_INTERVAL_MS;
    await a.svc.syncNow();
    await b.svc.syncNow();
    expect(repo.read('work.json')).toBeNull();
    expect(repo.read('tracker.json')).toBeNull();

    // Only the tracker gets used: only tracker.json appears, and B never writes a work.json.
    clock.t += 1000;
    a.data.tracker.entries.push(entry('e1', 0, 30));
    await a.svc.syncNow();
    expect(entryIds(repo.read('tracker.json'))).toEqual(['e1']);
    await b.svc.syncNow();
    expect(entryIds(b.data.tracker)).toEqual(['e1']);
    expect(repo.read('work.json')).toBeNull();
    expect([...repo.files.keys()].filter((k) => !k.includes('device-')).sort()).toEqual([
      'daybloom/progress.json',
      'daybloom/settings.json',
      'daybloom/streaks.json',
      'daybloom/tasks.json',
      'daybloom/tracker.json',
    ]);

    // Settled: another round is one listing each and no writes.
    const puts = repo.puts;
    const gets = repo.gets;
    clock.t += SYNC_INTERVAL_MS;
    await a.svc.syncNow();
    await b.svc.syncNow();
    expect(repo.puts).toBe(puts);
    expect(repo.gets - gets).toBe(2);
  });

  it('a joining computer can adopt the repo’s addon data, or combine its own with it', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    a.data.work = migrateWork({
      clients: [acme],
      projects: [{ id: 'p1', name: 'Site', clientId: 'c1', color: 'focus', rate: { kind: 'hourly', amount: 10_000 }, createdAt: 1 }],
      assignments: { t1: { projectId: 'p1', billable: true } },
      invoices: [invoice('i1', 'INV-2026-0001', 1, ['task:t1@2026-10-19'])],
    });
    a.data.tracker = migrateTrackerFile({ entries: [entry('e1', 0, 30, { taskId: 't1' })], settings: { roundTo: 15 } });
    await connect(a, 'Work Mac');
    expect(repo.read('work.json')).toEqual(a.data.work);
    expect(repo.read('tracker.json')).toEqual(a.data.tracker);

    // "Use the repo's": B's own addon data gives way.
    const b = makeDevice(repo, 'pc-b', 'Home PC');
    b.data.work = migrateWork({ clients: [{ id: 'mine', name: 'Mine', currency: 'USD' }] });
    b.data.tracker = migrateTrackerFile({ entries: [entry('b-old', 100, 110)] });
    await connect(b, 'Home PC', 'replace');
    expect(b.data.work).toEqual(a.data.work);
    expect(b.data.tracker).toEqual(a.data.tracker);

    // "Combine both": C keeps its own, merged as if nothing had been synced before.
    const c = makeDevice(repo, 'mac-c', 'Studio');
    c.data.work = migrateWork({ clients: [{ ...acme, email: 'billing@acme.test' }], invoices: [invoice('i9', 'INV-2026-0001', 5, ['k9'])] });
    c.data.tracker = migrateTrackerFile({ entries: [entry('c-own', 40, 50)] });
    await connect(c, 'Studio', 'merge');
    expect(c.data.work.clients).toEqual([{ ...acme, email: 'billing@acme.test' }]);
    expect(numbers(c.data.work)).toEqual({ i1: 'INV-2026-0001', i9: 'INV-2026-0002' });
    expect(c.data.work.invoicedKeys).toEqual({ 'task:t1@2026-10-19': 'i1', k9: 'i9' });
    expect(entryIds(c.data.tracker)).toEqual(['e1', 'c-own']);
    expect(c.data.tracker.settings.roundTo).toBe(15);
    expect(repo.read('work.json')).toEqual(c.data.work);

    await a.svc.syncNow();
    await b.svc.syncNow();
    expect(synced(a)).toEqual(synced(c));
    expect(synced(b)).toEqual(synced(c));
  });

  it('carries Breadcrumbs, Reality check and Waqt between computers, and never an MCP file', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    const note: Crumb = { id: 'n1', taskId: 't1', title: 'Write', text: 'Stopped at section 2', at: T, source: 'leave' };
    const real: Sample = { id: 't1@2026-10-19', taskId: 't1', title: 'Write', category: 'focus', icon: 'pen', planned: 30, actual: 45, source: 'focus', at: T + 45 * MIN };
    a.data.crumbs = migrateCrumbs({ crumbs: [note], parked: [{ id: 'p1', text: 'Call Sam', at: T + MIN }] });
    a.data.reality = migrateReality({ samples: [real], focus: { [real.id]: 45 * MIN }, backfilledAt: T });
    a.data.waqt = migrateWaqt({ settings: { place: { name: 'Leeds', country: 'GB', lat: 53.8, lng: -1.55 } }, prayed: { '2026-10-19': { fajr: 'prayed' } } });
    await connect(a, 'Work Mac');
    expect(repo.read('crumbs.json')).toEqual(a.data.crumbs);
    expect(repo.read('reality.json')).toEqual(a.data.reality);
    expect(repo.read('waqt.json')).toEqual(a.data.waqt);

    // B saw the same tick arrive with the tasks, but had no focus session for it.
    const b = makeDevice(repo, 'pc-b', 'Home PC');
    b.data.reality = migrateReality({ samples: [{ ...real, actual: 50, source: 'tick' }], backfilledAt: T + 1 });
    await connect(b, 'Home PC', 'merge');
    expect(b.data.crumbs).toEqual(a.data.crumbs);
    expect(b.data.reality.samples).toEqual([real]);
    expect(b.data.waqt).toEqual(a.data.waqt);

    // Apart: B sends the parked thought on, marks Dhuhr and focuses 10 more minutes; A focuses 5 and changes a reminder.
    clock.t += 1000;
    b.data.crumbs.parked = [];
    b.data.waqt.prayed['2026-10-19'].dhuhr = 'jamaat';
    b.data.reality.focus[real.id] += 10 * MIN;
    a.data.reality.focus[real.id] += 5 * MIN;
    a.data.waqt.settings.remind.before = 15;
    await b.svc.syncNow();
    await a.svc.syncNow();
    await b.svc.syncNow();
    expect(synced(a)).toEqual(synced(b));
    expect(a.data.crumbs.parked).toEqual([]);
    expect(a.data.waqt.prayed).toEqual({ '2026-10-19': { fajr: 'prayed', dhuhr: 'jamaat' } });
    expect(b.data.waqt.settings.remind.before).toBe(15);
    expect(a.data.reality.focus).toEqual({ [real.id]: 60 * MIN });
    expect(a.data.reality.backfilledAt).toBe(T + 1);
    expect([...repo.files.keys()].filter((k) => k.includes('mcp'))).toEqual([]);

    // Settled: nothing more to write.
    const puts = repo.puts;
    clock.t += SYNC_INTERVAL_MS;
    await a.svc.syncNow();
    await b.svc.syncNow();
    expect(repo.puts).toBe(puts);
  });

  it('two computers tracking at once: a sha conflict re-fetches, re-merges and retries, leaving one entry running', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    a.data.tracker = migrateTrackerFile({ entries: [entry('e1', 0, 30), entry('e2', 40, 50)] });
    await connect(a, 'Work Mac');
    const b = makeDevice(repo, 'pc-b', 'Home PC');
    await connect(b, 'Home PC', 'replace');
    expect(b.data.tracker).toEqual(a.data.tracker);

    // Apart: A notes e1 and starts tracking; B deletes e2, changes a setting, starts tracking later.
    clock.t += 1000;
    a.data.tracker.entries[0].note = 'Kick-off';
    a.data.tracker.entries.push(entry('a-run', 60, null, { taskId: 'write' }));
    b.data.tracker.entries = b.data.tracker.entries.filter((e) => e.id !== 'e2');
    b.data.tracker.entries.push(entry('b-run', 90, null, { taskId: 'call' }));
    b.data.tracker.settings.roundTo = 15;

    // B's whole sync lands just before A's write of tracker.json.
    let injected = false;
    repo.beforePut = async (path) => {
      if (injected || !path.endsWith('tracker.json')) return;
      injected = true;
      await b.svc.syncNow();
    };
    const conflicts = repo.conflicts;
    await a.svc.syncNow();
    repo.beforePut = null;
    expect(injected).toBe(true);
    expect(repo.conflicts - conflicts).toBe(1);
    expect(a.svc.status.state).toBe('ok');
    expect(b.svc.status.state).toBe('ok');

    await b.svc.syncNow();
    expect(a.data.tracker).toEqual(repo.read('tracker.json'));
    expect(b.data.tracker).toEqual(a.data.tracker);
    const t = a.data.tracker;
    expect(t.entries.map((e) => [e.id, e.endMs])).toEqual([
      ['e1', T + 30 * MIN],
      ['a-run', T + 90 * MIN], // a switch to B's entry, not an overlap
      ['b-run', null],
    ]);
    expect(t.entries[0].note).toBe('Kick-off');
    expect(t.settings.roundTo).toBe(15);

    // Settled: nothing more to write.
    const puts = repo.puts;
    clock.t += SYNC_INTERVAL_MS;
    await a.svc.syncNow();
    await b.svc.syncNow();
    expect(repo.puts).toBe(puts);
  });

  it('two computers that issued the same invoice number at the same moment end with unique numbers', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    a.data.work = migrateWork({ clients: [acme], invoices: [invoice('i1', 'INV-2026-0001', 1, ['k1'])] });
    await connect(a, 'Work Mac');
    const b = makeDevice(repo, 'pc-b', 'Home PC');
    await connect(b, 'Home PC');

    clock.t += 1000;
    a.data.work.invoices.push(invoice('ia', 'INV-2026-0002', 100, ['k2']));
    a.data.work.invoicedKeys.k2 = 'ia';
    b.data.work.invoices.push(invoice('ib', 'INV-2026-0002', 200, ['k2', 'k3']));
    Object.assign(b.data.work.invoicedKeys, { k2: 'ib', k3: 'ib' });
    await Promise.all([a.svc.syncNow(), b.svc.syncNow()]);
    expect(repo.conflicts).toBeGreaterThan(0);
    expect(a.svc.status.state).toBe('ok');
    expect(b.svc.status.state).toBe('ok');

    await a.svc.syncNow();
    await b.svc.syncNow();
    expect(synced(a)).toEqual(synced(b));
    expect(numbers(a.data.work)).toEqual({ i1: 'INV-2026-0001', ia: 'INV-2026-0002', ib: 'INV-2026-0003' });
    // Work both billed stays with the older invoice; nothing billed is missing from the ledger.
    expect(a.data.work.invoicedKeys).toEqual({ k1: 'i1', k2: 'ia', k3: 'ib' });
  });

  it('normalises garbled addon files from the repo instead of trusting them', async () => {
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    await connect(a, 'Work Mac');
    putRaw(
      repo,
      'work.json',
      JSON.stringify({
        version: 9,
        clients: [{ id: 'c1', name: 'Acme', currency: 'eur' }, 'junk', null],
        projects: 'nope',
        assignments: { t1: { projectId: 'ghost' } },
        invoices: [{ id: 'i1', number: 'INV-2026-0001', clientId: 'c1', issueDate: '2026-10-19', createdAt: 1, updatedAt: 1, lines: [{ description: 'x', quantity: 2, unitPrice: 500, sourceKeys: ['k1', 7] }] }],
        invoicedKeys: { stolen: 'i1' },
        profile: { logoDataUrl: 'javascript:alert(1)' },
      }),
    );
    putRaw(
      repo,
      'tracker.json',
      JSON.stringify({
        entries: [{ id: 'r1', startMs: T, endMs: null }, { id: 'r2', startMs: T + 60 * MIN, endMs: null }, { id: 'bad', startMs: 'x' }, null],
        settings: { idleMinutes: 'soon', roundTo: 15 },
      }),
    );
    clock.t += 1000;
    await a.svc.syncNow();
    expect(a.svc.status.state).toBe('ok');
    expect(a.data.work.clients).toEqual([{ id: 'c1', name: 'Acme', currency: 'EUR' }]);
    expect(a.data.work.assignments).toEqual({});
    expect(a.data.work.invoices[0].lines[0]).toMatchObject({ amount: 1000, sourceKeys: ['k1'] });
    expect(a.data.work.invoicedKeys).toEqual({ k1: 'i1' });
    expect(a.data.work.profile).not.toHaveProperty('logoDataUrl');
    expect(a.data.tracker.entries.map((e) => [e.id, e.endMs])).toEqual([
      ['r1', T + 60 * MIN],
      ['r2', null],
    ]);
    expect(a.data.tracker.settings).toMatchObject({ idleMinutes: 5, roundTo: 15 });

    // Not JSON at all: refused, and neither side is overwritten.
    putRaw(repo, 'tracker.json', '{ oops');
    clock.t += 1000;
    await a.svc.syncNow();
    expect(a.svc.status).toMatchObject({ state: 'error', kind: 'invalid' });
    expect(repo.files.get('daybloom/tracker.json')!.text).toBe('{ oops');
    expect(entryIds(a.data.tracker)).toEqual(['r1', 'r2']);
  });

  it('syncs an addon edit ~20 s after it settles', async () => {
    vi.useFakeTimers();
    const repo = new FakeRepo();
    const a = makeDevice(repo, 'mac-a', 'Work Mac');
    await connect(a, 'Work Mac');
    const stop = a.svc.start();
    await vi.advanceTimersByTimeAsync(0);

    clock.t += 1000;
    a.data.work = migrateWork({ clients: [acme] });
    a.touch();
    await vi.advanceTimersByTimeAsync(SETTLE_MS - 1000);
    expect(repo.read('work.json')).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(repo.read('work.json').clients).toEqual([acme]);
    expect(repo.read('tracker.json')).toBeNull();

    clock.t += 1000;
    a.data.tracker.entries.push(entry('e1', 0, null));
    a.touch();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(entryIds(repo.read('tracker.json'))).toEqual(['e1']);
    stop();
  });
});
