import { platform } from '../platform';

/** A reset is clearing the saved files: nothing writes again until the window reloads. */
let frozen = false;
export function freezeSaves() {
  frozen = true;
}

/**
 * A deeply reactive value mirrored to disk (native) or localStorage (browser),
 * and kept in sync across windows (main ↔ widget) without echo loops.
 */
export function persisted<T extends object>(key: string, initial: T, migrate: (raw: any) => T = (r) => ({ ...initial, ...r })) {
  const state = $state<{ value: T; ready: boolean }>({ value: structuredClone(initial), ready: false });
  let lastWritten = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function load() {
    try {
      const raw = await platform.load(key);
      if (raw) state.value = migrate(JSON.parse(raw));
    } catch (e) {
      console.warn(`[daybloom] could not read ${key}`, e);
    }
    // Baseline = what we hold now, so only a real change is ever written. Without this a
    // window that found nothing on disk would save its defaults over another window's data.
    lastWritten = JSON.stringify($state.snapshot(state.value));
    state.ready = true;
  }

  function flush() {
    timer = null;
    if (frozen) return;
    const json = JSON.stringify($state.snapshot(state.value));
    if (json === lastWritten) return;
    lastWritten = json;
    platform.save(key, json).catch((e) => console.warn(`[daybloom] could not save ${key}`, e));
  }

  $effect.root(() => {
    $effect(() => {
      // Track every nested field.
      JSON.stringify(state.value);
      if (!state.ready) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 250);
    });
  });

  platform.onExternalChange((k) => {
    if (k === key) load();
  });

  return {
    get value() {
      return state.value;
    },
    set value(v: T) {
      state.value = v;
    },
    get ready() {
      return state.ready;
    },
    load,
    /** Write immediately (e.g. before the window hides). */
    flush() {
      if (timer) clearTimeout(timer);
      flush();
    },
  };
}
