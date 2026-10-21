import { beforeEach, describe, expect, it, vi } from 'vitest';
import pkg from '../../package.json';
import runtimeJson from '../../src-tauri/runtime.json';

// The native side and the network, for checkWebUpdate.
const native = vi.hoisted(() => ({
  status: null as Record<string, unknown> | null,
  feed: null as null | { status: number; body?: unknown } | Error,
  staged: [] as { url: string; sig: string }[],
}));
vi.mock('./platform', async (real) => {
  const mod = await real<typeof import('./platform')>();
  const fetch = async () => {
    if (native.feed instanceof Error) throw native.feed;
    const f = native.feed ?? { status: 404 };
    return { status: f.status, ok: f.status < 300, json: async () => f.body } as Response;
  };
  return { ...mod, platform: { ...mod.platform, isNative: true, fetch } };
});
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args: { url: string; sig: string }) => {
    if (cmd === 'ota_status') return native.status;
    if (cmd === 'ota_stage') {
      native.staged.push(args);
      return { version: /web-([\d.]+)-/.exec(args.url)?.[1], notes: '' };
    }
    throw new Error(`unexpected ${cmd}`);
  },
}));

const { checkWebUpdate, compareVersions, PAGE_VERSION, pickBundle, RUNTIME } = await import('./ota.svelte');

const entry = (version: string, runtime = 1, more: object = {}) => ({ version, runtime, url: `https://github.com/alshell7/daybloom/releases/download/v${version}/web-${version}-r${runtime}.zip`, sig: 'c2ln', files: 60, bytes: 1_400_000, ...more });

describe('web updates', () => {
  it('builds with the runtime from runtime.json and the version from package.json', () => {
    expect(RUNTIME).toBe(runtimeJson.RUNTIME);
    expect(Number.isInteger(RUNTIME) && RUNTIME > 0).toBe(true);
    expect(PAGE_VERSION).toBe(pkg.version);
  });

  it('orders versions by number, not as text', () => {
    expect(compareVersions('0.2.10', '0.2.9')).toBe(1);
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.2.0', '0.2.1')).toBe(-1);
  });

  it('takes the newest bundle for this runtime only', () => {
    const feed = { bundles: [entry('0.2.3', 2), entry('0.2.1', 1), entry('0.2.2', 1)] };
    expect(pickBundle(feed, { runtime: 1, version: '0.2.0', blocked: [] })?.version).toBe('0.2.2');
    expect(pickBundle(feed, { runtime: 2, version: '0.2.0', blocked: [] })?.version).toBe('0.2.3');
    expect(pickBundle(feed, { runtime: 3, version: '0.2.0', blocked: [] })).toBeNull();
  });

  it('skips what is not newer and what was set aside', () => {
    const feed = { bundles: [entry('0.2.1'), entry('0.2.2')] };
    expect(pickBundle(feed, { runtime: 1, version: '0.2.2', blocked: [] })).toBeNull();
    expect(pickBundle(feed, { runtime: 1, version: '0.2.1', blocked: ['0.2.2'] })).toBeNull();
    expect(pickBundle(feed, { runtime: 1, version: '0.2.0', blocked: ['0.2.2'] })?.version).toBe('0.2.1');
  });

  it('ignores a feed or entries it cannot read', () => {
    const s = { runtime: 1, version: '0.2.0', blocked: [] };
    for (const feed of [null, undefined, 'x', {}, { bundles: 'x' }, []]) expect(pickBundle(feed, s)).toBeNull();
    const bad = [entry('0.2.1', 1, { url: '' }), entry('0.2.1', 1, { sig: undefined }), entry('v0.2.1'), entry('0.2.1-beta'), entry('0.2.1', '1' as unknown as number), null];
    expect(pickBundle({ bundles: bad }, s)).toBeNull();
  });
});

describe('checking for a web update', () => {
  const status = (pending: string | null = null) => ({ runtime: 1, embedded: '0.2.0', version: '0.2.0', active: null, previous: null, pending: pending && { version: pending, notes: '' }, blocked: [], reverted: null, feed: 'https://feed' });
  beforeEach(() => {
    native.status = status();
    native.feed = null;
    native.staged = [];
  });

  it('stages the newest bundle for this runtime', async () => {
    native.feed = { status: 200, body: { bundles: [entry('0.2.2'), entry('0.2.9', 2)] } };
    expect(await checkWebUpdate()).toEqual({ version: '0.2.2', notes: '' });
    expect(native.staged.map((s) => s.url)).toEqual([entry('0.2.2').url]);
  });

  it('is quiet before the first web update is published', async () => {
    expect(await checkWebUpdate()).toBeNull();
  });

  it('keeps one already waiting unless the feed has a newer one', async () => {
    native.status = status('0.2.1');
    native.feed = { status: 200, body: { bundles: [entry('0.2.1')] } };
    expect((await checkWebUpdate())?.version).toBe('0.2.1');
    expect(native.staged).toEqual([]);
    native.feed = { status: 200, body: { bundles: [entry('0.2.3')] } };
    expect((await checkWebUpdate())?.version).toBe('0.2.3');
  });

  it('offers one already waiting while offline, and reports the failure otherwise', async () => {
    native.feed = new Error('offline');
    native.status = status('0.2.1');
    expect((await checkWebUpdate())?.version).toBe('0.2.1');
    native.status = status();
    await expect(checkWebUpdate()).rejects.toThrow('offline');
    native.feed = { status: 500 };
    await expect(checkWebUpdate()).rejects.toThrow('500');
  });

  it('does nothing in a browser or in development', async () => {
    native.status = null;
    expect(await checkWebUpdate()).toBeNull();
  });
});
