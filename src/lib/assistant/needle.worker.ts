// The Needle engine in its own worker: one model per worker, one request at a time.
// Protocol (types in engine.svelte.ts):
//   load     { scriptUrl, wasm, weights }  -> { heapBytes, ms }     (wasm + weights transferred)
//   init     { system, tools }             -> { prefixTokens, ms }
//   complete { text, maxTokens }           -> { json, ms, heapBytes } (conversation reset first)
//   embed    { text }                      -> Float32Array            (buffer transferred)
//   unload   {}                            -> null, then the worker closes itself
// Replies are { id, ok: true, result } or { id, ok: false, error, fatal? }; fatal means the
// WebAssembly instance trapped and the worker should be thrown away.
//
// Started as a classic worker so the vendored Emscripten factory loads with importScripts()
// under a plain `script-src 'self'` (no blob: or eval) in Vite dev, the production bundle,
// WKWebView and WebView2. That makes this file a *script*: no import/export statements (Vite
// serves a classic worker unbundled in dev, and would keep even an `export {}`), so types come
// in through import() type queries and everything sits in one block to stay out of the global
// scope.

'use strict';

{
  type WorkerRequest = import('./engine.svelte').WorkerRequest;
  type WorkerResponse = import('./engine.svelte').WorkerResponse;

  interface NeedleModule {
    _needle_load(cact: number, n: bigint): number;
    _needle_init(system: number, tools: number, toolIndexPath: number): number;
    _needle_complete(input: number, pcm: number, samples: number, maxNew: number, out: number, cap: number): number;
    _needle_embed(input: number, pcm: number, samples: number, out: number, cap: number): number;
    _needle_reset(): void;
    _needle_last_error(): number;
    _malloc(n: number): number;
    _free(p: number): void;
    HEAPU8: Uint8Array;
    UTF8ToString(ptr: number, maxBytes?: number): string;
  }
  type Factory = (moduleArg?: object) => Promise<NeedleModule>;

  const scope = globalThis as unknown as {
    createNeedle?: Factory;
    importScripts(...urls: string[]): void;
    fetch: typeof fetch;
    postMessage(message: WorkerResponse, options?: { transfer?: Transferable[] }): void;
    close(): void;
    onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  };

  const encoder = new TextEncoder();
  let M: NeedleModule | null = null;
  let out = 0;
  let outCap = 0;
  let embedDim = 0;

  function lastError(): string {
    return M ? M.UTF8ToString(M._needle_last_error()) : '';
  }

  /** Copies `s` into the heap as a NUL-terminated UTF-8 string for the duration of `fn`. */
  function withString<T>(s: string, fn: (ptr: number) => T): T {
    const m = M!;
    const bytes = encoder.encode(s);
    const p = m._malloc(bytes.length + 1);
    if (!p) throw new Error('out of memory');
    m.HEAPU8.set(bytes, p);
    m.HEAPU8[p + bytes.length] = 0;
    try {
      return fn(p);
    } finally {
      m._free(p);
    }
  }

  function ensureOut(cap: number) {
    const m = M!;
    if (outCap >= cap) return;
    if (out) m._free(out);
    out = m._malloc(cap);
    if (!out) {
      outCap = 0;
      throw new Error('out of memory');
    }
    outCap = cap;
  }

  async function loadFactory(scriptUrl: string): Promise<Factory> {
    if (typeof scope.createNeedle !== 'function') {
      try {
        scope.importScripts(scriptUrl);
      } catch (e) {
        // A module worker has no importScripts: import the script as a module instead.
        if (typeof scope.createNeedle !== 'function' && e instanceof TypeError) {
          const res = await fetch(scriptUrl);
          if (!res.ok) throw new Error(`needle.js: HTTP ${res.status}`);
          const src = await res.text();
          const url = URL.createObjectURL(new Blob([src, '\nexport default createNeedle;\n'], { type: 'text/javascript' }));
          try {
            scope.createNeedle = (await import(/* @vite-ignore */ url)).default as Factory;
          } finally {
            URL.revokeObjectURL(url);
          }
        } else {
          throw e;
        }
      }
    }
    if (typeof scope.createNeedle !== 'function') throw new Error('needle.js did not define createNeedle');
    return scope.createNeedle;
  }

  /**
   * Instantiates the module with the wasm bytes the page sent. The vendored build ignores
   * Module.locateFile / wasmBinary and fetches `needle.wasm` next to the *worker* script, so the
   * worker's fetch serves that one request from memory while the factory runs.
   */
  async function instantiate(factory: Factory, wasm: ArrayBuffer): Promise<NeedleModule> {
    const magic = new Uint8Array(wasm, 0, Math.min(4, wasm.byteLength));
    if (magic.length < 4 || magic[0] !== 0 || magic[1] !== 0x61 || magic[2] !== 0x73 || magic[3] !== 0x6d) {
      throw new Error('needle.wasm is missing or not WebAssembly');
    }
    const realFetch = scope.fetch;
    scope.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (/needle\.wasm(?:[?#].*)?$/.test(url)) {
        return Promise.resolve(new Response(wasm, { headers: { 'Content-Type': 'application/wasm' } }));
      }
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      return await factory({});
    } finally {
      scope.fetch = realFetch;
    }
  }

  async function handle(msg: WorkerRequest): Promise<{ result: unknown; transfer?: Transferable[] }> {
    const t0 = performance.now();
    const ms = () => Math.round(performance.now() - t0);
    if (msg.type === 'load') {
      if (M) throw new Error('a model is already loaded in this worker');
      const factory = await loadFactory(msg.scriptUrl);
      const m = await instantiate(factory, msg.wasm);
      M = m;
      const w = new Uint8Array(msg.weights);
      const p = m._malloc(w.byteLength);
      if (!p) throw new Error('out of memory');
      m.HEAPU8.set(w, p);
      // needle_load copies what it needs; the staging copy goes back to the allocator.
      const rc = m._needle_load(p, BigInt(w.byteLength));
      m._free(p);
      if (rc < 0) {
        const err = lastError() || `needle_load returned ${rc}`;
        M = null;
        throw new Error(err);
      }
      return { result: { heapBytes: m.HEAPU8.length, ms: ms() } };
    }
    if (msg.type === 'unload') {
      M = null;
      return { result: null };
    }
    if (!M) throw new Error('no model loaded');
    const m = M;
    switch (msg.type) {
      case 'init': {
        const rc = withString(msg.system, (s) => withString(msg.tools, (t) => m._needle_init(s, t, 0)));
        if (rc < 0) throw new Error(lastError() || `needle_init returned ${rc}`);
        return { result: { prefixTokens: rc, ms: ms() } };
      }
      case 'complete': {
        ensureOut(32 * 1024);
        for (;;) {
          m._needle_reset();
          const rc = withString(msg.text, (p) => m._needle_complete(p, 0, 0, msg.maxTokens, out, outCap));
          if (rc >= 0) break;
          const err = lastError();
          if (/buffer|capacity|too small/i.test(err) && outCap < 1 << 20) {
            ensureOut(outCap * 4);
            continue;
          }
          throw new Error(err || `needle_complete returned ${rc}`);
        }
        const json = m.UTF8ToString(out, outCap);
        return { result: { json, ms: ms(), heapBytes: m.HEAPU8.length } };
      }
      case 'embed': {
        if (!embedDim) {
          embedDim = withString(msg.text, (p) => m._needle_embed(p, 0, 0, 0, 0));
          if (embedDim <= 0) {
            const err = lastError() || `needle_embed returned ${embedDim}`;
            embedDim = 0;
            throw new Error(err);
          }
        }
        const dim = embedDim;
        const buf = m._malloc(dim * 4);
        if (!buf) throw new Error('out of memory');
        try {
          const n = withString(msg.text, (p) => m._needle_embed(p, 0, 0, buf, dim));
          if (n < 0) throw new Error(lastError() || `needle_embed returned ${n}`);
          // Copy out of the heap (the view would go stale if memory grows).
          const vec = new Float32Array(m.HEAPU8.buffer, buf, Math.min(n, dim)).slice();
          return { result: vec, transfer: [vec.buffer] };
        } finally {
          m._free(buf);
        }
      }
    }
    throw new Error(`unknown request ${(msg as { type: string }).type}`);
  }

  scope.onmessage = (e) => {
    const msg = e.data;
    handle(msg).then(
      ({ result, transfer }) => {
        scope.postMessage({ id: msg.id, ok: true, result }, { transfer });
        if (msg.type === 'unload') scope.close();
      },
      (err: unknown) => {
        const fatal = err instanceof WebAssembly.RuntimeError;
        if (fatal) M = null;
        const error = err instanceof Error ? err.message : String(err);
        scope.postMessage({ id: msg.id, ok: false, error, fatal });
      },
    );
  };
}
