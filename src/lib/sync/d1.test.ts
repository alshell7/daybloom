import { describe, expect, it } from 'vitest';
import { createD1Account, createD1Client, validAccountId, validDatabaseId } from './d1';
import { FAKE_ACCOUNT, FAKE_TOKEN, FakeD1 } from './d1.fake';
import { sealedRemote, SyncError } from './remote';
import { createVault } from './vault';

function client(fake: FakeD1, databaseId: string, token = FAKE_TOKEN) {
  return createD1Client({ accountId: FAKE_ACCOUNT, databaseId, token, fetch: fake.fetch, device: 'dev1', now: () => 1_000 });
}

async function caught(p: Promise<unknown>): Promise<SyncError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(SyncError);
    return e as SyncError;
  }
  throw new Error('expected a SyncError');
}

describe('D1 client', () => {
  it('checks ids', () => {
    expect(validAccountId(FAKE_ACCOUNT)).toBe(true);
    expect(validAccountId('nope')).toBe(false);
    expect(validDatabaseId('0b5c6c8e-1f3a-4c55-9b0e-2d1f7a3e9c11')).toBe(true);
    expect(validDatabaseId('daybloom')).toBe(false);
  });

  it('lists and creates databases', async () => {
    const fake = new FakeD1();
    fake.addDatabase('other-project');
    const acc = createD1Account({ accountId: FAKE_ACCOUNT, token: FAKE_TOKEN, fetch: fake.fetch });
    const made = await acc.create();
    expect(made.name).toBe('daybloom-sync');
    expect((await acc.databases()).map((d) => d.name)).toEqual(['daybloom-sync', 'other-project']);
  });

  it('reads an empty new database without failing, then writes and reads files', async () => {
    const fake = new FakeD1();
    const d = client(fake, fake.addDatabase());
    expect(await d.list()).toEqual([]);
    expect(await d.get('tasks.json')).toBeNull();
    const a = await d.put('tasks.json', '{"a":1}', null);
    expect(a.version).toBe('1');
    const b = await d.put('tasks.json', '{"a":2}', '1');
    expect(b.version).toBe('2');
    expect(await d.get('tasks.json')).toEqual({ text: '{"a":2}', version: '2' });
    expect(await d.list()).toEqual([{ name: 'tasks.json', version: '2' }]);
  });

  it('catches a write that lost a race', async () => {
    const fake = new FakeD1();
    const id = fake.addDatabase();
    const d = client(fake, id);
    await d.put('tasks.json', 'one', null);
    expect((await caught(d.put('tasks.json', 'stale', null))).kind).toBe('conflict');
    expect((await caught(d.put('tasks.json', 'stale', '7'))).kind).toBe('conflict');
    expect(fake.files(id).get('tasks.json')?.body).toBe('one');
  });

  it('removes a file only at its version', async () => {
    const fake = new FakeD1();
    const id = fake.addDatabase();
    const d = client(fake, id);
    await d.put('device-x.json', '{}', null);
    await d.remove('device-x.json', '9');
    expect(fake.files(id).has('device-x.json')).toBe(true);
    await d.remove('device-x.json', '1');
    expect(fake.files(id).has('device-x.json')).toBe(false);
  });

  it('erases only its own table', async () => {
    const fake = new FakeD1();
    const id = fake.addDatabase();
    const d = client(fake, id);
    await d.put('tasks.json', 'x', null);
    await d.erase();
    expect(fake.dbs.get(id)?.tables?.has('daybloom_files')).toBe(false);
    expect(await d.list()).toEqual([]);
  });

  it('explains a bad token, a missing database and a wrong account, without the token', async () => {
    const fake = new FakeD1();
    const id = fake.addDatabase();
    const bad = await caught(client(fake, id, 'cf_wrong_token_000000000000000000000000000').list());
    expect(bad.kind).toBe('auth');
    expect(bad.message).toMatch(/D1 · Edit/);
    const gone = await caught(client(fake, '0b5c6c8e-1f3a-4c55-9b0e-2d1f7a3e9c11').info());
    expect(gone.kind).toBe('not-found');
    const wrongAcc = await caught(createD1Client({ accountId: 'f'.repeat(32), databaseId: id, token: FAKE_TOKEN, fetch: fake.fetch }).list());
    expect(wrongAcc.kind).toBe('not-found');
    for (const e of [bad, gone, wrongAcc]) expect(e.message).not.toContain(FAKE_TOKEN);
  });

  it('reports offline as a network problem', async () => {
    const d = createD1Client({ accountId: FAKE_ACCOUNT, databaseId: 'x', token: FAKE_TOKEN, fetch: async () => { throw new TypeError('Failed to fetch'); } });
    expect((await caught(d.list())).kind).toBe('network');
  });

  it('refuses a file too big for one row', async () => {
    const fake = new FakeD1();
    const d = client(fake, fake.addDatabase());
    expect((await caught(d.put('tasks.json', 'x'.repeat(2_000_000), null))).message).toMatch(/too big/);
  });

  it('stores only ciphertext when sealed', async () => {
    const fake = new FakeD1();
    const id = fake.addDatabase();
    const { vault } = await createVault('a quiet morning walk');
    const d = sealedRemote(client(fake, id), vault);
    await d.put('tasks.json', '{"title":"Dentist at 4"}', null);
    await d.put('vault.json', JSON.stringify(vault.record), null);
    expect(fake.files(id).get('tasks.json')?.body).not.toContain('Dentist');
    expect(fake.files(id).get('vault.json')?.body).toContain(vault.kid);
    expect((await d.get('tasks.json'))?.text).toBe('{"title":"Dentist at 4"}');
  });

  it('a sealed file from another vault is a vault problem', async () => {
    const fake = new FakeD1();
    const id = fake.addDatabase();
    const a = await createVault('a quiet morning walk');
    const b = await createVault('a quiet morning walk');
    await sealedRemote(client(fake, id), a.vault).put('tasks.json', '{}', null);
    expect((await caught(sealedRemote(client(fake, id), b.vault).get('tasks.json'))).kind).toBe('vault');
  });
});
