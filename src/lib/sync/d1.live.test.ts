// Live check of Cloudflare D1 sync against a real account, only when asked:
//   D1_LIVE=1 npx vitest run src/lib/sync/d1.live.test.ts
// The token and account ID come from .env (CLOUDFLARE_NEW_API_KEY, CLOUDFLRE_ACCOUNT_ID — the
// app itself takes them in Settings). It works only in a scratch database it creates and
// deletes; nothing else in the account is touched, and no key is ever printed.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateCrumbs } from '../addons/crumbs/migrate';
import { migrateReality } from '../addons/reality/reality';
import { migrateTrackerFile } from '../addons/tracker/migrate';
import { migrateWaqt } from '../addons/waqt/defaults';
import { migrateWork } from '../addons/work/migrate';
import type { Task } from '../engine/types';
import { DEFAULT_SETTINGS } from '../stores/settings.svelte';
import { migrateTrash } from '../stores/trash.svelte';
import type { SyncStores } from './codecs';
import { createD1Account, createD1Client, D1_API } from './d1';
import { createLock, memoryVaultKeeper } from './engine.svelte';
import { createD1Service } from './sync.svelte';
import { isSealed } from './vault';

const LIVE = process.env.D1_LIVE === '1';
const PW = 'live test: a quiet morning walk';

function task(id: string, title: string): Task {
  const t = Date.now();
  return {
    id, title, icon: 'laptop', category: 'focus', date: '2026-10-22', start: 600, duration: 30, notes: '', subtasks: [], recurrence: null, completions: [],
    completedAt: {}, skips: [], overrides: {}, alerts: [], createdAt: t, updatedAt: t, list: 'inbox', priority: null, due: null, energy: null, order: t, doneAt: null, acks: [],
  } as Task;
}

describe.runIf(LIVE)('Cloudflare D1 sync: live', () => {
  let token = '';
  let accountId = '';
  let dbId = '';

  beforeAll(async () => {
    const fs = await import('node:fs');
    const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
    token = env.CLOUDFLARE_NEW_API_KEY ?? env.CLOUDFLARE_API_KEY ?? '';
    accountId = env.CLOUDFLARE_ACCOUNT_ID ?? env.CLOUDFLRE_ACCOUNT_ID ?? '';
    const db = await createD1Account({ accountId, token, fetch }).create(`daybloom-live-${Date.now()}`);
    dbId = db.id;
  }, 60_000);

  afterAll(async () => {
    if (dbId) await fetch(`${D1_API}/accounts/${accountId}/d1/database/${dbId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  }, 60_000);

  function device(id: string) {
    const data = { tasks: { version: 1 as const, tasks: [] as Task[], deleted: [] }, trash: migrateTrash(null) };
    const rest: Record<string, unknown> = {
      settings: structuredClone(DEFAULT_SETTINGS), progress: { version: 1, unlocked: [], viewedAt: 0 }, streaks: { celebrated: 0 },
      work: migrateWork(null), tracker: migrateTrackerFile(null), crumbs: migrateCrumbs(null), reality: migrateReality(null), waqt: migrateWaqt(null),
    };
    const bind = (get: () => any, set: (v: any) => void) => ({ read: () => structuredClone(get()), write: (v: any) => set(structuredClone(v)) });
    const keychain = new Map<string, string>();
    const stores = {
      tasks: bind(() => data.tasks, (v) => (data.tasks = v)),
      trash: { ...bind(() => data.trash, (v) => (data.trash = v)), parse: migrateTrash },
      secrets: { accounts: () => [...keychain.keys()].filter((k) => k.startsWith('ai:')), get: async (a: string) => keychain.get(a) ?? null, set: async (a: string, v: string) => void keychain.set(a, v), delete: async (a: string) => void keychain.delete(a) },
      ...Object.fromEntries(Object.keys(rest).map((k) => [k, bind(() => rest[k], (v) => (rest[k] = v))])),
    } as SyncStores;
    const storage = new Map<string, string>();
    const svc = createD1Service({
      fetch,
      storage: { load: async (k) => storage.get(k) ?? null, save: async (k, v) => void storage.set(k, v) },
      secrets: { get: async (a) => keychain.get(a) ?? null, set: async (a, v) => void keychain.set(a, v), delete: async (a) => void keychain.delete(a) },
      stores: () => stores,
      os: id === 'phone' ? 'android' : 'mac',
      newId: () => `live${id}`,
      vault: memoryVaultKeeper(),
      lock: createLock(),
    });
    return { svc, data, keychain };
  }

  it('two devices sync through a real database that holds only ciphertext', async () => {
    const mac = device('mac');
    await mac.svc.configure({ accountId, databaseId: dbId, deviceName: 'Live Mac' });
    await mac.svc.saveToken(token);
    const t = await mac.svc.test();
    expect(t.hasData).toBe(false);
    const recovery = await mac.svc.createPassword(PW);
    expect(recovery).toHaveLength(26);
    mac.data.tasks.tasks.push(task('live-1', 'Dentist at four'));
    mac.keychain.set('ai:openai', 'sk-LIVE-TEST-not-a-real-key');
    const t0 = performance.now();
    await mac.svc.enable(true);
    console.log(`first sync: ${Math.round(performance.now() - t0)} ms`);
    expect(mac.svc.status).toMatchObject({ state: 'ok' });

    // What Cloudflare stores: names, revisions and sealed bodies.
    const raw = createD1Client({ accountId, databaseId: dbId, token, fetch });
    const rows = await raw.list();
    console.log('rows:', rows.map((r) => r.name).join(', '));
    for (const r of rows) {
      const body = (await raw.get(r.name))!.text;
      if (r.name !== 'vault.json') expect(isSealed(body)).toBe(true);
      expect(body).not.toContain('Dentist');
      expect(body).not.toContain('sk-LIVE');
    }

    const phone = device('phone');
    await phone.svc.configure({ accountId, databaseId: dbId, deviceName: 'Live phone' });
    await phone.svc.saveToken(token);
    expect((await phone.svc.test()).vault).not.toBeNull();
    await expect(phone.svc.unlock('not the password at all')).rejects.toThrow();
    await phone.svc.unlock(PW);
    await phone.svc.enable(true, 'replace');
    expect(phone.data.tasks.tasks.map((x) => x.title)).toEqual(['Dentist at four']);
    expect(phone.keychain.get('ai:openai')).toBe('sk-LIVE-TEST-not-a-real-key');

    // Both edit at once; both end up with both.
    mac.data.tasks.tasks.push(task('live-2', 'Call the bank'));
    phone.data.tasks.tasks.push(task('live-3', 'Water the plants'));
    await Promise.all([mac.svc.syncNow(), phone.svc.syncNow()]);
    await mac.svc.syncNow();
    await phone.svc.syncNow();
    const titles = (d: typeof mac) => d.data.tasks.tasks.map((x) => x.title).sort();
    expect(titles(mac)).toEqual(['Call the bank', 'Dentist at four', 'Water the plants']);
    expect(titles(phone)).toEqual(titles(mac));
    expect(mac.svc.devices.map((d) => d.name).sort()).toEqual(['Live Mac', 'Live phone']);
  }, 180_000);
});
