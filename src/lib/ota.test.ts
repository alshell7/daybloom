import { describe, expect, it } from 'vitest';
import runtimeJson from '../../src-tauri/runtime.json';
import { compareVersions, pickBundle, RUNTIME } from './ota.svelte';

const entry = (version: string, runtime = 1, more: object = {}) => ({ version, runtime, url: `https://github.com/alshell7/daybloom/releases/download/v${version}/web-${version}-r${runtime}.zip`, sig: 'c2ln', files: 60, bytes: 1_400_000, ...more });

describe('web updates', () => {
  it('builds with the runtime from runtime.json', () => {
    expect(RUNTIME).toBe(runtimeJson.RUNTIME);
    expect(Number.isInteger(RUNTIME) && RUNTIME > 0).toBe(true);
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
