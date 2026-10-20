import { describe, expect, it, vi } from 'vitest';

// The runtime imports every addon store; none of them needs to hear other windows here.
vi.mock('../platform', async (importOriginal) => {
  const m = await importOriginal<typeof import('../platform')>();
  return { ...m, platform: { ...m.platform, onExternalChange: () => () => {} } };
});

import { loaded } from './runtime.svelte';
import { migrateTrackerFile } from './tracker/migrate';
import { createTracker } from './tracker/tracker.svelte';
import type { Entry, TrackerFile } from './tracker/types';

const T0 = Date.UTC(2026, 9, 19, 9, 0);
const entry = (id: string): Entry => ({ id, startMs: T0, endMs: T0 + 60_000, source: 'tracker' });

/** A store like `persisted`: `load()` replaces the value with what is on disk. */
function storeOnDisk(disk: TrackerFile) {
  const file = {
    value: migrateTrackerFile(null),
    ready: false,
    load: vi.fn(async () => {
      file.value = structuredClone(disk);
      file.ready = true;
    }),
  };
  return file;
}

function trackerOn(file: ReturnType<typeof storeOnDisk>) {
  return createTracker({
    file,
    now: () => T0,
    idleSeconds: async () => 0,
    foreground: async () => null,
    newId: () => 'id',
    heartbeat: { read: () => null, write: () => {} },
    setInterval: () => 0,
    clearInterval: () => {},
  });
}

describe('turning on the Time Tracker', () => {
  it('reads the file only if nothing has yet, so a sync write is never undone', async () => {
    const file = storeOnDisk(migrateTrackerFile({ entries: [entry('old')] }));
    const tracker = trackerOn(file);

    // GitHub sync loads the store, then writes what it merged (saved to disk 250 ms later).
    await file.load();
    file.value = migrateTrackerFile({ entries: [entry('old'), entry('synced')] });

    // The addon turns on after that: the store is kept as it is.
    await loaded(tracker);
    expect(file.load).toHaveBeenCalledTimes(1);
    expect(tracker.entries.map((e) => e.id)).toEqual(['old', 'synced']);
  });

  it('reads the file when nothing has, and tracker.load() still reads it every time', async () => {
    const file = storeOnDisk(migrateTrackerFile({ entries: [entry('disk')] }));
    const tracker = trackerOn(file);
    expect(tracker.ready).toBe(false);
    await loaded(tracker);
    expect(file.load).toHaveBeenCalledTimes(1);
    expect(tracker.ready).toBe(true);
    expect(tracker.entries.map((e) => e.id)).toEqual(['disk']);

    await tracker.load();
    expect(file.load).toHaveBeenCalledTimes(2);
  });
});
