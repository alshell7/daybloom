// Conversation state for Ask Daybloom: the feed of questions and answer cards, input history,
// time-of-day suggestions, and the Needle engine's lifecycle.
//
// The engine module is loaded lazily (import.meta.glob, so a build without it still compiles)
// and only used when its weights are on this device. Until then every answer comes from the
// deterministic brain. Downloading is always the user's choice (`download()`).
//
// State lives here, not in the panel, so the conversation survives the panel closing and the
// whole view remounting (a time-zone change re-keys the main view).

import { openItems } from '../backlog';
import { addDays, hourOf, isoOf, startOfDayMs } from '../engine/time';
import { blocksInRange } from '../engine/blocks';
import { clock } from '../stores/clock.svelte';
import { persisted } from '../stores/persisted.svelte';
import { taskFile } from '../stores/tasks.svelte';
import { timer } from '../stores/timer.svelte';
import { execute, respond, warmTexts, warmUp, type Route } from './brain';
import { openCheckIns, type Call, type ToolResult } from './tools';
import type { EngineStatus, NeedleEngine } from './types';
import { ai } from '../ai/hub.svelte';
import { LlmError, providerOf } from '../ai/providers';

export interface Entry {
  id: number;
  /** What was asked (or the label of the chip that asked it). */
  query: string;
  at: number;
  pending: boolean;
  /** The answer is taking a while (the model may be waking up). */
  slow: boolean;
  result: ToolResult | null;
  route: Route | null;
  undone: boolean;
  /** Asked by voice (the query bubble shows a small mic). */
  spoken?: boolean;
  /** Answered by an AI service (its name), or why the service couldn't answer this time. */
  via?: string;
  note?: string;
  /** The AI service's generative UI (OpenUI Lang), drawn under the answer. */
  ui?: string;
}

export type Status = EngineStatus | 'unavailable';

const loaders = import.meta.glob<{ needle: NeedleEngine }>('./engine.svelte.ts');

const historyFile = persisted<{ version: 1; history: string[] }>('assistant', { version: 1, history: [] }, (raw) => ({
  version: 1,
  history: Array.isArray(raw?.history) ? raw.history.filter((s: unknown): s is string => typeof s === 'string').slice(-50) : [],
}));

/** `?debug` shows the routed tool and confidence under each answer. */
export const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

const MAX_ENTRIES = 40;

function titlesAround(): string[] {
  const today = isoOf(clock.now);
  const blocks = blocksInRange(taskFile.value.tasks, [], startOfDayMs(today), startOfDayMs(addDays(today, 2)));
  const titles = [...blocks.map((b) => b.title), ...openItems(taskFile.value.tasks).map((t) => t.title)];
  return [...new Set(titles.filter(Boolean))].slice(0, 40);
}

class Session {
  entries = $state<Entry[]>([]);
  busy = $state(false);
  /** The Needle engine, once its module has loaded (null in builds without it). */
  engine = $state.raw<NeedleEngine | null>(null);
  available = $state(true);

  status: Status = $derived(!this.available ? 'unavailable' : (this.engine?.status ?? 'absent'));
  progress = $derived(this.engine?.progress ?? 0);
  error = $derived(this.engine?.error ?? null);
  ready = $derived(this.status === 'ready');
  history = $derived(historyFile.value.history);

  /** Questions that fit the moment. */
  suggestions = $derived.by(() => {
    const now = clock.minute;
    const h = hourOf(now);
    const out: string[] = [];
    if (openCheckIns(now).length) out.push('Check-ins');
    if (timer.active) out.push('Stop the timer');
    if (h < 5 || h >= 21) out.push('Wind down', 'Show tomorrow', 'Breathe');
    else if (h < 11) out.push("What's now?", 'Plan my day', 'Show my day');
    else if (h < 17) out.push("What's next?", 'When am I free?', 'Start a 25 minute focus');
    else out.push('How was my day?', 'Plan tomorrow', 'How was my week?');
    if (h >= 5 && h < 21 && openItems(taskFile.value.tasks).length && !out.some((s) => /^plan/i.test(s))) out.push('Plan my day');
    out.push('Add…');
    return [...new Set(out)].slice(0, 5);
  });

  #seq = 0;
  #started = false;
  #warmed = false;

  /** The panel opened: load the engine module once, and wake the model if it's already here. */
  open() {
    if (!this.#started) {
      this.#started = true;
      historyFile.load();
      void this.#load();
    } else this.#warm();
  }

  async #load() {
    const load = loaders['./engine.svelte.ts'];
    if (!load) {
      this.available = false;
      return;
    }
    try {
      this.engine = (await load()).needle;
    } catch {
      this.available = false;
      return;
    }
    try {
      if (await this.engine.hasWeights()) this.#warm();
    } catch {
      /* stays in basic mode */
    }
  }

  #warm() {
    const e = this.engine;
    if (!e || e.status !== 'ready') return;
    const idle = () => !this.busy;
    if (!this.#warmed) {
      this.#warmed = true;
      void warmUp(e, idle).then(() => warmTexts(e, titlesAround(), idle));
    } else void e.ensureReady().catch(() => {});
  }

  /** Opt-in: download (35 MB, once, verified), load, and warm up. */
  async download() {
    const e = this.engine;
    if (!e) return;
    try {
      await e.ensureReady();
      this.#warmed = false;
      this.#warm();
    } catch {
      /* `status` / `error` tell the panel */
    }
  }

  #engineIfReady(): NeedleEngine | null {
    return this.engine && this.engine.status === 'ready' ? this.engine : null;
  }

  #push(query: string, spoken = false): Entry {
    this.entries.push({ id: ++this.#seq, query, at: clock.now, pending: true, slow: false, result: null, route: null, undone: false, spoken });
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    return this.entries[this.entries.length - 1];
  }

  async #settle(entry: Entry, work: () => Promise<ToolResult>) {
    this.busy = true;
    const slow = setTimeout(() => (entry.slow = true), 300);
    try {
      entry.result = await work();
    } catch (err) {
      console.warn('[daybloom] assistant', err);
      entry.result = { say: 'Something went wrong there. Try saying it another way?', card: { kind: 'note', icon: 'x' } };
    } finally {
      clearTimeout(slow);
      entry.pending = false;
      this.busy = false;
    }
  }

  #remember(text: string) {
    const h = historyFile.value.history.filter((x) => x !== text);
    h.push(text);
    historyFile.value.history = h.slice(-50);
  }

  /** Ask in words (typed, or spoken through Whistle). */
  async ask(raw: string, opts: { spoken?: boolean } = {}) {
    const text = raw.trim();
    if (!text) return;
    this.#remember(text);
    const entry = this.#push(text, !!opts.spoken);
    await this.#settle(entry, async () => {
      // An AI service chosen in Settings › AI answers first; this device is the fallback.
      if (ai.ready('assistant', 'think')) {
        const via = ai.route('assistant', 'think').via;
        try {
          const { aiRespond } = await import('./aiAnswer');
          const r = await aiRespond(text, this.entries.filter((e) => e !== entry), clock.now);
          if (r) {
            entry.via = via === 'device' ? undefined : providerOf(via).name;
            if (r.ui) entry.ui = r.ui;
            return r;
          }
        } catch (e) {
          entry.note = `${e instanceof LlmError ? e.message : "The AI service couldn't answer."} This answer came from this device.`;
        }
      }
      const r = await respond(text, this.#engineIfReady(), clock.now);
      entry.route = r.route;
      return r.result;
    });
  }

  /** Run a call a card offered ("Did you mean…", "Search instead"). */
  async run(call: Call, label: string) {
    const entry = this.#push(label);
    entry.route = { call, confidence: 1, source: 'none', options: [], ms: 0 };
    await this.#settle(entry, () => execute(call, this.#engineIfReady(), clock.now, label));
  }

  undo(entry: Entry) {
    if (entry.undone || !entry.result?.undo) return;
    entry.result.undo();
    entry.undone = true;
  }

  clear() {
    this.entries = [];
  }
}

export const session = new Session();

if (import.meta.env.DEV) (globalThis as { __session?: Session }).__session = session;
