// Alef's voice, off the main thread: tiny-tts (a 1.6M-parameter VITS-style model, Apache-2.0)
// on ONNX Runtime Web (MIT). The runtime gets its WebAssembly as bytes we downloaded and
// verified ourselves (no fetches of its own), one thread, no proxy. Text becomes phoneme ids
// (g2p.ts), sentence by sentence, and comes back as 44.1 kHz samples.

import * as ort from 'onnxruntime-web/wasm';
import { loadG2p, SAMPLE_RATE, toIds, type CmuDict, type G2pModel } from './g2p';

type In = { id: number; type: 'init'; wasm: ArrayBuffer; model: ArrayBuffer; cmu: ArrayBuffer; g2p: ArrayBuffer } | { id: number; type: 'synth'; text: string; speed: number };

let session: ort.InferenceSession | null = null;
let cmu: CmuDict | null = null;
let g2p: G2pModel | null = null;

const post = (m: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);
const decode = (b: ArrayBuffer) => JSON.parse(new TextDecoder().decode(b));
const i64 = (xs: number[]) => BigInt64Array.from(xs, (v) => BigInt(v));

async function sentence(text: string, speed: number): Promise<Float32Array> {
  const { x, tone, lang } = toIds(text, cmu!, g2p);
  const n = x.length;
  const feeds: Record<string, ort.Tensor> = {
    x: new ort.Tensor('int64', i64(x), [1, n]),
    x_lengths: new ort.Tensor('int64', i64([n]), [1]),
    sid: new ort.Tensor('int64', i64([0]), [1]),
    tone: new ort.Tensor('int64', i64(tone), [1, n]),
    language: new ort.Tensor('int64', i64(lang), [1, n]),
    bert: new ort.Tensor('float32', new Float32Array(n * 1024), [1, 1024, n]),
    ja_bert: new ort.Tensor('float32', new Float32Array(n * 768), [1, 768, n]),
    noise_scale: new ort.Tensor('float32', new Float32Array([0.6]), [1]),
    noise_scale_w: new ort.Tensor('float32', new Float32Array([0.8]), [1]),
    length_scale: new ort.Tensor('float32', new Float32Array([1 / speed]), [1]),
  };
  const out = await session!.run(feeds);
  return (out.audio ?? Object.values(out)[0]).data as Float32Array;
}

/** Sentences, so a long line keeps its rhythm and nothing runs out of memory. */
export function split(text: string): string[] {
  const parts = text.match(/[^.!?…;]+[.!?…;]*/g) ?? [text];
  return parts.map((p) => p.trim()).filter((p) => /[a-z0-9]/i.test(p)).slice(0, 12);
}

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      ort.env.wasm.wasmBinary = m.wasm;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      session = await ort.InferenceSession.create(new Uint8Array(m.model), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      cmu = decode(m.cmu);
      g2p = loadG2p(decode(m.g2p));
      post({ id: m.id, ok: true });
    } else if (m.type === 'synth') {
      if (!session || !cmu) throw new Error('voice not loaded');
      const chunks: Float32Array[] = [];
      const pause = new Float32Array(Math.round(SAMPLE_RATE * 0.14));
      for (const s of split(m.text)) {
        if (chunks.length) chunks.push(pause);
        chunks.push(await sentence(s, m.speed));
      }
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const samples = new Float32Array(total);
      let o = 0;
      for (const c of chunks) {
        samples.set(c, o);
        o += c.length;
      }
      post({ id: m.id, ok: true, samples, rate: SAMPLE_RATE }, [samples.buffer]);
    }
  } catch (err) {
    post({ id: m.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
