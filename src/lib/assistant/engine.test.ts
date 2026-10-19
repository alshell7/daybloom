import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Needle,
  browserStore,
  parseCompletion,
  sha256Hex,
  type Transport,
  type WeightsStore,
  type WorkerRequest,
  type WorkerResponse,
} from './engine.svelte';
import type { ToolSchema } from './types';

const TOOLS: ToolSchema[] = [
  {
    name: 'start_timer',
    description: 'Start a countdown timer.',
    parameters: { type: 'object', properties: { minutes: { type: 'integer' } }, required: ['minutes'] },
  },
];
const ANSWER =
  '{"type":"call","success":true,"function_calls":[{"name":"start_timer","arguments":{"minutes":25,"label":"Focus"}}],"reasoning":"25 minute focus","confidence":0.49}';

type Reply = unknown | Error | ((req: WorkerRequest) => unknown);

/** A worker stand-in: records requests and answers them asynchronously (or on demand). */
class FakeWorker implements Transport {
  sent: WorkerRequest[] = [];
  transfers: Transferable[][] = [];
  terminated = false;
  manual = false;
  replies: Partial<Record<WorkerRequest['type'], Reply>> = {
    load: { heapBytes: 85_000_000, ms: 40 },
    init: { prefixTokens: 120, ms: 900 },
    complete: { json: ANSWER + '\u0000\u0000', ms: 400, heapBytes: 85_000_000 },
    embed: () => new Float32Array([0.6, 0.8]),
    unload: null,
  };
  #onMessage: ((r: WorkerResponse) => void) | null = null;
  #onCrash: ((e: Error) => void) | null = null;

  send(msg: WorkerRequest, transfer: Transferable[] = []) {
    this.sent.push(msg);
    this.transfers.push(transfer);
    if (!this.manual) queueMicrotask(() => this.answer(msg));
  }
  listen(onMessage: (r: WorkerResponse) => void, onCrash: (e: Error) => void) {
    this.#onMessage = onMessage;
    this.#onCrash = onCrash;
  }
  terminate() {
    this.terminated = true;
  }
  answer(msg: WorkerRequest = this.sent[this.sent.length - 1]) {
    let r = this.replies[msg.type];
    if (typeof r === 'function') r = (r as (req: WorkerRequest) => unknown)(msg);
    if (r instanceof Error) this.#onMessage?.({ id: msg.id, ok: false, error: r.message });
    else this.#onMessage?.({ id: msg.id, ok: true, result: r });
  }
  crash(message: string) {
    this.#onCrash?.(new Error(message));
  }
  types() {
    return this.sent.map((m) => m.type);
  }
}

class FakeStore implements WeightsStore {
  present = false;
  readError: string | null = null;
  calls: string[] = [];
  async has() {
    this.calls.push('has');
    return this.present;
  }
  onDownload: (() => void) | null = null;
  async download(onProgress: (r: number, t: number) => void) {
    this.calls.push('download');
    onProgress(0, 100);
    onProgress(50, 100);
    this.onDownload?.();
    onProgress(100, 100);
    this.present = true;
  }
  async read() {
    this.calls.push('read');
    if (!this.present) throw new Error('weights not downloaded');
    if (this.readError) throw new Error(this.readError);
    return new ArrayBuffer(16);
  }
  async forget() {
    this.calls.push('forget');
    this.present = false;
  }
}

function setup(opts: { present?: boolean; idleMs?: number } = {}) {
  const store = new FakeStore();
  store.present = opts.present ?? false;
  const workers: FakeWorker[] = [];
  const engine = new Needle({
    store,
    spawn: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    assets: async () => ({ scriptUrl: '/needle/needle.js', wasm: new ArrayBuffer(8) }),
    idleMs: opts.idleMs ?? 300_000,
  });
  return { engine, store, workers, worker: () => workers[workers.length - 1] };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('parseCompletion', () => {
  it('reads calls, confidence and reasoning, ignoring trailing NULs', () => {
    const r = parseCompletion(ANSWER + '\u0000\u0000garbage');
    expect(r.calls).toEqual([{ name: 'start_timer', arguments: { minutes: 25, label: 'Focus' } }]);
    expect(r.confidence).toBe(0.49);
    expect(r.reasoning).toBe('25 minute focus');
    expect((r.raw as { type: string }).type).toBe('call');
  });

  it('accepts string arguments and recovers the object from surrounding junk', () => {
    const r = parseCompletion('noise {"function_calls":[{"name":"a","arguments":"{\\"x\\":1}"},{"bad":1}]} tail');
    expect(r.calls).toEqual([{ name: 'a', arguments: { x: 1 } }]);
    expect(r.confidence).toBe(0);
    expect(r.reasoning).toBeUndefined();
  });

  it('turns engine errors and unreadable output into exceptions', () => {
    expect(() => parseCompletion('{"type":"error","error":"needle_init not called"}')).toThrow('needle_init not called');
    expect(() => parseCompletion('')).toThrow('unreadable');
  });
});

describe('Needle engine', () => {
  it('is lazy: nothing spawns or reads until it is needed', async () => {
    const { engine, store, workers } = setup({ present: true });
    await engine.configure(TOOLS, 'Today is Monday.');
    expect(workers).toHaveLength(0);
    expect(store.calls).not.toContain('read');
    expect(engine.loaded).toBe(false);
  });

  it('probes for weights on the first status read', async () => {
    const { engine } = setup({ present: true });
    expect(engine.status).toBe('absent');
    await tick();
    expect(engine.status).toBe('ready');
    expect(engine.loaded).toBe(false);
  });

  it('downloads, verifies and loads on ensureReady', async () => {
    const { engine, store, worker } = setup();
    expect(await engine.hasWeights()).toBe(false);
    let during: [string, number] | null = null;
    store.onDownload = () => (during = [engine.status, engine.progress]);
    await engine.ensureReady();
    expect(during).toEqual(['downloading', 0.5]);
    expect(store.calls).toEqual(['has', 'has', 'download', 'read']);
    expect(engine.status).toBe('ready');
    expect(engine.progress).toBe(1);
    expect(engine.loaded).toBe(true);
    expect(engine.memory).toBe(85_000_000);
    const load = worker().sent[0];
    expect(load.type).toBe('load');
    // weights and wasm are transferred, not copied
    expect(worker().transfers[0]).toHaveLength(2);
  });

  it('shares one ensureReady between concurrent callers', async () => {
    const { engine, store, workers } = setup();
    await Promise.all([engine.ensureReady(), engine.ensureReady()]);
    expect(store.calls.filter((c) => c === 'download')).toHaveLength(1);
    expect(workers).toHaveLength(1);
  });

  it('rejects with a clear error when the weights are missing', async () => {
    const { engine, workers } = setup();
    await engine.configure(TOOLS, 'sys');
    await expect(engine.complete('hi')).rejects.toThrow('weights not downloaded');
    await expect(engine.embed('hi')).rejects.toThrow('weights not downloaded');
    expect(workers).toHaveLength(0);
    expect(engine.status).toBe('absent');
  });

  it('reports a hash mismatch and forgets that the weights were good', async () => {
    const { engine, store } = setup({ present: true });
    store.readError = 'hash mismatch: the model file does not match its pinned SHA-256';
    await expect(engine.ensureReady()).rejects.toThrow('hash mismatch');
    expect(engine.status).toBe('error');
    expect(engine.error).toMatch(/hash mismatch/);
    expect(engine.loaded).toBe(false);
  });

  it('reports engine load failures as "engine failed to load"', async () => {
    const store = new FakeStore();
    store.present = true;
    const w = new FakeWorker();
    w.replies.load = new Error('needle_load: bad magic');
    const engine = new Needle({
      store,
      spawn: () => w,
      assets: async () => ({ scriptUrl: '/needle/needle.js', wasm: new ArrayBuffer(8) }),
    });
    await expect(engine.ensureReady()).rejects.toThrow('engine failed to load: needle_load: bad magic');
    expect(engine.status).toBe('error');
    expect(engine.error).toBe('engine failed to load: needle_load: bad magic');
    expect(w.terminated).toBe(true);
    expect(engine.loaded).toBe(false);
  });

  it('complete() inits once, resets per turn in the worker, and parses the answer', async () => {
    const { engine, worker } = setup({ present: true });
    await engine.configure(TOOLS, 'Today is Monday.');
    const r = await engine.complete('start a 25 minute focus', 64);
    expect(r.calls[0]).toEqual({ name: 'start_timer', arguments: { minutes: 25, label: 'Focus' } });
    expect(r.confidence).toBe(0.49);
    expect(r.ms).toBeGreaterThanOrEqual(0);
    await engine.complete('again');
    expect(worker().types()).toEqual(['load', 'init', 'complete', 'complete']);
    const init = worker().sent[1] as Extract<WorkerRequest, { type: 'init' }>;
    expect(JSON.parse(init.tools)).toEqual(TOOLS);
    expect(init.system).toBe('Today is Monday.');
    const c = worker().sent[2] as Extract<WorkerRequest, { type: 'complete' }>;
    expect(c).toMatchObject({ text: 'start a 25 minute focus', maxTokens: 64 });
  });

  it('configure() re-inits only when tools or system change', async () => {
    const { engine, worker } = setup({ present: true });
    await engine.configure(TOOLS, 'A');
    await engine.ensureReady();
    expect(worker().types()).toEqual(['load', 'init']);
    await engine.configure(TOOLS, 'A');
    await engine.configure([...TOOLS], 'A');
    expect(worker().types()).toEqual(['load', 'init']);
    await engine.configure(TOOLS, 'B');
    expect(worker().types()).toEqual(['load', 'init', 'init']);
    expect((worker().sent[2] as { system: string }).system).toBe('B');
  });

  it('requires configure() before complete()', async () => {
    const { engine } = setup({ present: true });
    await expect(engine.complete('hi')).rejects.toThrow('configure()');
  });

  it('serialises calls: one request in flight', async () => {
    const { engine, worker } = setup({ present: true });
    await engine.configure(TOOLS, 'sys');
    await engine.ensureReady();
    const w = worker();
    w.manual = true;
    const a = engine.complete('one');
    const b = engine.embed('two');
    await tick();
    expect(w.types()).toEqual(['load', 'init', 'complete']);
    w.answer();
    await a;
    await tick();
    expect(w.types()).toEqual(['load', 'init', 'complete', 'embed']);
    w.answer();
    const v = await b;
    expect(v).toBeInstanceOf(Float32Array);
    expect(Array.from(v)).toEqual([0.6000000238418579, 0.800000011920929]);
  });

  it('a failed call does not block the queue', async () => {
    const { engine, worker } = setup({ present: true });
    await engine.configure(TOOLS, 'sys');
    await engine.ensureReady();
    worker().replies.complete = new Error('boom');
    await expect(engine.complete('x')).rejects.toThrow('boom');
    worker().replies.complete = { json: ANSWER, ms: 1, heapBytes: 1 };
    await expect(engine.complete('y')).resolves.toMatchObject({ confidence: 0.49 });
  });

  it('unloads after the idle timeout and reloads transparently', async () => {
    vi.useFakeTimers();
    const { engine, workers } = setup({ present: true, idleMs: 1000 });
    await engine.configure(TOOLS, 'sys');
    await engine.complete('hi');
    expect(engine.loaded).toBe(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(engine.loaded).toBe(true);
    await vi.advanceTimersByTimeAsync(2);
    expect(engine.loaded).toBe(false);
    expect(engine.memory).toBe(0);
    expect(workers[0].terminated).toBe(true);
    expect(engine.status).toBe('ready');
    await engine.complete('again');
    expect(workers).toHaveLength(2);
    expect(workers[1].types()).toEqual(['load', 'init', 'complete']);
  });

  it('activity keeps the model warm', async () => {
    vi.useFakeTimers();
    const { engine, workers } = setup({ present: true, idleMs: 1000 });
    await engine.configure(TOOLS, 'sys');
    await engine.complete('a');
    await vi.advanceTimersByTimeAsync(800);
    await engine.complete('b');
    await vi.advanceTimersByTimeAsync(800);
    expect(engine.loaded).toBe(true);
    expect(workers).toHaveLength(1);
  });

  it('unload() frees the worker and rejects what was in flight', async () => {
    const { engine, worker } = setup({ present: true });
    await engine.configure(TOOLS, 'sys');
    await engine.ensureReady();
    worker().manual = true;
    const p = engine.complete('x');
    await tick();
    engine.unload();
    await expect(p).rejects.toThrow('engine unloaded');
    expect(worker().terminated).toBe(true);
    expect(engine.loaded).toBe(false);
  });

  it('recovers from a worker crash on the next call', async () => {
    const { engine, workers } = setup({ present: true });
    await engine.configure(TOOLS, 'sys');
    await engine.ensureReady();
    workers[0].manual = true;
    const p = engine.complete('x');
    await tick();
    workers[0].crash('out of memory');
    await expect(p).rejects.toThrow('engine crashed: out of memory');
    expect(engine.loaded).toBe(false);
    await expect(engine.complete('y')).resolves.toMatchObject({ confidence: 0.49 });
    expect(workers).toHaveLength(2);
  });

  it('forget() unloads and deletes the weights', async () => {
    const { engine, store, worker } = setup({ present: true });
    await engine.ensureReady();
    await engine.forget();
    expect(worker().terminated).toBe(true);
    expect(store.calls).toContain('forget');
    expect(engine.status).toBe('absent');
    expect(await engine.hasWeights()).toBe(false);
  });
});

describe('browserStore', () => {
  const bytes = new TextEncoder().encode('needle weights for a test');

  function streamResponse(data: Uint8Array, chunk = 7) {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < data.length; i += chunk) c.enqueue(data.slice(i, i + chunk));
        c.close();
      },
    });
    return new Response(body, { headers: { 'content-length': String(data.length) } });
  }

  it('downloads with progress, verifies SHA-256 and serves fresh copies', async () => {
    const spec = { url: 'https://huggingface.co/Cactus-Compute/x', sha256: await sha256Hex(bytes), bytes: bytes.length };
    const store = browserStore(spec, async () => streamResponse(bytes));
    expect(await store.has()).toBe(false);
    await expect(store.read()).rejects.toThrow('weights not downloaded');
    const seen: number[] = [];
    await store.download((r) => seen.push(r));
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(bytes.length);
    expect(await store.has()).toBe(true);
    const a = await store.read();
    const b = await store.read();
    expect(a).not.toBe(b);
    expect(new Uint8Array(a)).toEqual(bytes);
    await store.forget();
    expect(await store.has()).toBe(false);
  });

  it('rejects a download whose hash does not match', async () => {
    const spec = { url: 'https://huggingface.co/Cactus-Compute/x', sha256: '0'.repeat(64), bytes: bytes.length };
    const store = browserStore(spec, async () => streamResponse(bytes));
    await expect(store.download(() => {})).rejects.toThrow('hash mismatch');
    expect(await store.has()).toBe(false);
  });

  it('rejects truncated and oversized downloads', async () => {
    const sha256 = await sha256Hex(bytes);
    const short = browserStore({ url: 'u', sha256, bytes: bytes.length }, async () =>
      new Response(streamResponse(bytes.slice(0, 5)).body),
    );
    await expect(short.download(() => {})).rejects.toThrow('incomplete');
    const big = browserStore({ url: 'u', sha256, bytes: 3 }, async () => new Response(streamResponse(bytes).body));
    await expect(big.download(() => {})).rejects.toThrow('larger than expected');
    const http = browserStore({ url: 'u', sha256, bytes: 3 }, async () => new Response('nope', { status: 404 }));
    await expect(http.download(() => {})).rejects.toThrow('HTTP 404');
  });
});
