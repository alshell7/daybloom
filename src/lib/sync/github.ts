// A small client for the GitHub Contents API: just what sync needs (read a repo,
// list a folder, read a file, write a file with optimistic concurrency). Errors come
// back as `GitHubError` with a kind and a message that's safe to show — the token is
// never part of one.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GitHubErrorKind =
  | 'auth' // 401: bad, expired or revoked token
  | 'forbidden' // 403: token lacks a permission
  | 'not-found' // 404: no such repo, or the token can't see it
  | 'branch' // the branch doesn't exist
  | 'conflict' // 409/422: the file changed since we read it
  | 'rate-limit' // 403/429 with the limit exhausted
  | 'network' // fetch itself failed (offline, DNS, TLS)
  | 'server' // 5xx
  | 'invalid'; // anything else GitHub refused, or a file we can't read

export class GitHubError extends Error {
  readonly kind: GitHubErrorKind;
  readonly status: number;
  /** For `rate-limit`: when GitHub says we may try again (epoch ms). */
  readonly retryAt: number | null;
  constructor(kind: GitHubErrorKind, message: string, status = 0, retryAt: number | null = null) {
    super(message);
    this.name = 'GitHubError';
    this.kind = kind;
    this.status = status;
    this.retryAt = retryAt;
  }
}

export interface RepoRef {
  owner: string;
  repo: string;
}

/** Accepts `owner/name`, `https://github.com/owner/name(.git)` or `git@github.com:owner/name.git`. */
export function parseRepo(input: string): RepoRef | null {
  let s = (input ?? '').trim();
  let fromUrl = false;
  if (/^git@github\.com:/i.test(s)) {
    s = s.replace(/^git@github\.com:/i, '');
    fromUrl = true;
  } else if (/^(https?:\/\/)?(www\.)?github\.com\//i.test(s)) {
    s = s.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '');
    fromUrl = true;
  }
  s = s.replace(/[?#].*$/, '').replace(/\/+$/, '');
  let parts = s.split('/');
  if (fromUrl && parts.length > 2) parts = parts.slice(0, 2);
  if (parts.length !== 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) return null;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo) || repo === '.' || repo === '..') return null;
  return { owner, repo };
}

/** UTF-8 safe base64 (btoa alone only handles Latin-1). */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function decodeBase64(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export interface RepoInfo {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
}

export interface DirEntry {
  name: string;
  path: string;
  sha: string;
  type: string;
  size: number;
}

export interface RemoteFile {
  text: string;
  sha: string;
}

export interface GitHubClientOptions extends RepoRef {
  branch: string;
  token: string;
  fetch: FetchLike;
  /** Defaults to https://api.github.com. */
  api?: string;
  now?: () => number;
}

export interface GitHubClient {
  /** GET /repos/{owner}/{repo}. */
  getRepo(): Promise<RepoInfo>;
  /** Entries of a folder on the branch; [] when the folder (or the whole repo) is empty. */
  listDir(path: string): Promise<DirEntry[]>;
  /** A file's text and blob sha, or null when it doesn't exist. */
  getFile(path: string): Promise<RemoteFile | null>;
  /** Create (`sha` null) or update a file. Throws `conflict` when `sha` is stale. */
  putFile(path: string, text: string, sha: string | null, message: string): Promise<{ sha: string }>;
  /** Requests sent so far (handy for tests and for keeping an eye on the rate limit). */
  readonly requests: number;
}

interface Reply {
  status: number;
  body: any;
  headers: Headers;
}

export function createGitHubClient(o: GitHubClientOptions): GitHubClient {
  const api = (o.api ?? 'https://api.github.com').replace(/\/+$/, '');
  const now = o.now ?? Date.now;
  const repoUrl = `${api}/repos/${encodeURIComponent(o.owner)}/${encodeURIComponent(o.repo)}`;
  const name = `${o.owner}/${o.repo}`;
  // Conditional GETs: a 304 doesn't count against the rate limit.
  const etags = new Map<string, { etag: string; body: unknown }>();
  let requests = 0;

  const contentsUrl = (path: string, withRef: boolean) => {
    const p = path
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    return `${repoUrl}/contents${p ? `/${p}` : ''}${withRef ? `?ref=${encodeURIComponent(o.branch)}` : ''}`;
  };

  async function request(method: 'GET' | 'PUT', url: string, body?: unknown): Promise<Reply> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${o.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const cached = method === 'GET' ? etags.get(url) : undefined;
    if (cached) headers['If-None-Match'] = cached.etag;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    requests++;
    let res: Response;
    try {
      res = await o.fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
    } catch {
      throw new GitHubError('network', "Can't reach GitHub right now. Daybloom will try again when you're online.");
    }
    if (res.status === 304 && cached) return { status: 200, body: clone(cached.body), headers: res.headers };
    const text = await res.text().catch(() => '');
    let json: any = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    const etag = res.headers.get('etag');
    if (method === 'GET' && res.status === 200 && etag) etags.set(url, { etag, body: clone(json) });
    return { status: res.status, body: json, headers: res.headers };
  }

  function messageOf(r: Reply): string {
    return typeof r.body?.message === 'string' ? r.body.message : '';
  }

  const isMissingRef = (msg: string) => /no commit found for the ref|branch .*not found|reference does not exist/i.test(msg);

  function fail(r: Reply, op: 'read' | 'write'): never {
    const msg = messageOf(r);
    const { status, headers } = r;
    if (status === 403 || status === 429) {
      const remaining = headers.get('x-ratelimit-remaining');
      const retryAfter = Number(headers.get('retry-after'));
      if (remaining === '0' || retryAfter > 0 || /rate limit/i.test(msg)) {
        const reset = Number(headers.get('x-ratelimit-reset'));
        const retryAt = retryAfter > 0 ? now() + retryAfter * 1000 : reset > 0 ? reset * 1000 : now() + 60_000;
        throw new GitHubError('rate-limit', 'GitHub asked Daybloom to slow down for a little while.', status, retryAt);
      }
    }
    if (status === 401) {
      throw new GitHubError('auth', "GitHub didn't accept this token. It may have expired or been revoked — paste a new one.", status);
    }
    if (status === 403) {
      throw new GitHubError(
        'forbidden',
        op === 'write'
          ? `This token can't write to ${name}. Give it “Contents: Read and write” for this repo.`
          : `This token can't read ${name}. Make sure the repo is selected for the token.`,
        status,
      );
    }
    if (status === 404 || status === 422) {
      if (isMissingRef(msg)) throw new GitHubError('branch', `There's no branch “${o.branch}” in ${name} yet.`, status);
    }
    if (status === 404) {
      throw new GitHubError('not-found', `Couldn't find ${name}. Check the name, and that the token was given access to it.`, status);
    }
    if (status === 409 || (status === 422 && /sha/i.test(msg))) {
      throw new GitHubError('conflict', 'That file changed on GitHub a moment ago.', status);
    }
    if (status >= 500) throw new GitHubError('server', 'GitHub is having trouble right now. Daybloom will try again soon.', status);
    throw new GitHubError('invalid', msg ? `GitHub said: ${msg}` : `GitHub refused the request (${status}).`, status);
  }

  // A repo with no commits yet has no branch at all; the first write creates it.
  let emptyRepo = false;

  /** 404/409 on a read: missing path, or an empty repo. A missing branch is still an error. */
  function isAbsent(r: Reply): boolean {
    if (r.status !== 404 && r.status !== 409) return false;
    const msg = messageOf(r);
    if (/repository is empty/i.test(msg)) emptyRepo = true;
    if (isMissingRef(msg)) return false;
    return true;
  }

  return {
    get requests() {
      return requests;
    },

    async getRepo() {
      const r = await request('GET', repoUrl);
      if (r.status !== 200 || !r.body) fail(r, 'read');
      return {
        fullName: String(r.body.full_name ?? name),
        private: r.body.private === true,
        defaultBranch: String(r.body.default_branch ?? 'main'),
        htmlUrl: String(r.body.html_url ?? `https://github.com/${name}`),
      };
    },

    async listDir(path) {
      const r = await request('GET', contentsUrl(path, true));
      if (isAbsent(r)) return [];
      if (r.status !== 200) fail(r, 'read');
      if (!Array.isArray(r.body)) return [];
      return r.body.map((e: any) => ({
        name: String(e?.name ?? ''),
        path: String(e?.path ?? ''),
        sha: String(e?.sha ?? ''),
        type: String(e?.type ?? ''),
        size: Number(e?.size) || 0,
      }));
    },

    async getFile(path) {
      const r = await request('GET', contentsUrl(path, true));
      if (isAbsent(r)) return null;
      if (r.status !== 200) fail(r, 'read');
      const b = r.body;
      if (!b || Array.isArray(b) || b.type !== 'file' || typeof b.sha !== 'string') return null;
      if (b.encoding === 'base64' && typeof b.content === 'string' && (b.content !== '' || !b.size)) {
        return { text: decodeBase64(b.content), sha: b.sha };
      }
      // Files over 1 MB come back without content; the blob API still has them.
      const blob = await request('GET', `${repoUrl}/git/blobs/${encodeURIComponent(b.sha)}`);
      if (blob.status !== 200 || typeof blob.body?.content !== 'string') fail(blob, 'read');
      return { text: decodeBase64(blob.body.content), sha: b.sha };
    },

    async putFile(path, text, sha, message) {
      const body: Record<string, unknown> = { message, content: encodeBase64(text), branch: o.branch };
      if (sha) body.sha = sha;
      let r = await request('PUT', contentsUrl(path, false), body);
      if (emptyRepo && !sha && (r.status === 404 || r.status === 422) && isMissingRef(messageOf(r))) {
        // Some empty repos refuse a named branch; the very first commit then makes the default one.
        delete body.branch;
        r = await request('PUT', contentsUrl(path, false), body);
      }
      if (r.status !== 200 && r.status !== 201) fail(r, 'write');
      emptyRepo = false;
      return { sha: String(r.body?.content?.sha ?? '') };
    },
  };
}

function clone<T>(v: T): T {
  return v === null || v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}
