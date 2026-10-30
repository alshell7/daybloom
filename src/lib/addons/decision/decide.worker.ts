// Decision (addon): TinyDecide in its own worker, so a question never stalls a frame. The
// planner hands over the model (meta.json and model.bin, already verified) once, then asks;
// each request answers every question about one line in a single pass.

import { TinyDecide } from './vendor/tinydecide.js';

type In =
  | { type: 'load'; meta: unknown; bin: ArrayBuffer }
  | { type: 'ask'; id: number; state: string; questions: { type: string; text: string; options?: string[] }[]; protos?: unknown[] };

let model: TinyDecide | null = null;

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      model = new TinyDecide(m.meta as never, m.bin);
      postMessage({ type: 'ready' });
      return;
    }
    if (m.type === 'ask') {
      if (!model) throw new Error('Decision is not loaded yet');
      const r = model.answer({ state: m.state, questions: m.questions as never }, (m.protos ?? []) as never);
      postMessage({ type: 'answer', id: m.id, result: { answers: r.answers, truncated: r.truncated, ms: r.ms } });
    }
  } catch (err) {
    postMessage({ type: 'error', id: m.type === 'ask' ? m.id : -1, message: err instanceof Error ? err.message : String(err) });
  }
};
