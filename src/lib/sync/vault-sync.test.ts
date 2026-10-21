import { describe, expect, it } from 'vitest';
import { migrateTrash } from '../stores/trash.svelte';
import { migrateEventStates } from '../stores/eventStates.svelte';
import { DEFAULT_SETTINGS } from '../stores/settings.svelte';
import { migrateCrumbs } from '../addons/crumbs/migrate';
import { migrateReality } from '../addons/reality/reality';
import { migrateTrackerFile } from '../addons/tracker/migrate';
import { migrateWaqt } from '../addons/waqt/defaults';
import { migrateWork } from '../addons/work/migrate';
import type { Task } from '../engine/types';
import type { SecretStore, SyncStores } from './codecs';
import { FAKE_ACCOUNT, FAKE_TOKEN, FakeD1 } from './d1.fake';
import { createLock, memoryVaultKeeper, type SyncDeps, type VaultKeeper } from './engine.svelte';
import { decodeBase64, encodeBase64, type FetchLike } from './github';
import { parseCalendars, type CalendarsData } from './extra';
import { createD1Service, createSyncService } from './sync.svelte';
import { isSealed } from './vault';

const PW = 'a quiet morning walk';
const GH_TOKEN = 'github_pat_TEST_ONLY_fake_repo_token_0000000';
const clock = { t: 1_760_000_000_000 };

function task(id: string, p: Partial<Task> = {}): Task {
  return {
    id, title: id, icon: 'laptop', category: 'focus', date: '2026-10-19', start: 540, duration: 30, notes: '', subtasks: [], recurrence: null,
    completions: [], completedAt: {}, skips: [], overrides: {}, alerts: [], createdAt: clock.t, updatedAt: clock.t, list: 'inbox', priority: null,
    due: null, energy: null, order: clock.t, doneAt: null, acks: [], ...p,
  } as Task;
}

/** A tiny Contents API: enough for folders, sha conflicts and deletes. */
class FakeRepo {
  files = new Map<string, { text: string; sha: string }>();
  private n = 0;
  fetch: FetchLike = async (url, init) => {
    await Promise.resolve();
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const u = new URL(url);
    const m = /^\/repos\/me\/data(\/contents(?:\/(.*))?)?$/.exec(u.pathname);
    if (!m) return json(404, { message: 'Not Found' });
    if (!m[1]) return json(200, { full_name: 'me/data', private: true, default_branch: 'main', html_url: 'https://github.com/me/data' });
    const path = decodeURIComponent(m[2] ?? '');
    const method = init?.method ?? 'GET';
    if (method === 'PUT') {
      const body = JSON.parse(String(init!.body));
      const cur = this.files.get(path);
      if ((cur && body.sha !== cur.sha) || (!cur && body.sha)) return json(409, { message: 'does not match' });
      const sha = `s${++this.n}`;
      this.files.set(path, { text: decodeBase64(body.content), sha });
      return json(cur ? 200 : 201, { content: { sha, path } });
    }
    if (method === 'DELETE') {
      const body = JSON.parse(String(init!.body));
      const cur = this.files.get(path);
      if (!cur) return json(404, { message: 'Not Found' });
      if (cur.sha !== body.sha) return json(409, { message: 'does not match' });
      this.files.delete(path);
      return json(200, {});
    }
    const f = this.files.get(path);
    const name = (p: string) => p.split('/').pop()!;
    if (f) return json(200, { type: 'file', name: name(path), path, sha: f.sha, size: f.text.length, encoding: 'base64', content: encodeBase64(f.text) });
    const prefix = path ? `${path}/` : '';
    const entries = new Map<string, unknown>();
    for (const [p, x] of this.files) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      const dir = rest.includes('/') ? rest.split('/')[0] : null;
      if (dir) entries.set(dir, { type: 'dir', name: dir, path: prefix + dir, sha: 'd', size: 0 });
      else entries.set(rest, { type: 'file', name: rest, path: p, sha: x.sha, size: x.text.length });
    }
    return entries.size ? json(200, [...entries.values()]) : json(404, { message: 'Not Found' });
  };
}

interface Dev {
  data: { tasks: { version: 1; tasks: Task[]; deleted: [] }; trash: ReturnType<typeof migrateTrash>; eventStates: ReturnType<typeof migrateEventStates>; calendars: CalendarsData };
  keychain: Map<string, string>;
  deps: SyncDeps;
}

function device(fetch: FetchLike, id: string, keeper: VaultKeeper = memoryVaultKeeper()): Dev {
  const data: Dev['data'] = { tasks: { version: 1, tasks: [], deleted: [] }, trash: migrateTrash(null), eventStates: migrateEventStates(null), calendars: { version: 1, accounts: [] } };
  const rest: Record<string, unknown> = {
    settings: structuredClone(DEFAULT_SETTINGS),
    progress: { version: 1, unlocked: [], viewedAt: 0 },
    streaks: { celebrated: 0 },
    work: migrateWork(null),
    tracker: migrateTrackerFile(null),
    crumbs: migrateCrumbs(null),
    reality: migrateReality(null),
    waqt: migrateWaqt(null),
  };
  const bind = (get: () => any, set: (v: any) => void) => ({ read: () => structuredClone(get()), write: (v: any) => set(structuredClone(v)) });
  const keychain = new Map<string, string>();
  const secrets: SecretStore = {
    accounts: () => [...keychain.keys()].filter((k) => k.startsWith('ai:')).concat(data.calendars.accounts.map((c) => `${c.id}:url`)),
    get: async (a) => keychain.get(a) ?? null,
    set: async (a, v) => void keychain.set(a, v),
    delete: async (a) => void keychain.delete(a),
  };
  const stores: SyncStores = {
    tasks: bind(() => data.tasks, (v) => (data.tasks = v)),
    trash: { ...bind(() => data.trash, (v) => (data.trash = v)), parse: migrateTrash },
    eventStates: { ...bind(() => data.eventStates, (v) => (data.eventStates = v)), parse: migrateEventStates },
    calendars: { ...bind(() => data.calendars, (v) => (data.calendars = v)), parse: parseCalendars },
    secrets,
    ...Object.fromEntries(Object.keys(rest).map((k) => [k, bind(() => rest[k], (v) => (rest[k] = v))])),
  } as SyncStores;
  const storage = new Map<string, string>();
  return {
    data,
    keychain,
    deps: {
      fetch,
      storage: { load: async (k) => storage.get(k) ?? null, save: async (k, v) => void storage.set(k, v) },
      secrets: { get: async (a) => keychain.get(a) ?? null, set: async (a, v) => void keychain.set(a, v), delete: async (a) => void keychain.delete(a) },
      stores: () => stores,
      os: 'mac',
      now: () => clock.t,
      sleep: async () => {},
      newId: () => id,
      vault: keeper,
      lock: createLock(),
    },
  };
}

async function d1Device(fake: FakeD1, dbId: string, id: string) {
  const d = device(fake.fetch, id);
  const svc = createD1Service(d.deps);
  await svc.configure({ accountId: FAKE_ACCOUNT, databaseId: dbId, deviceName: id });
  await svc.saveToken(FAKE_TOKEN);
  return { ...d, svc };
}

describe('Cloudflare D1 sync', () => {
  it('needs the master password before it turns on', async () => {
    const fake = new FakeD1();
    const a = await d1Device(fake, fake.addDatabase(), 'a');
    await expect(a.svc.enable(true)).rejects.toThrow(/master password/);
    expect(a.svc.config.enabled).toBe(false);
  });

  it('syncs two devices through ciphertext only', async () => {
    const fake = new FakeD1();
    const db = fake.addDatabase();
    const a = await d1Device(fake, db, 'devA');
    const recovery = await a.svc.createPassword(PW);
    expect(recovery).toMatch(/^[0-9A-Z]{26}$/);
    a.data.tasks.tasks.push(task('t1', { title: 'Dentist at four' }));
    await a.svc.enable(true);
    expect(a.svc.status).toMatchObject({ state: 'ok' });

    const rows = fake.files(db);
    expect([...rows.keys()]).toContain('vault.json');
    for (const [name, r] of rows) if (name !== 'vault.json') expect(isSealed(r.body)).toBe(true);
    expect([...rows.values()].some((r) => r.body.includes('Dentist'))).toBe(false);

    const b = await d1Device(fake, db, 'devB');
    const t = await b.svc.test();
    expect(t.hasData).toBe(true);
    expect(t.vault?.kid).toBeTruthy();
    await expect(b.svc.unlock('the wrong words here')).rejects.toThrow(/doesn't open/);
    await b.svc.unlock(PW);
    await b.svc.enable(true, 'replace');
    expect(b.data.tasks.tasks.map((x) => x.title)).toEqual(['Dentist at four']);

    b.data.tasks.tasks.push(task('t2', { title: 'Call the bank' }));
    await b.svc.syncNow();
    await a.svc.syncNow();
    expect(a.data.tasks.tasks.map((x) => x.id).sort()).toEqual(['t1', 't2']);
    expect(a.svc.devices.map((d) => d.name).sort()).toEqual(['devA', 'devB']);
  });

  it('a device without the key waits kindly instead of failing', async () => {
    const fake = new FakeD1();
    const db = fake.addDatabase();
    const a = await d1Device(fake, db, 'a');
    await a.svc.createPassword(PW);
    await a.svc.enable(true);
    await a.deps.vault!.set(null); // e.g. the keychain was cleared
    await a.svc.syncNow();
    expect(a.svc.status).toMatchObject({ state: 'error', kind: 'locked' });
  });

  it('opens with the recovery key, then takes a new password', async () => {
    const fake = new FakeD1();
    const db = fake.addDatabase();
    const a = await d1Device(fake, db, 'a');
    const recovery = (await a.svc.createPassword(PW))!;
    await a.svc.enable(true);
    const b = await d1Device(fake, db, 'b');
    await b.svc.unlock(recovery.toLowerCase(), 'recovery');
    await b.svc.changePassword('a brand new long phrase');
    await b.svc.enable(true, 'merge');
    // The new password is what opens it now, everywhere.
    const c = await d1Device(fake, db, 'c');
    await expect(c.svc.unlock(PW)).rejects.toThrow();
    await c.svc.unlock('a brand new long phrase');
    expect(await c.svc.checkPassword('a brand new long phrase')).toBe(true);
  });

  it('secrets travel only inside the vault', async () => {
    const fake = new FakeD1();
    const db = fake.addDatabase();
    const a = await d1Device(fake, db, 'a');
    a.keychain.set('ai:openai', 'sk-TEST-only-key');
    a.keychain.set('d1-sync', FAKE_TOKEN);
    await a.svc.createPassword(PW);
    await a.svc.enable(true);
    expect([...fake.files(db).values()].some((r) => r.body.includes('sk-TEST'))).toBe(false);

    const b = await d1Device(fake, db, 'b');
    await b.svc.unlock(PW);
    await b.svc.enable(true, 'replace');
    expect(b.keychain.get('ai:openai')).toBe('sk-TEST-only-key');
    // Only syncable accounts move: never sync tokens or the vault.
    expect(b.keychain.get('d1-sync')).toBe(FAKE_TOKEN); // its own, saved by saveToken
    a.keychain.set('ai:openai', 'sk-TEST-rotated');
    await a.svc.syncNow();
    await b.svc.syncNow();
    expect(b.keychain.get('ai:openai')).toBe('sk-TEST-rotated');
    b.keychain.delete('ai:openai');
    await b.svc.syncNow();
    await a.svc.syncNow();
    expect(a.keychain.has('ai:openai')).toBe(false);
  });

  it('syncs the Trash and calendar marks', async () => {
    const fake = new FakeD1();
    const db = fake.addDatabase();
    const a = await d1Device(fake, db, 'a');
    await a.svc.createPassword(PW);
    a.data.trash.items.push({ id: 'x1', at: clock.t, task: task('gone') });
    a.data.eventStates.states['cal:g:e1'] = { at: clock.t, done: clock.t };
    await a.svc.enable(true);
    const b = await d1Device(fake, db, 'b');
    await b.svc.unlock(PW);
    await b.svc.enable(true, 'replace');
    expect(b.data.trash.items.map((x) => x.id)).toEqual(['x1']);
    expect(Object.keys(b.data.eventStates.states)).toEqual(['cal:g:e1']);
    // Restoring on one device clears it from the other's Trash too.
    b.data.trash.items = [];
    await b.svc.syncNow();
    await a.svc.syncNow();
    expect(a.data.trash.items).toEqual([]);
  });

  it('a calendar and its link reach a new device together', async () => {
    const fake = new FakeD1();
    const db = fake.addDatabase();
    const a = await d1Device(fake, db, 'a');
    await a.svc.createPassword(PW);
    a.data.calendars.accounts.push({ id: 'ics:abc', provider: 'ics', label: 'School', calendars: [{ id: 'main', name: 'School', color: '#4a8', enabled: true }], enabled: true, urlInKeychain: true });
    a.keychain.set('ics:abc:url', 'https://example.test/private-feed-TEST.ics');
    await a.svc.enable(true);
    expect([...fake.files(db).values()].some((r) => r.body.includes('private-feed'))).toBe(false);
    const b = await d1Device(fake, db, 'b');
    await b.svc.unlock(PW);
    await b.svc.enable(true, 'replace');
    expect(b.data.calendars.accounts.map((c) => c.label)).toEqual(['School']);
    expect(b.keychain.get('ics:abc:url')).toBe('https://example.test/private-feed-TEST.ics');
  });

  it('disconnecting can erase the cloud copy', async () => {
    const fake = new FakeD1();
    const db = fake.addDatabase();
    const a = await d1Device(fake, db, 'a');
    await a.svc.createPassword(PW);
    await a.svc.enable(true);
    await a.svc.disconnect({ erase: true });
    expect(fake.dbs.get(db)?.tables?.has('daybloom_files')).toBe(false);
    expect(a.keychain.has('d1-sync')).toBe(false);
  });

  it('creates a database for Daybloom and picks it', async () => {
    const fake = new FakeD1();
    fake.addDatabase('someone-elses-project');
    const d = device(fake.fetch, 'a');
    const svc = createD1Service(d.deps);
    await svc.configure({ accountId: FAKE_ACCOUNT });
    await svc.saveToken(FAKE_TOKEN);
    const db = await svc.createDatabase();
    expect(db.name).toBe('daybloom-sync');
    expect(svc.config.databaseId).toBe(db.id);
    expect((await svc.databases()).map((x) => x.name)).toEqual(['daybloom-sync', 'someone-elses-project']);
    // Asking again reuses it.
    expect((await svc.createDatabase()).id).toBe(db.id);
  });
});

describe('GitHub Sync with the vault', () => {
  async function ghDevice(repo: FakeRepo, id: string, keeper?: VaultKeeper) {
    const d = device(repo.fetch, id, keeper);
    const svc = createSyncService(d.deps);
    await svc.configure({ repo: 'me/data', deviceName: id });
    await svc.saveToken(GH_TOKEN);
    return { ...d, svc };
  }

  it('moves to a sealed vault folder and removes the plain files', async () => {
    const repo = new FakeRepo();
    const a = await ghDevice(repo, 'a');
    a.data.tasks.tasks.push(task('t1', { title: 'Plain at first' }));
    await a.svc.enable(true);
    expect(repo.files.has('daybloom/tasks.json')).toBe(true);

    await a.svc.createPassword(PW);
    await a.svc.setEncrypted(true);
    expect(a.svc.status).toMatchObject({ state: 'ok' });
    expect(repo.files.has('daybloom/tasks.json')).toBe(false);
    expect(repo.files.has('daybloom/vault/vault.json')).toBe(true);
    expect(isSealed(repo.files.get('daybloom/vault/tasks.json')!.text)).toBe(true);
    expect([...repo.files.values()].some((f) => f.text.includes('Plain at first'))).toBe(false);
  });

  it('a plain device stops when the repo turns encrypted, and an old device’s plain file is folded in', async () => {
    const repo = new FakeRepo();
    const a = await ghDevice(repo, 'a');
    const b = await ghDevice(repo, 'b');
    await a.svc.enable(true);
    await b.svc.enable(true, 'merge');
    await a.svc.createPassword(PW);
    await a.svc.setEncrypted(true);

    b.data.tasks.tasks.push(task('late', { title: 'Written in the clear' }));
    await b.svc.syncNow();
    expect(b.svc.status).toMatchObject({ state: 'error', kind: 'locked' });
    expect(repo.files.has('daybloom/tasks.json')).toBe(false);

    // An older app version that doesn't know about the vault still writes a plain file…
    repo.files.set('daybloom/tasks.json', { text: JSON.stringify({ version: 1, tasks: [task('old', { title: 'From an old app' })] }), sha: 'old1' });
    await a.svc.syncNow();
    // …which the sealed device folds in, then removes.
    expect(a.data.tasks.tasks.map((x) => x.id)).toContain('old');
    expect(repo.files.has('daybloom/tasks.json')).toBe(false);
  });

  it('turning the vault off needs the password, and other devices follow', async () => {
    const repo = new FakeRepo();
    const a = await ghDevice(repo, 'a');
    await a.svc.createPassword(PW);
    await a.svc.enable(true);
    await a.svc.setEncrypted(true);
    const b = await ghDevice(repo, 'b');
    await b.svc.unlock(PW);
    await b.svc.setEncrypted(true);
    await b.svc.enable(true, 'merge');
    expect(b.svc.status).toMatchObject({ state: 'ok' });

    await expect(a.svc.setEncrypted(false, 'not my password at all')).rejects.toThrow();
    a.data.tasks.tasks.push(task('t9'));
    await a.svc.setEncrypted(false, PW);
    expect(repo.files.has('daybloom/vault/vault.json')).toBe(false);
    expect(repo.files.has('daybloom/tasks.json')).toBe(true);

    await b.svc.syncNow();
    expect(b.svc.config.encrypted).toBe(false);
    expect(b.data.tasks.tasks.map((x) => x.id)).toContain('t9');
  });

  it('plain GitHub never writes calendars or secrets', async () => {
    const repo = new FakeRepo();
    const a = await ghDevice(repo, 'a');
    a.data.calendars.accounts.push({ id: 'ics:abc', provider: 'ics', label: 'School', calendars: [], enabled: true });
    a.keychain.set('ai:openai', 'sk-TEST-only-key');
    await a.svc.enable(true);
    expect([...repo.files.keys()].filter((k) => /calendars|secrets/.test(k))).toEqual([]);
    expect([...repo.files.values()].some((f) => f.text.includes('sk-TEST'))).toBe(false);
  });

  it('one vault serves both services', async () => {
    const repo = new FakeRepo();
    const fake = new FakeD1();
    const keeper = memoryVaultKeeper();
    const gh = await ghDevice(repo, 'a', keeper);
    const recovery = await gh.svc.createPassword(PW);
    expect(recovery).toBeTruthy();
    const d = device(fake.fetch, 'a', keeper);
    const d1 = createD1Service(d.deps);
    // Same password: no second recovery key.
    expect(await d1.createPassword(PW)).toBeNull();
    await expect(d1.createPassword('some other long phrase')).rejects.toThrow();
  });
});
