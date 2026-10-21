import { describe, expect, it } from 'vitest';
import { checkApk, newer, parseFeed } from './apkUpdate';

const SHA = 'a'.repeat(64);

describe('APK updates', () => {
  it('compares versions', () => {
    expect(newer('0.3.0', '0.2.9')).toBe(true);
    expect(newer('0.2.10', '0.2.9')).toBe(true);
    expect(newer('v1.0.0', '0.9.9')).toBe(true);
    expect(newer('0.2.0', '0.2.0')).toBe(false);
    expect(newer('0.2.0-beta', '0.2.0')).toBe(false);
    expect(newer('0.2.0', '0.2.0-beta')).toBe(true);
  });

  it('accepts only an HTTPS download with a real checksum', () => {
    expect(parseFeed({ version: '0.3.0', url: 'https://github.com/x.apk', sha256: SHA })).toMatchObject({ version: '0.3.0' });
    expect(parseFeed({ version: '0.3.0', url: 'http://evil.test/x.apk', sha256: SHA })).toBeNull();
    expect(parseFeed({ version: '0.3.0', url: 'https://github.com/x.apk', sha256: 'abc' })).toBeNull();
    expect(parseFeed(null)).toBeNull();
  });

  it('offers only a newer release', async () => {
    const feed = (v: string) => async () => new Response(JSON.stringify({ version: v, url: 'https://github.com/x.apk', sha256: SHA, notes: 'New' }));
    expect(await checkApk('0.2.0', feed('0.3.0'))).toMatchObject({ version: '0.3.0', notes: 'New' });
    expect(await checkApk('0.3.0', feed('0.3.0'))).toBeNull();
    await expect(checkApk('0.2.0', async () => new Response('nope', { status: 404 }))).rejects.toThrow(/404/);
  });
});
