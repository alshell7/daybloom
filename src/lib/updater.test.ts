import { beforeEach, describe, expect, it, vi } from 'vitest';

// The installer feed and the web update feed, each answering after `ms`.
const feeds = vi.hoisted(() => ({
  app: { value: null as null | { version: string; body?: string }, fail: false, ms: 0 },
  web: { value: null as null | { version: string; notes: string }, fail: false, ms: 0 },
  applied: 0,
  applyFails: false,
}));
const answer = <T>(f: { value: T; fail: boolean; ms: number }) =>
  new Promise<T>((resolve, reject) => setTimeout(() => (f.fail ? reject(new Error('offline')) : resolve(f.value)), f.ms));

vi.mock('./platform', async (real) => {
  const mod = await real<typeof import('./platform')>();
  return { ...mod, platform: { ...mod.platform, isNative: true } };
});
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: () => answer(feeds.app).then((u) => u && { ...u, downloadAndInstall: async () => {} }),
}));
vi.mock('./ota.svelte', async (real) => ({
  ...(await real<typeof import('./ota.svelte')>()),
  checkWebUpdate: () => answer(feeds.web),
  applyWebUpdate: async () => {
    if (feeds.applyFails) throw new Error('could not start');
    feeds.applied++;
  },
}));

const { checkForUpdates, installUpdate, updates } = await import('./updater.svelte');

beforeEach(() => {
  Object.assign(feeds.app, { value: null, fail: false, ms: 0 });
  Object.assign(feeds.web, { value: null, fail: false, ms: 0 });
  feeds.applied = 0;
  feeds.applyFails = false;
  Object.assign(updates, { status: 'idle', kind: 'app', version: '', notes: '', progress: 0, error: '' });
});

describe('updates: a new app or a web update', () => {
  it('prefers a new app when both are ready', async () => {
    feeds.app.value = { version: '0.3.0', body: 'App notes' };
    feeds.app.ms = 30;
    feeds.web.value = { version: '0.2.5', notes: 'Web notes' };
    await checkForUpdates();
    expect(updates).toMatchObject({ status: 'available', kind: 'app', version: '0.3.0', notes: 'App notes' });
  });

  it('offers a web update without waiting for a slow installer feed', async () => {
    feeds.app.ms = 120;
    feeds.web.value = { version: '0.2.5', notes: 'Web notes' };
    const done = checkForUpdates();
    await vi.waitFor(() => expect(updates.status).toBe('available'), { timeout: 100, interval: 5 });
    expect(updates).toMatchObject({ kind: 'web', version: '0.2.5' });
    await done;
    expect(updates).toMatchObject({ status: 'available', kind: 'web', version: '0.2.5' });
  });

  it('still offers a web update when the installer feed fails', async () => {
    feeds.app.fail = true;
    feeds.web.value = { version: '0.2.5', notes: '' };
    await checkForUpdates(true);
    expect(updates).toMatchObject({ status: 'available', kind: 'web', version: '0.2.5' });
  });

  it('is quiet when nothing is new, and says so when asked', async () => {
    await checkForUpdates();
    expect(updates.status).toBe('none');
    feeds.web.fail = true;
    await checkForUpdates();
    expect(updates.status).toBe('idle');
    await checkForUpdates(true);
    expect(updates).toMatchObject({ status: 'error', error: 'offline' });
  });

  it('applies a web update with a refresh, and keeps the version when it cannot', async () => {
    feeds.web.value = { version: '0.2.5', notes: '' };
    await checkForUpdates();
    await installUpdate();
    expect(feeds.applied).toBe(1);
    expect(updates.status).toBe('installing');

    await checkForUpdates();
    feeds.applyFails = true;
    updates.status = 'available';
    await installUpdate();
    expect(updates).toMatchObject({ status: 'error', error: 'could not start' });
  });
});
