// A small client for Cloudflare D1 over its REST API: the user's own account, database and
// API token (entered in Settings, kept in the OS secure store). Sync keeps its files in one
// table, each row a file with a revision number, so a write only lands if nobody wrote in
// between (`WHERE rev = ?` → 0 changes = conflict). Two `daybloom_` tables, so the database
// can be shared with other things. Errors come back as `SyncError` with a message that's
// safe to show — the token is never part of one.

import { SyncError, type FetchLike, type SyncRemote } from './remote';

export const D1_API = 'https://api.cloudflare.com/client/v4';
/** A ready-made token template on the dashboard: Account › D1 › Edit. */
export const D1_TOKEN_URL = 'https://dash.cloudflare.com/profile/api-tokens';
export const D1_DEFAULT_NAME = 'daybloom-sync';
/** D1 rows hold up to 2 MB; leave room for the other columns. */
const MAX_BODY = 1_900_000;

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS daybloom_files (name TEXT PRIMARY KEY, rev INTEGER NOT NULL, body TEXT NOT NULL, device TEXT, updated_at INTEGER)',
];

export interface D1Database {
  id: string;
  name: string;
  /** Bytes, when Cloudflare says. */
  size: number | null;
  createdAt: string | null;
}

interface Options {
  accountId: string;
  token: string;
  fetch: FetchLike;
  now?: () => number;
  api?: string;
}

/** Cloudflare's own error codes that mean "this token can't do that". */
const AUTH_CODES = new Set([10000, 9106, 9109, 10001]);

export function validAccountId(id: string): boolean {
  return /^[0-9a-f]{32}$/i.test(id.trim());
}

export function validDatabaseId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

function createCaller(o: Options) {
  const api = (o.api ?? D1_API).replace(/\/+$/, '');
  const now = o.now ?? Date.now;
  const account = `${api}/accounts/${encodeURIComponent(o.accountId.trim())}`;

  async function call(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<any> {
    let res: Response;
    try {
      res = await o.fetch(`${account}${path}`, {
        method,
        headers: { Authorization: `Bearer ${o.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
    } catch {
      throw new SyncError('network', "Can't reach Cloudflare right now. Daybloom will try again when you're online.");
    }
    let json: any = null;
    try {
      json = JSON.parse(await res.text());
    } catch {
      json = null;
    }
    if (res.ok && json?.success !== false) return json?.result;
    const errors: { code?: number; message?: string }[] = Array.isArray(json?.errors) ? json.errors : [];
    const msg = errors.map((e) => e.message).filter(Boolean).join(' ').slice(0, 300);
    const status = res.status;
    if (status === 429) {
      const after = Number(res.headers.get('retry-after'));
      throw new SyncError('rate-limit', 'Cloudflare asked Daybloom to slow down for a little while.', status, now() + (after > 0 ? after * 1000 : 60_000));
    }
    if (status === 401 || errors.some((e) => AUTH_CODES.has(Number(e.code)))) {
      throw new SyncError('auth', 'Cloudflare didn’t accept this token. Check that it has “D1 · Edit” for this account, or make a new one.', status);
    }
    if (status === 403) throw new SyncError('forbidden', 'This token can’t use D1 on this account. Give it “D1 · Edit”.', status);
    if (status === 404 || /not found|could not route/i.test(msg)) {
      throw new SyncError('not-found', 'Cloudflare can’t find that account or database. Check the account ID, or pick the database again.', status);
    }
    if (status >= 500) throw new SyncError('server', 'Cloudflare is having trouble right now. Daybloom will try again soon.', status);
    throw new SyncError('invalid', msg ? `Cloudflare said: ${msg}` : `Cloudflare refused the request (${status}).`, status);
  }

  return { call };
}

/** The account side: check the token, list and create databases. */
export function createD1Account(o: Options) {
  const { call } = createCaller(o);
  return {
    async databases(): Promise<D1Database[]> {
      const out: D1Database[] = [];
      for (let page = 1; page <= 10; page++) {
        const r = await call('GET', `/d1/database?per_page=100&page=${page}`);
        const list = Array.isArray(r) ? r : [];
        for (const d of list) {
          if (typeof d?.uuid !== 'string') continue;
          out.push({ id: d.uuid, name: String(d.name ?? ''), size: Number.isFinite(d.file_size) ? d.file_size : null, createdAt: typeof d.created_at === 'string' ? d.created_at : null });
        }
        if (list.length < 100) break;
      }
      return out.sort((a, z) => a.name.localeCompare(z.name));
    },
    async create(name = D1_DEFAULT_NAME): Promise<D1Database> {
      const r = await call('POST', '/d1/database', { name });
      return { id: String(r?.uuid ?? ''), name: String(r?.name ?? name), size: 0, createdAt: typeof r?.created_at === 'string' ? r.created_at : null };
    },
  };
}

export interface D1Client extends SyncRemote {
  /** The database's name and size; also proves the token can reach it. */
  info(): Promise<D1Database>;
  /** Creates the sync table if it isn't there yet. */
  ensureSchema(): Promise<void>;
  /** Removes Daybloom's table (and so everything synced there). Other tables are left alone. */
  erase(): Promise<void>;
  /** Requests sent so far. */
  readonly requests: number;
}

export function createD1Client(o: Options & { databaseId: string; device?: string }): D1Client {
  const { call } = createCaller(o);
  const now = o.now ?? Date.now;
  const db = `/d1/database/${encodeURIComponent(o.databaseId.trim())}`;
  let requests = 0;
  let schemaReady = false;

  async function query(sql: string, params: (string | number)[] = []): Promise<{ rows: any[]; changes: number }> {
    requests++;
    const r = await call('POST', `${db}/query`, { sql, params: params.map(String) });
    const first = Array.isArray(r) ? r[0] : null;
    if (first && first.success === false) throw new SyncError('invalid', 'Cloudflare couldn’t run that query.');
    return { rows: Array.isArray(first?.results) ? first.results : [], changes: Number(first?.meta?.changes) || 0 };
  }

  async function ensureSchema() {
    if (schemaReady) return;
    for (const sql of SCHEMA) await query(sql);
    schemaReady = true;
  }

  /** A read on a brand-new database: no table yet means no files yet. */
  async function read<T>(f: () => Promise<T>, empty: T): Promise<T> {
    try {
      return await f();
    } catch (e) {
      if (e instanceof SyncError && e.kind === 'invalid' && /no such table/i.test(e.message)) {
        await ensureSchema();
        return empty;
      }
      throw e;
    }
  }

  return {
    get requests() {
      return requests;
    },

    async info() {
      requests++;
      const r = await call('GET', db);
      return { id: String(r?.uuid ?? o.databaseId), name: String(r?.name ?? ''), size: Number.isFinite(r?.file_size) ? r.file_size : null, createdAt: typeof r?.created_at === 'string' ? r.created_at : null };
    },

    ensureSchema,

    async erase() {
      await query('DROP TABLE IF EXISTS daybloom_files');
      schemaReady = false;
    },

    async list() {
      const { rows } = await read(() => query('SELECT name, rev FROM daybloom_files ORDER BY name'), { rows: [], changes: 0 });
      return rows.map((r) => ({ name: String(r.name), version: String(r.rev) }));
    },

    async get(name) {
      const { rows } = await read(() => query('SELECT body, rev FROM daybloom_files WHERE name = ?', [name]), { rows: [], changes: 0 });
      const r = rows[0];
      return r ? { text: String(r.body), version: String(r.rev) } : null;
    },

    async put(name, text, version) {
      if (new TextEncoder().encode(text).length > MAX_BODY) {
        throw new SyncError('invalid', `${name} has grown too big for one D1 row (about 2 MB). Clearing old history in Daybloom will make room.`);
      }
      await ensureSchema();
      const device = o.device ?? '';
      if (version === null) {
        const r = await query('INSERT INTO daybloom_files (name, rev, body, device, updated_at) VALUES (?, 1, ?, ?, ?) ON CONFLICT(name) DO NOTHING', [name, text, device, now()]);
        if (r.changes === 0) throw new SyncError('conflict', 'That file was created on another device a moment ago.', 409);
        return { version: '1' };
      }
      const rev = Number(version);
      const r = await query('UPDATE daybloom_files SET rev = rev + 1, body = ?, device = ?, updated_at = ? WHERE name = ? AND rev = ?', [text, device, now(), name, rev]);
      if (r.changes === 0) throw new SyncError('conflict', 'That file changed on another device a moment ago.', 409);
      return { version: String(rev + 1) };
    },

    async remove(name, version) {
      await read(() => query('DELETE FROM daybloom_files WHERE name = ? AND rev = ?', [name, Number(version)]), { rows: [], changes: 0 });
    },
  };
}
