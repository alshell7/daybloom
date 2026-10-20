// The on-device Needle engine (Cactus Compute, Apache-2.0): WebAssembly in a worker, weights
// downloaded once on request and SHA-256 verified. No cloud, no LLM.
//
// Lifecycle: nothing loads until ensureReady() (or a call that needs the model) runs. The
// model lives in its own worker and is thrown away after a few idle minutes, which returns
// its memory; the next call reloads it (~0.1 s) and re-applies the tools (needle_init, which
// costs a few seconds for a dozen tools). Calls are serialised: one request in flight.
//
// `status` reads the user-facing state: 'absent' (no weights on this device), 'downloading',
// 'loading', 'ready' (verified weights present; the model is in memory or loads on demand)
// and 'error'. `loaded` says whether the model is in memory right now.

import { platform } from '../platform';
import {
  NEEDLE_WEIGHTS,
  WHISTLE_WEIGHTS,
  type EngineStatus,
  type NeedleCall,
  type NeedleEngine,
  type NeedleResult,
  type SpeechEngine,
  type SpokenWord,
  type StreamStep,
  type ToolSchema,
  type TranscribeOptions,
  type Transcript,
} from './types';

// ---------------------------------------------------------------- worker protocol

export type WorkerRequest =
  | { id: number; type: 'load'; scriptUrl: string; wasm: ArrayBuffer; weights: ArrayBuffer }
  | { id: number; type: 'init'; system: string; tools: string }
  | { id: number; type: 'complete'; text: string; maxTokens: number }
  | { id: number; type: 'embed'; text: string }
  | { id: number; type: 'transcribe'; pcm: Float32Array; language: string | null; keywords: string | null; words: boolean }
  | { id: number; type: 'stream'; pcm: Float32Array; language: string | null; keywords: string | null }
  | { id: number; type: 'streamStop' }
  | { id: number; type: 'unload' };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string; fatal?: boolean };

export interface LoadResult {
  heapBytes: number;
  ms: number;
}
export interface InitResult {
  prefixTokens: number;
  ms: number;
}
export interface CompleteResult {
  json: string;
  ms: number;
  heapBytes: number;
}
export interface SpeechResult {
  json: string;
  ms: number;
}

type Body<T> = T extends { id: number } ? Omit<T, 'id'> : never;
export type WorkerCall = Body<WorkerRequest>;

/** The engine's view of a worker (a fake in tests). */
export interface Transport {
  send(msg: WorkerRequest, transfer?: Transferable[]): void;
  /** `onMessage` gets every reply; `onCrash` fires if the worker dies. */
  listen(onMessage: (r: WorkerResponse) => void, onCrash: (err: Error) => void): void;
  terminate(): void;
}

/** Where the verified weights live: Rust in the desktop app, the Cache API in a browser. */
export interface WeightsStore {
  has(): Promise<boolean>;
  download(onProgress: (received: number, total: number) => void): Promise<void>;
  /** The verified bytes; a fresh buffer each time (it is transferred to the worker). */
  read(): Promise<ArrayBuffer>;
  forget(): Promise<void>;
}

export interface EngineDeps {
  store: WeightsStore;
  spawn: () => Transport;
  /** needle.js / needle.wasm (served from public/needle). */
  assets?: () => Promise<{ scriptUrl: string; wasm: ArrayBuffer }>;
  /** Unload after this long without calls. Default 5 minutes. */
  idleMs?: number;
  now?: () => number;
}

export type WeightsSpec = { url: string; sha256: string; bytes: number; file?: string };

export const NEEDLE_PROGRESS_EVENT = 'daybloom://needle-progress';
const IDLE_MS = 5 * 60_000;
const NOT_DOWNLOADED = 'weights not downloaded';
const MISMATCH = 'hash mismatch: the model file does not match its pinned SHA-256';

function message(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'string' ? e : String(e);
}

// ---------------------------------------------------------------- engine

/**
 * One model in its own worker. `needle` (tool calling) and `whistle` (speech to text) are two
 * instances: separate workers, so live transcription never waits behind Needle warming up.
 */
export class Needle implements NeedleEngine, SpeechEngine {
  #status = $state<EngineStatus>('absent');
  #progress = $state(0);
  #error = $state<string | null>(null);
  #loaded = $state(false);
  #memory = $state(0);

  #deps: Required<Omit<EngineDeps, 'assets'>> & Pick<EngineDeps, 'assets'>;
  #transport: Transport | null = null;
  #pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  #seq = 0;
  #tail: Promise<unknown> = Promise.resolve();
  #busy = 0;
  #idle: ReturnType<typeof setTimeout> | null = null;
  #ready: Promise<void> | null = null;
  #probed = false;
  #weights: boolean | null = null;
  /** Bumped by forget(), so a download it cancelled doesn't report an error. */
  #generation = 0;
  #config: { key: string; system: string; tools: string } | null = null;
  #inited: string | null = null;

  constructor(deps: EngineDeps) {
    this.#deps = { idleMs: IDLE_MS, now: () => performance.now(), ...deps };
  }

  get status(): EngineStatus {
    // First look from the UI: find out whether the weights are already here (cheap, no load).
    if (!this.#probed) {
      this.#probed = true;
      this.hasWeights().catch(() => {});
    }
    return this.#status;
  }
  get progress(): number {
    return this.#progress;
  }
  get error(): string | null {
    return this.#error;
  }
  /** Whether the model is in memory right now. */
  get loaded(): boolean {
    return this.#loaded;
  }
  /** Size of the worker's WebAssembly heap while loaded, in bytes; 0 when unloaded. */
  get memory(): number {
    return this.#memory;
  }

  async hasWeights(): Promise<boolean> {
    this.#probed = true;
    let has: boolean;
    try {
      has = await this.#deps.store.has();
    } catch {
      return false;
    }
    this.#weights = has;
    if (this.#status === 'absent' || this.#status === 'ready') this.#status = has ? 'ready' : 'absent';
    return has;
  }

  ensureReady(): Promise<void> {
    this.#ready ??= this.#ensureReady().finally(() => (this.#ready = null));
    return this.#ready;
  }

  async #ensureReady(): Promise<void> {
    if (!(await this.#hasWeightsCached())) await this.#download();
    await this.#run(async () => {
      await this.#load();
      if (this.#config) await this.#init();
    });
  }

  configure(tools: ToolSchema[], system: string): Promise<void> {
    const json = JSON.stringify(tools);
    const key = `${system}\u0000${json}`;
    if (this.#config?.key === key) return Promise.resolve();
    this.#config = { key, system, tools: json };
    // Not in memory: applied when the model next loads.
    if (!this.#transport) return Promise.resolve();
    return this.#run(async () => {
      if (this.#transport) await this.#init();
    });
  }

  complete(text: string, maxTokens = 256): Promise<NeedleResult> {
    const t0 = this.#deps.now();
    return this.#run(async () => {
      await this.#load();
      await this.#init();
      const r = await this.#call<CompleteResult>({ type: 'complete', text, maxTokens });
      this.#memory = r.heapBytes;
      return { ...parseCompletion(r.json), ms: Math.round(this.#deps.now() - t0) };
    });
  }

  embed(text: string): Promise<Float32Array> {
    return this.#run(async () => {
      await this.#load();
      return this.#call<Float32Array>({ type: 'embed', text });
    });
  }

  // ---- speech (a Whistle .cact)

  transcribe(pcm: Float32Array, opts: TranscribeOptions = {}): Promise<Transcript> {
    const t0 = this.#deps.now();
    return this.#run(async () => {
      await this.#load();
      const copy = pcm.slice();
      const r = await this.#call<SpeechResult>(
        { type: 'transcribe', pcm: copy, language: opts.language ?? null, keywords: keywordList(opts.keywords), words: !!opts.words },
        [copy.buffer],
      );
      const o = parseSpeech(r.json);
      return { text: str(o.text), language: str(o.language), words: wordsOf(o.words), ms: Math.round(this.#deps.now() - t0) };
    });
  }

  streamPush(pcm: Float32Array, opts: TranscribeOptions = {}): Promise<StreamStep> {
    const t0 = this.#deps.now();
    return this.#run(async () => {
      await this.#load();
      const copy = pcm.slice();
      const r = await this.#call<SpeechResult>(
        { type: 'stream', pcm: copy, language: opts.language ?? null, keywords: keywordList(opts.keywords) },
        [copy.buffer],
      );
      return streamStep(r.json, this.#deps.now() - t0);
    });
  }

  streamStop(): Promise<StreamStep> {
    const t0 = this.#deps.now();
    return this.#run(async () => {
      if (!this.#transport) return { text: '', words: [], pending: '', language: '', received: 0, ms: 0 };
      const r = await this.#call<SpeechResult>({ type: 'streamStop' });
      return streamStep(r.json, this.#deps.now() - t0);
    });
  }

  unload(): void {
    this.#clearIdle();
    const t = this.#transport;
    this.#transport = null;
    t?.terminate();
    this.#rejectAll(new Error('engine unloaded'));
    this.#loaded = false;
    this.#memory = 0;
    this.#inited = null;
    if (this.#status === 'loading') this.#status = this.#weights ? 'ready' : 'absent';
  }

  async forget(): Promise<void> {
    this.#generation++;
    this.unload();
    await this.#deps.store.forget();
    this.#weights = false;
    this.#status = 'absent';
    this.#progress = 0;
    this.#error = null;
  }

  // ---- internals

  async #hasWeightsCached(): Promise<boolean> {
    if (this.#weights === true) return true;
    return this.hasWeights();
  }

  async #download(): Promise<void> {
    const gen = this.#generation;
    this.#status = 'downloading';
    this.#progress = 0;
    this.#error = null;
    try {
      await this.#deps.store.download((received, total) => {
        if (gen === this.#generation && total > 0) this.#progress = Math.min(1, received / total);
      });
    } catch (e) {
      if (gen !== this.#generation) throw new Error('download cancelled');
      throw this.#fail(message(e));
    }
    if (gen !== this.#generation) throw new Error('download cancelled');
    this.#weights = true;
    this.#progress = 1;
    this.#status = 'ready';
  }

  /** Spawns the worker and loads the weights into it unless that already happened. Never downloads. */
  async #load(): Promise<void> {
    if (this.#transport) return;
    if (!(await this.#hasWeightsCached())) throw new Error(NOT_DOWNLOADED);
    this.#status = 'loading';
    this.#error = null;
    let stage: 'read' | 'engine' = 'read';
    try {
      const weights = await this.#deps.store.read();
      stage = 'engine';
      const assets = await (this.#deps.assets ?? defaultAssets)();
      const t = this.#deps.spawn();
      this.#transport = t;
      t.listen(
        (r) => this.#onReply(t, r),
        (err) => this.#onCrash(t, err),
      );
      const r = await this.#call<LoadResult>({ type: 'load', scriptUrl: assets.scriptUrl, wasm: assets.wasm, weights }, [
        assets.wasm,
        weights,
      ]);
      this.#memory = r.heapBytes;
      this.#loaded = true;
      this.#inited = null;
      this.#status = 'ready';
    } catch (e) {
      const unloaded = !this.#transport && message(e) === 'engine unloaded';
      this.unload();
      if (unloaded) throw e;
      const msg = message(e);
      if (stage === 'read') {
        if (/not downloaded/i.test(msg)) {
          this.#weights = false;
          this.#status = 'absent';
          throw new Error(NOT_DOWNLOADED);
        }
        if (/hash mismatch/i.test(msg)) {
          this.#weights = false;
          throw this.#fail(MISMATCH);
        }
        throw this.#fail(msg);
      }
      throw this.#fail(`engine failed to load: ${msg}`);
    }
  }

  async #init(): Promise<void> {
    const c = this.#config;
    if (!c) throw new Error('call configure() before complete()');
    if (this.#inited === c.key) return;
    await this.#call<InitResult>({ type: 'init', system: c.system, tools: c.tools });
    this.#inited = c.key;
  }

  #fail(msg: string): Error {
    this.#status = 'error';
    this.#error = msg;
    return new Error(msg);
  }

  /** Serialises engine work (one request in flight) and keeps the idle timer honest. */
  #run<T>(fn: () => Promise<T>): Promise<T> {
    this.#busy++;
    this.#clearIdle();
    const p = this.#tail.then(fn);
    this.#tail = p.catch(() => {});
    return p.finally(() => {
      this.#busy--;
      this.#armIdle();
    });
  }

  #call<T>(body: WorkerCall, transfer: Transferable[] = []): Promise<T> {
    const t = this.#transport;
    if (!t) return Promise.reject(new Error('engine unloaded'));
    const id = ++this.#seq;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      try {
        t.send({ ...body, id } as WorkerRequest, transfer);
      } catch (e) {
        this.#pending.delete(id);
        reject(e instanceof Error ? e : new Error(message(e)));
      }
    });
  }

  #onReply(t: Transport, r: WorkerResponse) {
    if (t !== this.#transport) return;
    const p = this.#pending.get(r.id);
    if (!p) return;
    this.#pending.delete(r.id);
    if (r.ok) {
      p.resolve(r.result);
      return;
    }
    p.reject(new Error(r.error));
    // A WebAssembly trap leaves the instance unusable: start fresh next time.
    if (r.fatal) this.#onCrash(t, new Error(r.error));
  }

  #onCrash(t: Transport, err: Error) {
    if (t !== this.#transport) return;
    this.#transport = null;
    t.terminate();
    this.#rejectAll(new Error(`engine crashed: ${err.message}`));
    this.#loaded = false;
    this.#memory = 0;
    this.#inited = null;
    this.#error = `engine crashed: ${err.message}`;
  }

  #rejectAll(err: Error) {
    const pending = [...this.#pending.values()];
    this.#pending.clear();
    for (const p of pending) p.reject(err);
  }

  #clearIdle() {
    if (this.#idle !== null) clearTimeout(this.#idle);
    this.#idle = null;
  }

  #armIdle() {
    this.#clearIdle();
    if (this.#busy > 0 || !this.#transport) return;
    this.#idle = setTimeout(() => {
      this.#idle = null;
      if (this.#busy === 0) this.unload();
    }, this.#deps.idleMs);
  }
}

// ---------------------------------------------------------------- output parsing

/** Needle's JSON turn → NeedleResult (without `ms`). Tolerates trailing NULs / junk. */
export function parseCompletion(text: string): Omit<NeedleResult, 'ms'> {
  const nul = text.indexOf('\u0000');
  const s = (nul >= 0 ? text.slice(0, nul) : text).trim();
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(s);
  } catch {
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        obj = JSON.parse(s.slice(a, b + 1));
      } catch {
        obj = null;
      }
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('engine returned unreadable output');
  if (obj.type === 'error') throw new Error(typeof obj.error === 'string' ? obj.error : 'engine error');

  const calls: NeedleCall[] = [];
  if (Array.isArray(obj.function_calls)) {
    for (const c of obj.function_calls as Array<Record<string, unknown>>) {
      if (!c || typeof c.name !== 'string') continue;
      let args: unknown = c.arguments;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }
      calls.push({
        name: c.name,
        arguments: args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {},
      });
    }
  }
  const confidence = typeof obj.confidence === 'number' && Number.isFinite(obj.confidence) ? obj.confidence : 0;
  const reasoning = typeof obj.reasoning === 'string' && obj.reasoning ? obj.reasoning : undefined;
  return { calls, confidence, reasoning, raw: obj };
}

// ---------------------------------------------------------------- speech output

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Newline-separated keyword list for keyword biasing (null when there is none). */
export function keywordList(words: string[] | undefined): string | null {
  if (!words?.length) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const k = w.replace(/[\r\n]+/g, ' ').trim();
    if (!k || k.length > 48 || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
    if (out.length >= 64) break;
  }
  return out.length ? out.join('\n') : null;
}

function parseSpeech(text: string): Record<string, unknown> {
  const nul = text.indexOf('\u0000');
  const s = (nul >= 0 ? text.slice(0, nul) : text).trim();
  try {
    const o = JSON.parse(s);
    if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, unknown>;
  } catch {
    /* falls through */
  }
  throw new Error('engine returned unreadable output');
}

function wordsOf(v: unknown): SpokenWord[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object' && typeof (w as { word?: unknown }).word === 'string')
    .map((w) => ({
      word: String(w.word),
      start: Number(w.start) || 0,
      end: Number(w.end) || 0,
      probability: Number(w.probability) || 0,
    }));
}

export function streamStep(json: string, ms: number): StreamStep {
  const o = parseSpeech(json);
  return {
    text: str(o.text),
    words: wordsOf(o.words),
    pending: str(o.pending),
    language: str(o.language),
    received: Number(o.received) || 0,
    ms: Math.round(ms),
  };
}

// ---------------------------------------------------------------- weights stores

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(message(e));
  }
}

/** Desktop: the Rust store in src-tauri/src/assistant.rs (downloads outside the webview). */
export function nativeStore(w: WeightsSpec = NEEDLE_WEIGHTS): WeightsStore {
  const name = w.file ?? 'needle3.cact';
  return {
    async has() {
      const s = await invoke<{ present: boolean; bytes: number }>('assistant_weights_status', {
        name,
        sha256: w.sha256,
        bytes: w.bytes,
      });
      return s.present;
    },
    async download(onProgress) {
      const { listen } = await import('@tauri-apps/api/event');
      const off = await listen<{ name?: string; received: number; total: number }>(NEEDLE_PROGRESS_EVENT, (e) => {
        if ((e.payload.name ?? 'needle3.cact') === name) onProgress(e.payload.received, e.payload.total);
      });
      try {
        await invoke('assistant_weights_download', { name, url: w.url, sha256: w.sha256, bytes: w.bytes });
      } finally {
        off();
      }
    },
    async read() {
      const data = await invoke<ArrayBuffer | number[]>('assistant_weights_read', { name, sha256: w.sha256 });
      return data instanceof ArrayBuffer ? data : new Uint8Array(data).buffer;
    },
    async forget() {
      await invoke('assistant_weights_forget', { name });
    },
  };
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Browser (vite dev, tests): fetch with streamed progress, verify with WebCrypto, keep in the
 * Cache API (`daybloom-needle`). Falls back to memory where the Cache API is unavailable.
 */
export function browserStore(
  w: WeightsSpec = NEEDLE_WEIGHTS,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
  CACHE = 'daybloom-needle',
): WeightsStore {
  let memory: Uint8Array | null = null;
  let verified = false;
  let abort: AbortController | null = null;

  async function cache(): Promise<Cache | null> {
    try {
      return typeof caches === 'undefined' ? null : await caches.open(CACHE);
    } catch {
      return null;
    }
  }
  async function cached(): Promise<Response | null> {
    let r: Response | undefined;
    try {
      // caches.match (unlike caches.open) doesn't create the cache just to look.
      r = typeof caches === 'undefined' ? undefined : await caches.match(w.url, { cacheName: CACHE });
    } catch {
      r = undefined;
    }
    return r && r.headers.get('x-needle-sha256') === w.sha256 ? r : null;
  }

  const store: WeightsStore = {
    async has() {
      return memory !== null || (await cached()) !== null;
    },
    async download(onProgress) {
      abort?.abort();
      const ac = (abort = new AbortController());
      try {
        const res = await fetchImpl(w.url, { signal: ac.signal, credentials: 'omit', cache: 'no-store' });
        if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
        // A CDN may send it compressed (the length is then the compressed size, and the body
        // arrives inflated), so only more than expected is wrong here; size and hash are checked below.
        const len = Number(res.headers.get('content-length') ?? NaN);
        if (Number.isFinite(len) && len > w.bytes) {
          throw new Error(`download failed: expected ${w.bytes} bytes, the server offered ${len}`);
        }
        const buf = new Uint8Array(w.bytes);
        const reader = res.body.getReader();
        let received = 0;
        let last = 0;
        onProgress(0, w.bytes);
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (received + value.byteLength > w.bytes) throw new Error('download failed: larger than expected');
          buf.set(value, received);
          received += value.byteLength;
          const now = Date.now();
          if (now - last >= 100) {
            last = now;
            onProgress(received, w.bytes);
          }
        }
        if (received !== w.bytes) throw new Error(`download incomplete (${received} of ${w.bytes} bytes)`);
        onProgress(received, w.bytes);
        if ((await sha256Hex(buf)) !== w.sha256) throw new Error(MISMATCH);
        const c = await cache();
        if (c) {
          await c.put(
            w.url,
            new Response(buf, {
              headers: {
                'content-type': 'application/octet-stream',
                'x-needle-sha256': w.sha256,
                'x-needle-bytes': String(w.bytes),
              },
            }),
          );
        } else {
          memory = buf;
        }
        verified = true;
      } catch (e) {
        if (ac.signal.aborted) throw new Error('download cancelled');
        throw e;
      } finally {
        if (abort === ac) abort = null;
      }
    },
    async read() {
      let buf: ArrayBuffer;
      if (memory) {
        buf = memory.slice().buffer;
      } else {
        const r = await cached();
        if (!r) throw new Error(NOT_DOWNLOADED);
        buf = await r.arrayBuffer();
      }
      if (!verified) {
        if (buf.byteLength !== w.bytes || (await sha256Hex(buf)) !== w.sha256) {
          await store.forget();
          throw new Error(MISMATCH);
        }
        verified = true;
      }
      return buf;
    },
    async forget() {
      abort?.abort();
      memory = null;
      verified = false;
      try {
        if (typeof caches !== 'undefined') await caches.delete(CACHE);
      } catch {
        /* nothing cached */
      }
    },
  };
  return store;
}

// ---------------------------------------------------------------- defaults

function assetUrl(file: string): string {
  return new URL(`${import.meta.env.BASE_URL}needle/${file}`, location.href).href;
}

/** needle.wasm is fetched here and handed to the worker, so the worker only loads needle.js. */
async function defaultAssets(): Promise<{ scriptUrl: string; wasm: ArrayBuffer }> {
  const res = await fetch(assetUrl('needle.wasm'));
  if (!res.ok) throw new Error(`needle.wasm: HTTP ${res.status}`);
  return { scriptUrl: assetUrl('needle.js'), wasm: await res.arrayBuffer() };
}

function spawnWorker(name = 'needle'): Transport {
  // Classic worker (see needle.worker.ts): Vite bundles it in production and serves it in dev.
  const w = new Worker(new URL('./needle.worker.ts', import.meta.url), { name });
  return {
    send: (msg, transfer = []) => w.postMessage(msg, transfer),
    listen(onMessage, onCrash) {
      w.onmessage = (e: MessageEvent<WorkerResponse>) => onMessage(e.data);
      w.onerror = (e: ErrorEvent) => {
        e.preventDefault();
        onCrash(new Error(e.message || 'worker error'));
      };
      w.onmessageerror = () => onCrash(new Error('unreadable worker message'));
    },
    terminate: () => w.terminate(),
  };
}

export const needle = new Needle({
  store: platform.isNative ? nativeStore() : browserStore(),
  spawn: () => spawnWorker('needle'),
});

/** Whistle (speech to text): its own worker, weights and idle timer. */
export const whistle = new Needle({
  store: platform.isNative ? nativeStore(WHISTLE_WEIGHTS) : browserStore(WHISTLE_WEIGHTS, undefined, 'daybloom-whistle'),
  spawn: () => spawnWorker('whistle'),
  idleMs: 3 * 60_000,
});
