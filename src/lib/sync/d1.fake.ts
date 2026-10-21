// A stand-in for Cloudflare's D1 REST API, for tests: one account, any number of databases,
// and just the SQL the client sends (the files table). Replies have Cloudflare's shape,
// including its errors (bad token, missing table, missing database).

import type { FetchLike } from './remote';

export const FAKE_ACCOUNT = '0123456789abcdef0123456789abcdef';
export const FAKE_TOKEN = 'cf_TEST_ONLY_not_a_real_token_000000000000000';

interface Row {
  rev: number;
  body: string;
  device: string;
  updated_at: number;
}

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = (result: unknown) => reply(200, { success: true, errors: [], messages: [], result });
const cfError = (status: number, code: number, message: string) => reply(status, { success: false, errors: [{ code, message }], messages: [], result: null });

export class FakeD1 {
  token = FAKE_TOKEN;
  dbs = new Map<string, { name: string; tables: Map<string, Map<string, Row>> | null; created: string }>();
  queries = 0;
  /** Runs before each write, to simulate another device writing in between. */
  beforeWrite: ((name: string) => void | Promise<void>) | null = null;

  addDatabase(name = 'daybloom-sync', id = crypto.randomUUID()): string {
    this.dbs.set(id, { name, tables: null, created: '2026-10-22T00:00:00.000Z' });
    return id;
  }

  files(id: string): Map<string, Row> {
    return this.dbs.get(id)?.tables?.get('daybloom_files') ?? new Map();
  }

  fetch: FetchLike = async (url, init) => {
    await Promise.resolve();
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (auth !== `Bearer ${this.token}`) return cfError(400, 10000, 'Authentication error');
    const u = new URL(url);
    const m = /^\/client\/v4\/accounts\/([^/]+)\/d1\/database(?:\/([^/]+)(\/query)?)?$/.exec(u.pathname);
    if (!m || m[1] !== FAKE_ACCOUNT) return cfError(404, 7003, 'Could not route to /accounts, perhaps your object identifier is invalid?');
    const [, , id, q] = m;
    const method = init?.method ?? 'GET';
    if (!id && method === 'GET') return ok([...this.dbs].map(([uuid, d]) => ({ uuid, name: d.name, created_at: d.created, file_size: 4096 })));
    if (!id && method === 'POST') {
      const { name } = JSON.parse(String(init?.body));
      if ([...this.dbs.values()].some((d) => d.name === name)) return cfError(400, 7502, 'A database with that name already exists');
      const uuid = this.addDatabase(name);
      return ok({ uuid, name, created_at: this.dbs.get(uuid)!.created });
    }
    const db = id ? this.dbs.get(id) : undefined;
    if (!db) return cfError(404, 7404, 'The database could not be found');
    if (!q) return ok({ uuid: id, name: db.name, created_at: db.created, file_size: 8192 });
    const { sql, params = [] } = JSON.parse(String(init?.body));
    this.queries++;
    return this.run(db, sql, params);
  };

  private async run(db: { tables: Map<string, Map<string, Row>> | null }, sql: string, p: string[]) {
    const done = (results: unknown[], changes = 0) => ok([{ results, success: true, meta: { changes, rows_written: changes } }]);
    if (/^CREATE TABLE IF NOT EXISTS daybloom_files/.test(sql)) {
      db.tables ??= new Map();
      if (!db.tables.has('daybloom_files')) db.tables.set('daybloom_files', new Map());
      return done([]);
    }
    if (/^DROP TABLE IF EXISTS daybloom_files/.test(sql)) {
      db.tables?.delete('daybloom_files');
      return done([]);
    }
    const t = db.tables?.get('daybloom_files');
    if (!t) return cfError(400, 7500, 'no such table: daybloom_files: SQLITE_ERROR');
    if (sql.startsWith('SELECT name, rev FROM daybloom_files')) return done([...t].sort(([a], [b]) => a.localeCompare(b)).map(([name, r]) => ({ name, rev: r.rev })));
    if (sql.startsWith('SELECT body, rev FROM daybloom_files WHERE name = ?')) {
      const r = t.get(p[0]);
      return done(r ? [{ body: r.body, rev: r.rev }] : []);
    }
    if (sql.startsWith('INSERT INTO daybloom_files')) {
      await this.beforeWrite?.(p[0]);
      if (t.has(p[0])) return done([], 0);
      t.set(p[0], { rev: 1, body: p[1], device: p[2], updated_at: Number(p[3]) });
      return done([], 1);
    }
    if (sql.startsWith('UPDATE daybloom_files SET rev = rev + 1')) {
      await this.beforeWrite?.(p[3]);
      const r = t.get(p[3]);
      if (!r || r.rev !== Number(p[4])) return done([], 0);
      t.set(p[3], { rev: r.rev + 1, body: p[0], device: p[1], updated_at: Number(p[2]) });
      return done([], 1);
    }
    if (sql.startsWith('DELETE FROM daybloom_files WHERE name = ? AND rev = ?')) {
      const r = t.get(p[0]);
      if (r && r.rev === Number(p[1])) {
        t.delete(p[0]);
        return done([], 1);
      }
      return done([], 0);
    }
    return cfError(400, 7500, `unsupported in the fake: ${sql.slice(0, 40)}`);
  }
}
