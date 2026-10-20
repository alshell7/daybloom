// Alef's spoken voice: tiny-tts on this device. Four files, downloaded once when you ask (about
// 30 MB), each from a pinned place and checked against its SHA-256, kept with the assistant's
// models: the voice model (Hugging Face), the CMU dictionary and the g2p model (tiny-tts 5.0.1
// on npm) and ONNX Runtime's WebAssembly (1.29.0 on npm). The worker loads on the first line
// Alef speaks and goes away after a few quiet minutes.

import { platform } from '../../../platform';
import type { WeightsSpec, WeightsStore } from '../../../assistant/engine.svelte';
import type { SpeechSynth } from '../voice';

export type TtsStatus = 'absent' | 'downloading' | 'loading' | 'ready' | 'error';

export const VOICE_FILES: Required<WeightsSpec>[] = [
  { file: 'tinytts.onnx', url: 'https://huggingface.co/backtracking/tiny-tts/resolve/6d0cc902621451fcd47462b50ee0aabc6a852e25/tinytts.onnx', sha256: '2a12614685c76597d3eeec6772f2c9ce132001cf6ea8a80609f8db9fd7fb745f', bytes: 6_510_795 },
  { file: 'tinytts-cmudict.json', url: 'https://cdn.jsdelivr.net/npm/tiny-tts@5.0.1/cmudict.json', sha256: '592b3a124fc79d850eaa1ec117b13503a48723ae710555fd44f155ba71409740', bytes: 5_312_138 },
  { file: 'tinytts-g2p.json', url: 'https://cdn.jsdelivr.net/npm/tiny-tts@5.0.1/g2p_model.json', sha256: 'b9bf424ae0d6fea011960032cee6615097db23ab71c5770576c9c44103f1b49f', bytes: 4_486_462 },
  { file: 'ort-wasm-simd-threaded.wasm', url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/ort-wasm-simd-threaded.wasm', sha256: 'ec8580a9d7b9476ceee52e10a7f94124e4dc71a019d666ed6d4726697c109a4d', bytes: 13_961_845 },
];

export const VOICE_BYTES = VOICE_FILES.reduce((a, f) => a + f.bytes, 0);
const IDLE_MS = 4 * 60_000;

type Reply = { id: number; ok: boolean; error?: string; samples?: Float32Array; rate?: number };

class TinyTts implements SpeechSynth {
  status = $state<TtsStatus>('absent');
  progress = $state(0);
  error = $state<string | null>(null);

  #stores: WeightsStore[] | null = null;
  #worker: Worker | null = null;
  #loading: Promise<void> | null = null;
  #seq = 0;
  #waiting = new Map<number, (r: Reply) => void>();
  #idle: ReturnType<typeof setTimeout> | null = null;
  #checked = false;

  async #storesOf(): Promise<WeightsStore[]> {
    if (this.#stores) return this.#stores;
    const { nativeStore, browserStore } = await import('../../../assistant/engine.svelte');
    this.#stores = VOICE_FILES.map((f) => (platform.isNative ? nativeStore(f) : browserStore(f, undefined, 'daybloom-alef-voice')));
    return this.#stores;
  }

  /** Is the voice here? (Once per launch; cheap.) */
  async check(): Promise<boolean> {
    if (this.#checked) return this.status === 'ready';
    this.#checked = true;
    try {
      const has = await Promise.all((await this.#storesOf()).map((s) => s.has()));
      if (has.every(Boolean)) this.status = 'ready';
    } catch {
      /* stays absent */
    }
    return this.status === 'ready';
  }

  ready() {
    return this.status === 'ready';
  }

  /** Download what's missing, verified. */
  async download(): Promise<void> {
    if (this.status === 'downloading') return;
    this.status = 'downloading';
    this.error = null;
    this.progress = 0;
    try {
      const stores = await this.#storesOf();
      let done = 0;
      for (let i = 0; i < stores.length; i++) {
        const s = stores[i];
        const f = VOICE_FILES[i];
        if (!(await s.has())) await s.download((got) => (this.progress = (done + got) / VOICE_BYTES));
        done += f.bytes;
        this.progress = done / VOICE_BYTES;
      }
      this.status = 'ready';
    } catch (e) {
      this.status = 'error';
      this.error = `Couldn't get Alef's voice: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async forget(): Promise<void> {
    this.#unload();
    for (const s of await this.#storesOf()) await s.forget().catch(() => {});
    this.status = 'absent';
  }

  #unload() {
    this.#worker?.terminate();
    this.#worker = null;
    this.#loading = null;
    for (const [, cb] of this.#waiting) cb({ id: 0, ok: false, error: 'voice unloaded' });
    this.#waiting.clear();
  }

  #call(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<Reply> {
    const id = ++this.#seq;
    return new Promise((resolve) => {
      this.#waiting.set(id, resolve);
      this.#worker!.postMessage({ ...msg, id }, transfer);
    });
  }

  async #load(): Promise<void> {
    if (this.#worker && !this.#loading) return;
    if (this.#loading) return this.#loading;
    this.#loading = (async () => {
      const stores = await this.#storesOf();
      const [model, cmu, g2p, wasm] = await Promise.all(stores.map((s) => s.read()));
      const w = new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module', name: 'alef-voice' });
      w.onmessage = (e: MessageEvent<Reply>) => {
        const cb = this.#waiting.get(e.data.id);
        this.#waiting.delete(e.data.id);
        cb?.(e.data);
      };
      w.onerror = (e) => {
        e.preventDefault();
        this.error = e.message || 'voice crashed';
        this.#unload();
      };
      this.#worker = w;
      const r = await this.#call({ type: 'init', wasm, model, cmu, g2p }, [wasm, model, cmu, g2p]);
      if (!r.ok) throw new Error(r.error ?? 'voice failed to load');
    })();
    try {
      await this.#loading;
    } catch (e) {
      this.#unload();
      throw e;
    } finally {
      this.#loading = null;
    }
  }

  async synth(text: string, o: { speed?: number } = {}): Promise<{ samples: Float32Array; rate: number } | null> {
    if (this.status !== 'ready') return null;
    if (this.#idle) clearTimeout(this.#idle);
    try {
      await this.#load();
      const r = await this.#call({ type: 'synth', text: text.slice(0, 600), speed: o.speed ?? 1 });
      if (!r.ok || !r.samples) throw new Error(r.error ?? 'no audio');
      return { samples: r.samples, rate: r.rate ?? 44100 };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    } finally {
      this.#idle = setTimeout(() => this.#unload(), IDLE_MS);
    }
  }
}

export const tinyTts = new TinyTts();
