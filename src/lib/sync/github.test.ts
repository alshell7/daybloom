import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient, decodeBase64, encodeBase64, GitHubError, parseRepo, type FetchLike } from './github';

const TOKEN = 'github_pat_TEST_ONLY_not_a_real_token_000000';

function reply(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function client(fetch: FetchLike, branch = 'main') {
  return createGitHubClient({ owner: 'me', repo: 'daybloom-data', branch, token: TOKEN, fetch, now: () => 1_000_000 });
}

async function caught(p: Promise<unknown>): Promise<GitHubError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(GitHubError);
    return e as GitHubError;
  }
  throw new Error('expected a GitHubError');
}

describe('helpers', () => {
  it('round-trips UTF-8 through base64', () => {
    const s = 'Café ☕ — 日本語 🌸 “quotes”\n';
    expect(decodeBase64(encodeBase64(s))).toBe(s);
    // GitHub wraps base64 at 60 columns.
    const wrapped = encodeBase64(s).replace(/(.{10})/g, '$1\n');
    expect(decodeBase64(wrapped)).toBe(s);
    const big = 'x🌸'.repeat(50_000);
    expect(decodeBase64(encodeBase64(big))).toBe(big);
  });

  it('parses repo names in the forms people paste', () => {
    expect(parseRepo('me/daybloom-data')).toEqual({ owner: 'me', repo: 'daybloom-data' });
    expect(parseRepo(' https://github.com/me/daybloom-data.git ')).toEqual({ owner: 'me', repo: 'daybloom-data' });
    expect(parseRepo('github.com/me/daybloom-data/tree/main')).toEqual({ owner: 'me', repo: 'daybloom-data' });
    expect(parseRepo('git@github.com:me/daybloom.data.git')).toEqual({ owner: 'me', repo: 'daybloom.data' });
    expect(parseRepo('daybloom')).toBeNull();
    expect(parseRepo('me/../x')).toBeNull();
    expect(parseRepo('-bad/name')).toBeNull();
  });
});

describe('createGitHubClient', () => {
  it('sends auth and API version headers and reads repo privacy', async () => {
    const fetch = vi.fn<FetchLike>(async () => reply(200, { full_name: 'me/daybloom-data', private: false, default_branch: 'main', html_url: 'https://github.com/me/daybloom-data' }));
    const repo = await client(fetch).getRepo();
    expect(repo).toEqual({ fullName: 'me/daybloom-data', private: false, defaultBranch: 'main', htmlUrl: 'https://github.com/me/daybloom-data' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/me/daybloom-data');
    const h = init!.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(h['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('reads a file on the branch and decodes it', async () => {
    const fetch = vi.fn<FetchLike>(async () => reply(200, { type: 'file', sha: 'abc', size: 9, encoding: 'base64', content: encodeBase64('{"a":"é"}') }));
    const f = await client(fetch, 'sync').getFile('daybloom/tasks.json');
    expect(f).toEqual({ text: '{"a":"é"}', sha: 'abc' });
    expect(fetch.mock.calls[0][0]).toBe('https://api.github.com/repos/me/daybloom-data/contents/daybloom/tasks.json?ref=sync');
  });

  it('falls back to the blob API for files over 1 MB', async () => {
    const fetch = vi.fn<FetchLike>(async (url) =>
      url.includes('/git/blobs/')
        ? reply(200, { sha: 'big', encoding: 'base64', content: encodeBase64('{"big":true}') })
        : reply(200, { type: 'file', sha: 'big', size: 2_000_000, encoding: 'none', content: '' }),
    );
    expect(await client(fetch).getFile('daybloom/tasks.json')).toEqual({ text: '{"big":true}', sha: 'big' });
    expect(fetch.mock.calls[1][0]).toBe('https://api.github.com/repos/me/daybloom-data/git/blobs/big');
  });

  it('treats an empty repo and a missing folder as empty, not as errors', async () => {
    const empty = vi.fn<FetchLike>(async () => reply(404, { message: 'This repository is empty.' }));
    expect(await client(empty).listDir('daybloom')).toEqual([]);
    expect(await client(empty).getFile('daybloom/tasks.json')).toBeNull();
    const missing = vi.fn<FetchLike>(async () => reply(404, { message: 'Not Found' }));
    expect(await client(missing).listDir('daybloom')).toEqual([]);
  });

  it('creates the first file in an empty repo, retrying without a branch if GitHub insists', async () => {
    const calls: any[] = [];
    const fetch = vi.fn<FetchLike>(async (url, init) => {
      if (init?.method !== 'PUT') return reply(404, { message: 'This repository is empty.' });
      const body = JSON.parse(String(init.body));
      calls.push(body);
      if (body.branch) return reply(404, { message: 'Branch main not found' });
      return reply(201, { content: { sha: 'first' } });
    });
    const gh = client(fetch);
    expect(await gh.listDir('daybloom')).toEqual([]);
    expect(await gh.putFile('daybloom/tasks.json', '{}\n', null, 'Daybloom sync from Mac')).toEqual({ sha: 'first' });
    expect(calls.map((c) => c.branch)).toEqual(['main', undefined]);
  });

  it('reports a branch that does not exist', async () => {
    const fetch = vi.fn<FetchLike>(async () => reply(404, { message: 'No commit found for the ref nope' }));
    const e = await caught(client(fetch, 'nope').listDir('daybloom'));
    expect(e.kind).toBe('branch');
    expect(e.message).toContain('nope');
  });

  it('writes with the sha, branch and message, UTF-8 safe', async () => {
    const fetch = vi.fn<FetchLike>(async () => reply(200, { content: { sha: 'new-sha' } }));
    const res = await client(fetch).putFile('daybloom/tasks.json', '{"title":"Tée 🌸"}', 'old-sha', 'Daybloom sync from Mac');
    expect(res).toEqual({ sha: 'new-sha' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/me/daybloom-data/contents/daybloom/tasks.json');
    expect(init!.method).toBe('PUT');
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({ sha: 'old-sha', branch: 'main', message: 'Daybloom sync from Mac' });
    expect(decodeBase64(body.content)).toBe('{"title":"Tée 🌸"}');
  });

  it('turns a stale sha (409, or 422 about the sha) into a conflict', async () => {
    const e409 = await caught(client(async () => reply(409, { message: 'daybloom/tasks.json does not match abc' })).putFile('p', 'x', 'abc', 'm'));
    expect(e409.kind).toBe('conflict');
    const e422 = await caught(client(async () => reply(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' })).putFile('p', 'x', null, 'm'));
    expect(e422.kind).toBe('conflict');
  });

  it('explains a rejected token without ever echoing it', async () => {
    const e = await caught(client(async () => reply(401, { message: 'Bad credentials' })).getRepo());
    expect(e.kind).toBe('auth');
    expect(e.status).toBe(401);
    expect(e.message).not.toContain(TOKEN);
    expect(e.message).toMatch(/token/i);
  });

  it('distinguishes missing permissions from a missing repo', async () => {
    const forbidden = await caught(client(async () => reply(403, { message: 'Resource not accessible by personal access token' }, { 'x-ratelimit-remaining': '4999' })).putFile('p', 'x', null, 'm'));
    expect(forbidden.kind).toBe('forbidden');
    expect(forbidden.message).toContain('Read and write');
    const missing = await caught(client(async () => reply(404, { message: 'Not Found' })).getRepo());
    expect(missing.kind).toBe('not-found');
    expect(missing.message).toContain('me/daybloom-data');
  });

  it('backs off on rate limits until GitHub says so', async () => {
    const primary = await caught(client(async () => reply(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000' })).getRepo());
    expect(primary.kind).toBe('rate-limit');
    expect(primary.retryAt).toBe(2_000_000);
    const secondary = await caught(client(async () => reply(429, { message: 'You have exceeded a secondary rate limit' }, { 'retry-after': '30' })).getRepo());
    expect(secondary.kind).toBe('rate-limit');
    expect(secondary.retryAt).toBe(1_000_000 + 30_000);
  });

  it('reports network failures and server errors', async () => {
    const offline = await caught(client(async () => Promise.reject(new TypeError('Failed to fetch'))).getRepo());
    expect(offline.kind).toBe('network');
    const down = await caught(client(async () => reply(502, { message: 'Bad gateway' })).getRepo());
    expect(down.kind).toBe('server');
  });

  it('uses conditional requests so an unchanged folder costs a 304', async () => {
    const listing = [{ name: 'tasks.json', path: 'daybloom/tasks.json', sha: 's1', type: 'file', size: 10 }];
    const fetch = vi.fn<FetchLike>(async (_url, init) => {
      const h = init!.headers as Record<string, string>;
      return h['If-None-Match'] === '"etag-1"' ? new Response(null, { status: 304 }) : reply(200, listing, { etag: '"etag-1"' });
    });
    const gh = client(fetch);
    const first = await gh.listDir('daybloom');
    const second = await gh.listDir('daybloom');
    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({ name: 'tasks.json', sha: 's1' });
    expect((fetch.mock.calls[1][1]!.headers as Record<string, string>)['If-None-Match']).toBe('"etag-1"');
    expect(gh.requests).toBe(2);
  });
});
