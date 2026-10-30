// Decision (addon): TinyDecide (huggingface.co/TheREZOR/TinyDecide, Apache-2.0) on this device.
// A 6 MB model that reads one line and answers any number of plain-English questions about it
// — which, yes or no, how much, and "pull out the time" — each with how sure it is. Daybloom
// asks it where a new line belongs (today, tomorrow, the backlog or someday), how urgent and
// what kind of thing it is, and whether waiting inbox items can be sorted. It never acts alone:
// every suggestion is shown first and you confirm it, and what you confirm or change teaches it
// (TinyDecide's corrections), so it learns your way of writing. Nothing leaves the device.
//
// The model downloads once when the addon is switched on, pinned to a revision and SHA-256
// (the same stores as Needle: Rust on a computer or phone, the Cache API in a browser), and runs
// in a worker (decide.worker.ts). What it learned syncs with your other devices.

import { platform } from '../../platform';
import { persisted } from '../../stores/persisted.svelte';
import { browserStore, nativeStore, type WeightsSpec, type WeightsStore } from '../../assistant/engine.svelte';
import { isOn } from '../registry';
import { makeProtos } from './vendor/corrections.js';
import { CAPTURE_QUESTIONS, KINDS, TRIAGE_QUESTIONS, WHEN, WHEN_OF, interpretCapture, interpretTriage, type Answer, type Destination, type Question, type RuleHints, type Suggestion, type TriageMove } from './questions';
import type { CategoryId } from '../../engine/types';

const REV = 'aa745b73a2db9a43bce731f0e8e5c90a6899fe2c';
const BASE = `https://huggingface.co/TheREZOR/TinyDecide/resolve/${REV}`;

export const DECISION_MODEL: WeightsSpec = {
  url: `${BASE}/model.bin`,
  sha256: '23fe9d93f2eafadbe4dc686a7dc5f309fbcba9ea1a4873d457e75d17c5bf3441',
  bytes: 6_181_984,
  file: 'tinydecide-model.bin',
};
export const DECISION_META: WeightsSpec = {
  url: `${BASE}/meta.json`,
  sha256: '2fb895cfb0cdd6b11fcfb5573033e846bf4defadb3c78b9989cccfeefe06758f',
  bytes: 187_362,
  file: 'tinydecide-meta.json',
};
export const DECISION_BYTES = DECISION_MODEL.bytes + DECISION_META.bytes;

import { MAX_EXAMPLES, migrateDecision, type DecisionFile } from './file';
export { decisionUnused, mergeDecisionFiles, migrateDecision, type DecisionFile, type Example } from './file';

export const decisionFile = persisted<DecisionFile>('addon-decision', migrateDecision(null), migrateDecision);

// ── The model ─────────────────────────────────────────────────────────────────

export type DecisionStatus = 'off' | 'absent' | 'downloading' | 'loading' | 'ready' | 'error';

interface Meta {
  beta: number[];
  [k: string]: unknown;
}

/** Lessons a question needs before they shape its answers. */
export const MIN_LESSONS = 8;

const round = (xs: ArrayLike<number>) => Array.from(xs, (x) => Math.round(x * 1000) / 1000);

class Decision {
  status = $state<DecisionStatus>('off');
  /** 0–1 while downloading. */
  progress = $state(0);
  error = $state('');
  /** How long the last answer took (ms), for the panel. */
  lastMs = $state(0);

  #stores: [WeightsStore, WeightsStore] | null = null;
  #worker: Worker | null = null;
  #meta: Meta | null = null;
  #ready: Promise<void> | null = null;
  #seq = 0;
  #waiting = new Map<number, { resolve: (a: Answer[]) => void; reject: (e: Error) => void }>();
  #protos: { sig: string; list: unknown[] } | null = null;

  get on() {
    return isOn('decision');
  }

  #storesFor(): [WeightsStore, WeightsStore] {
    return (this.#stores ??= [DECISION_META, DECISION_MODEL].map((w) => (platform.isNative ? nativeStore(w) : browserStore(w, undefined, 'daybloom-decision'))) as [
      WeightsStore,
      WeightsStore,
    ]);
  }

  /** Whether the model is on this device (no download). */
  async present(): Promise<boolean> {
    const [m, b] = this.#storesFor();
    return (await m.has().catch(() => false)) && (await b.has().catch(() => false));
  }

  /** Gets the model ready: downloads it the first time (only while the addon is on), then loads it. */
  ensure(): Promise<void> {
    if (this.status === 'ready' && this.#worker) return Promise.resolve();
    return (this.#ready ??= this.#prepare().catch((e) => {
      this.#ready = null;
      this.status = 'error';
      this.error = e instanceof Error ? e.message : String(e);
      throw e;
    }));
  }

  async #prepare() {
    if (!this.on) throw new Error('Decision is off');
    const [metaStore, binStore] = this.#storesFor();
    this.error = '';
    if (!(await metaStore.has()) || !(await binStore.has())) {
      this.status = 'downloading';
      this.progress = 0;
      await metaStore.download((r) => (this.progress = (r / DECISION_BYTES) * 0.999));
      await binStore.download((r) => (this.progress = (DECISION_META.bytes + r) / DECISION_BYTES));
    }
    this.status = 'loading';
    const [metaBuf, bin] = await Promise.all([metaStore.read(), binStore.read()]);
    const meta = JSON.parse(new TextDecoder().decode(metaBuf)) as Meta;
    this.#meta = meta;
    const w = new Worker(new URL('./decide.worker.ts', import.meta.url), { type: 'module', name: 'decision' });
    await new Promise<void>((resolve, reject) => {
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') resolve();
        else if (m.type === 'answer') {
          this.#waiting.get(m.id)?.resolve(m.result.answers);
          this.#waiting.delete(m.id);
          this.lastMs = Math.round(m.result.ms ?? 0);
        } else if (m.type === 'error') {
          if (m.id < 0) reject(new Error(m.message));
          this.#waiting.get(m.id)?.reject(new Error(m.message));
          this.#waiting.delete(m.id);
        }
      };
      w.onerror = (e) => reject(new Error(e.message || 'Decision could not start'));
      w.postMessage({ type: 'load', meta, bin }, [bin]);
    });
    this.#worker = w;
    this.status = 'ready';
    this.progress = 1;
  }

  /** Lets go of the worker (the addon was switched off). */
  stop() {
    this.#worker?.terminate();
    this.#worker = null;
    this.#ready = null;
    for (const p of this.#waiting.values()) p.reject(new Error('Decision stopped'));
    this.#waiting.clear();
    this.status = 'off';
  }

  /** Deletes the downloaded model (it downloads again when needed). */
  async forget() {
    this.stop();
    for (const s of this.#storesFor()) await s.forget().catch(() => {});
    this.status = this.on ? 'absent' : 'off';
  }

  /** Corrections for these questions, rebuilt only when what it learned changes. */
  #protosFor(questions: Question[]): unknown[] {
    const ex = decisionFile.value.examples;
    const sig = questions.map((q) => `${q.id}:${ex[q.id]?.length ?? 0}:${ex[q.id]?.at(-1)?.id ?? ''}`).join('|');
    if (this.#protos?.sig === sig) return this.#protos.list;
    const beta = this.#meta?.beta ?? [];
    const list = questions.map((q) => {
      const items = ex[q.id];
      // A few lessons, or lessons that all say the same thing, would only tilt every answer
      // towards them: corrections start once there are enough, and of more than one kind.
      if (!items || items.length < MIN_LESSONS || q.type === 'span' || new Set(items.map((e) => e.k)).size < 2) return null;
      const n = q.type === 'noul' ? 2 : (q.options?.length ?? 0);
      const lists: { v: number[]; z: number[] }[][] = Array.from({ length: n }, () => []);
      for (const e of items) if (e.k >= 0 && e.k < n) lists[e.k].push({ v: e.v, z: e.z });
      try {
        return makeProtos(q.type, lists, beta);
      } catch {
        return null;
      }
    });
    this.#protos = { sig, list };
    return list;
  }

  /** Asks the model; resolves with one answer per question. */
  async ask(state: string, questions: Question[]): Promise<Answer[]> {
    await this.ensure();
    const w = this.#worker;
    if (!w) throw new Error('Decision is not ready');
    const id = ++this.#seq;
    const protos = this.#protosFor(questions);
    return new Promise<Answer[]>((resolve, reject) => {
      this.#waiting.set(id, { resolve, reject });
      w.postMessage({ type: 'ask', id, state: state.slice(0, 600), questions: questions.map(({ type, text, options }) => ({ type, text, ...(options ? { options } : {}) })), protos });
    });
  }

  // ── Uses ────────────────────────────────────────────────────────────────────

  /** Where a new line belongs, with the answers kept for teaching when you confirm. */
  async suggest(line: string, rules: RuleHints): Promise<{ suggestion: Suggestion; answers: Answer[] } | null> {
    if (!this.on || !line.trim()) return null;
    const answers = await this.ask(line, CAPTURE_QUESTIONS);
    return { suggestion: interpretCapture(answers, rules), answers };
  }

  /** What could move out of the Inbox, and where (you confirm each). */
  async triage(items: { id: string; title: string }[]): Promise<TriageMove[]> {
    const out: TriageMove[] = [];
    for (const it of items) {
      const answers = await this.ask(it.title, TRIAGE_QUESTIONS);
      const m = interpretTriage(it.id, it.title, answers);
      if (m) out.push(m);
    }
    return out;
  }

  /**
   * You added a line: what you kept (or changed) teaches the model. `dest` and `category` are
   * what you chose; `answers` are the model's for that line.
   */
  learn(answers: Answer[], chosen: { dest: Destination; category: CategoryId | null }, changed: boolean) {
    const f = decisionFile.value;
    const at = Date.now();
    const add = (qid: string, k: number) => {
      const i = CAPTURE_QUESTIONS.findIndex((q) => q.id === qid);
      const a = answers[i];
      if (!a || (a.type !== 'choice' && a.type !== 'noul') || !a.qvec || !a.z0) return;
      const list = [...(f.examples[qid] ?? []), { id: `${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`, k, v: round(a.qvec), z: round(a.z0), at }];
      f.examples = { ...f.examples, [qid]: list.slice(-MAX_EXAMPLES) };
    };
    const when = WHEN_OF[chosen.dest];
    if (when) add('when', WHEN.indexOf(when));
    if (chosen.category) add('kind', KINDS.indexOf(chosen.category));
    if (changed) f.changed++;
    else f.kept++;
  }

  /** How many lessons it has, for the panel. */
  get learned(): number {
    return Object.values(decisionFile.value.examples).reduce((a, l) => a + l.length, 0);
  }

  forgetLessons() {
    decisionFile.value = { ...decisionFile.value, examples: {}, kept: 0, changed: 0 };
    this.#protos = null;
  }
}

export const decision = new Decision();

/** Main window, while the addon is on: get the model ready in the background. */
export function startDecision(): () => void {
  void decision.present().then((has) => {
    if (!decision.on) return;
    decision.status = has ? 'loading' : 'absent';
    // Switching the addon on is the go-ahead to download its 6 MB model.
    void decision.ensure().catch(() => {});
  });
  return () => decision.stop();
}
