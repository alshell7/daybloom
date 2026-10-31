// Decision (addon): decides where what you jot down belongs, sorts the Inbox and the Eisenhower
// matrix. What thinks is chosen in Settings › AI › Decision, like every AI part of Daybloom:
//
//   this device   TinyDecide (huggingface.co/TheREZOR/TinyDecide, Apache-2.0): reads one line and
//                 answers many plain-English questions about it at once — which, yes or no, how
//                 much, and "pull out the person / place / length" — each with how sure it is.
//                 Two builds: the 6 MB one, or the 10 MB "full" one (more words, a bit sharper).
//                 Nothing leaves the device, and what you confirm or change teaches it.
//   a service     any AI service set up in Settings › AI reads the same lines and answers in JSON.
//
// The model downloads once (pinned to a revision and SHA-256, the same stores as Needle) and runs
// in a worker (decide.worker.ts). What it learned syncs with your other devices.

import { platform } from '../../platform';
import { persisted } from '../../stores/persisted.svelte';
import { browserStore, nativeStore, type WeightsSpec, type WeightsStore } from '../../assistant/engine.svelte';
import { isOn } from '../registry';
import { makeProtos } from './vendor/corrections.js';
import { CAPTURE_QUESTIONS, KINDS, MATRIX_QUESTIONS, TRIAGE_QUESTIONS, WHEN, WHEN_OF, interpretCapture, interpretTriage, matrixScore, placeByScores, type Answer, type Destination, type Question, type RuleHints, type Suggestion, type TriageMove } from './questions';
import { ai } from '../../ai/hub.svelte';
import { chatOnce } from '../../ai/providers';
import { aiCapture, aiMatrix, aiTriage } from './viaAi';
import type { CategoryId, Task } from '../../engine/types';

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

/** The larger build: the full 30,534-word vocabulary, 13.8M weights. */
export const DECISION_FULL_MODEL: WeightsSpec = {
  url: `${BASE}/full/model.bin`,
  sha256: 'dcf52490b0505e0cd798713117f448a499ecb142db31fffcdd63e97f79f78d5a',
  bytes: 9_957_504,
  file: 'tinydecide-full-model.bin',
};
export const DECISION_FULL_META: WeightsSpec = {
  url: `${BASE}/full/meta.json`,
  sha256: '75e43116278c670255685522cec392ea45c9931443513f6b14c2c16d000676bd',
  bytes: 352_277,
  file: 'tinydecide-full-meta.json',
};

export type DecisionBuild = 'small' | 'full';
export const BUILDS: Record<DecisionBuild, { name: string; meta: WeightsSpec; model: WeightsSpec; mb: number; does: string }> = {
  small: { name: 'TinyDecide', meta: DECISION_META, model: DECISION_MODEL, mb: 6, does: 'Places and sorts what you jot down' },
  full: { name: 'TinyDecide full', meta: DECISION_FULL_META, model: DECISION_FULL_MODEL, mb: 10, does: 'Knows more words; a little sharper' },
};

import { MAX_EXAMPLES, migrateDecision, type DecisionFile } from './file';
export { decisionUnused, mergeDecisionFiles, migrateDecision, type DecisionFile, type Example } from './file';

export const decisionFile = persisted<DecisionFile>('addon-decision', migrateDecision(null), migrateDecision);

// ── The model ─────────────────────────────────────────────────────────────────

export type DecisionStatus = 'absent' | 'downloading' | 'loading' | 'ready' | 'error';

interface Meta {
  beta: number[];
  [k: string]: unknown;
}

/** Lessons a question needs before they shape its answers. */
export const MIN_LESSONS = 8;

const round = (xs: ArrayLike<number>) => Array.from(xs, (x) => Math.round(x * 1000) / 1000);

export type MatrixPlace = { taskId: string; urgent: boolean; important: boolean; why: string };

class Decision {
  /** The chosen build's state on this device (whether or not the addon is on). */
  status = $state<DecisionStatus>('absent');
  /** 0–1 while downloading. */
  progress = $state(0);
  error = $state('');
  /** How long the last answer took (ms), for the panel. */
  lastMs = $state(0);

  #stores = new Map<DecisionBuild, [WeightsStore, WeightsStore]>();
  #worker: Worker | null = null;
  #loaded: DecisionBuild | null = null;
  #meta: Meta | null = null;
  #ready: Promise<void> | null = null;
  #seq = 0;
  #waiting = new Map<number, { resolve: (a: Answer[]) => void; reject: (e: Error) => void }>();
  #protos: { sig: string; list: unknown[] } | null = null;

  get on() {
    return isOn('decision');
  }

  /** Which TinyDecide build Settings › AI chose (when it thinks on this device). */
  get build(): DecisionBuild {
    const r = ai.route('decision', 'think');
    return r.via === 'device' && r.model === 'full' ? 'full' : 'small';
  }

  /** Thinking with an AI service right now (else TinyDecide on this device). */
  get viaAi(): boolean {
    return ai.ready('decision', 'think');
  }

  /** Who answers, for the panel and the chips. */
  get who(): string {
    if (this.viaAi) {
      const r = ai.route('decision', 'think');
      return r.via === 'device' ? 'TinyDecide' : r.via.charAt(0).toUpperCase() + r.via.slice(1);
    }
    return BUILDS[this.build].name;
  }

  #storesFor(b: DecisionBuild = this.build): [WeightsStore, WeightsStore] {
    let s = this.#stores.get(b);
    if (!s) {
      const { meta, model } = BUILDS[b];
      s = [meta, model].map((w) => (platform.isNative ? nativeStore(w) : browserStore(w, undefined, b === 'full' ? 'daybloom-decision-full' : 'daybloom-decision'))) as [WeightsStore, WeightsStore];
      this.#stores.set(b, s);
    }
    return s;
  }

  /** Whether a build is on this device (no download). */
  async present(b: DecisionBuild = this.build): Promise<boolean> {
    const [m, x] = this.#storesFor(b);
    return (await m.has().catch(() => false)) && (await x.has().catch(() => false));
  }

  /** Looks (without downloading) whether the chosen build is here, for the settings page. */
  async check() {
    if (this.status === 'downloading' || this.status === 'loading') return;
    if (this.#loaded === this.build && this.#worker) {
      this.status = 'ready';
      return;
    }
    this.status = (await this.present()) ? 'ready' : 'absent';
  }

  /** Gets the chosen build ready: downloads it the first time, then loads it in the worker. */
  ensure(): Promise<void> {
    if (this.#worker && this.#loaded === this.build) return Promise.resolve();
    if (this.#loaded && this.#loaded !== this.build) this.stop();
    return (this.#ready ??= this.#prepare(this.build).catch((e) => {
      this.#ready = null;
      this.status = 'error';
      this.error = e instanceof Error ? e.message : String(e);
      throw e;
    }));
  }

  async #prepare(b: DecisionBuild) {
    const [metaStore, binStore] = this.#storesFor(b);
    const { meta: m, model } = BUILDS[b];
    const total = m.bytes + model.bytes;
    this.error = '';
    if (!(await metaStore.has()) || !(await binStore.has())) {
      this.status = 'downloading';
      this.progress = 0;
      await metaStore.download((r) => (this.progress = (r / total) * 0.999));
      await binStore.download((r) => (this.progress = (m.bytes + r) / total));
    }
    this.status = 'loading';
    const [metaBuf, bin] = await Promise.all([metaStore.read(), binStore.read()]);
    const meta = JSON.parse(new TextDecoder().decode(metaBuf)) as Meta;
    this.#meta = meta;
    const w = new Worker(new URL('./decide.worker.ts', import.meta.url), { type: 'module', name: 'decision' });
    await new Promise<void>((resolve, reject) => {
      w.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'ready') resolve();
        else if (msg.type === 'answer') {
          this.#waiting.get(msg.id)?.resolve(msg.result.answers);
          this.#waiting.delete(msg.id);
          this.lastMs = Math.round(msg.result.ms ?? 0);
        } else if (msg.type === 'error') {
          if (msg.id < 0) reject(new Error(msg.message));
          this.#waiting.get(msg.id)?.reject(new Error(msg.message));
          this.#waiting.delete(msg.id);
        }
      };
      w.onerror = (e) => reject(new Error(e.message || 'Decision could not start'));
      w.postMessage({ type: 'load', meta, bin }, [bin]);
    });
    this.#worker = w;
    this.#loaded = b;
    this.#protos = null;
    this.status = 'ready';
    this.progress = 1;
  }

  /** Lets go of the worker (the addon was switched off, or another build was chosen). */
  stop() {
    this.#worker?.terminate();
    this.#worker = null;
    this.#loaded = null;
    this.#ready = null;
    for (const p of this.#waiting.values()) p.reject(new Error('Decision stopped'));
    this.#waiting.clear();
  }

  /** Deletes a downloaded build (it downloads again when needed). */
  async forget(b: DecisionBuild = this.build) {
    if (this.#loaded === b) this.stop();
    for (const s of this.#storesFor(b)) await s.forget().catch(() => {});
    if (b === this.build) this.status = 'absent';
  }

  /** Lessons are per build (each has its own way of seeing a line). */
  #key(qid: string) {
    return this.build === 'full' ? `full:${qid}` : qid;
  }

  /** Corrections for these questions, rebuilt only when what it learned changes. */
  #protosFor(questions: Question[]): unknown[] {
    const ex = decisionFile.value.examples;
    const sig = this.build + questions.map((q) => `${q.id}:${ex[this.#key(q.id)]?.length ?? 0}:${ex[this.#key(q.id)]?.at(-1)?.id ?? ''}`).join('|');
    if (this.#protos?.sig === sig) return this.#protos.list;
    const beta = this.#meta?.beta ?? [];
    const list = questions.map((q) => {
      const items = ex[this.#key(q.id)];
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

  /** Asks TinyDecide; resolves with one answer per question. */
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

  async #service() {
    const conn = await ai.connection('decision', 'think').catch(() => null);
    if (!conn) return null;
    return (system: string, user: string, max = 600) =>
      chatOnce(conn.config, conn.key, [{ role: 'system', content: system }, { role: 'user', content: user }], null, (u, i) => platform.fetch(u, i), max).then((r) => r.content);
  }

  // ── Uses ────────────────────────────────────────────────────────────────────

  /** Where a new line belongs, with the answers kept for teaching when you confirm. */
  async suggest(line: string, rules: RuleHints): Promise<{ suggestion: Suggestion; answers: Answer[] } | null> {
    if (!this.on || !line.trim()) return null;
    if (this.viaAi) {
      const call = await this.#service();
      if (call) {
        const s = await aiCapture(call, line, { ...rules, line }).catch((e) => {
          console.warn('[daybloom] decision via AI', e);
          return null;
        });
        if (s) return { suggestion: s, answers: [] };
      }
    }
    const answers = await this.ask(line, CAPTURE_QUESTIONS);
    return { suggestion: interpretCapture(answers, { ...rules, line }), answers };
  }

  /**
   * Where each task sits in the Eisenhower matrix. TinyDecide's scores are read against the rest
   * of the list (placeByScores), and what you moved by hand before teaches it.
   */
  async matrix(items: { id: string; title: string; category?: Task['category'] }[]): Promise<MatrixPlace[]> {
    if (!items.length) return [];
    if (this.viaAi) {
      const call = await this.#service();
      if (call) {
        const got = await aiMatrix(call, items).catch(() => []);
        if (got.length) return got;
      }
    }
    const scores = [];
    for (const it of items) scores.push(matrixScore(it.id, await this.ask(it.title, MATRIX_QUESTIONS), it.category));
    return placeByScores(scores);
  }

  /** What could move out of the Inbox, and where. */
  async triage(items: { id: string; title: string }[]): Promise<TriageMove[]> {
    if (this.viaAi) {
      const call = await this.#service();
      if (call) {
        const got = await aiTriage(call, items).catch(() => []);
        if (got.length) return got;
      }
    }
    const out: TriageMove[] = [];
    for (const it of items) {
      const answers = await this.ask(it.title, TRIAGE_QUESTIONS);
      const m = interpretTriage(it.id, it.title, answers);
      if (m) out.push(m);
    }
    return out;
  }

  #lesson(qid: string, a: Answer | undefined, k: number) {
    if (!a || (a.type !== 'choice' && a.type !== 'noul') || !a.qvec || !a.z0) return;
    const f = decisionFile.value;
    const at = Date.now();
    const key = this.#key(qid);
    const list = [...(f.examples[key] ?? []), { id: `${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`, k, v: round(a.qvec), z: round(a.z0), at }];
    f.examples = { ...f.examples, [key]: list.slice(-MAX_EXAMPLES) };
  }

  /**
   * You added a line: what you kept (or changed) teaches the model. `dest` and `category` are
   * what you chose; `answers` are the model's for that line (none when a service answered).
   */
  learn(answers: Answer[], chosen: { dest: Destination; category: CategoryId | null }, changed: boolean) {
    const f = decisionFile.value;
    const at = (qid: string) => answers[CAPTURE_QUESTIONS.findIndex((q) => q.id === qid)];
    const when = WHEN_OF[chosen.dest];
    if (answers.length && when) this.#lesson('when', at('when'), WHEN.indexOf(when));
    if (answers.length && chosen.category) this.#lesson('kind', at('kind'), KINDS.indexOf(chosen.category));
    if (changed) f.changed++;
    else f.kept++;
  }

  /** You moved a task in the matrix yourself: that teaches its urgency and importance. */
  async learnPlace(title: string, urgent: boolean, important: boolean) {
    if (!this.on || this.viaAi || this.status !== 'ready') return;
    try {
      const a = await this.ask(title, MATRIX_QUESTIONS);
      this.#lesson('m_urgent', a[0], urgent ? 1 : 0);
      this.#lesson('m_important', a[4], important ? 1 : 0);
      this.#lesson('m_matters', a[2], important ? 1 : 0);
    } catch {
      /* only a lesson */
    }
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

/** Main window, while the addon is on: get the model ready in the background (unless a service thinks). */
export function startDecision(): () => void {
  void decision.check().then(() => {
    // Switching the addon on is the go-ahead to download its model.
    if (decision.on && !decision.viaAi) void decision.ensure().catch(() => {});
  });
  return () => decision.stop();
}
