// Small pieces Settings › AI shares: a service's state at a glance, custom headers as text,
// what each skill is called, the spring its pickers settle with, and playing a voice sample.

import type { ProviderId, Skill } from '../../../lib/ai/providers';
import type { Service } from '../../../lib/ai/hub.svelte';
import { audioOut } from '../../../lib/sound';

/** How a skill reads on the page. */
export const SKILLS: Record<Skill, { label: string; verb: string; icon: string }> = {
  think: { label: 'Thinks', verb: 'thinks', icon: 'brain-circuit' },
  listen: { label: 'Listens', verb: 'listens', icon: 'ear' },
  speak: { label: 'Speaks', verb: 'speaks', icon: 'speech' },
};

/** Not set up · set up but waiting for your OK · connected. */
export type ServiceState = 'none' | 'consent' | 'on';

/** What's still missing before a service can be agreed to (empty: ready). */
export function missing(id: ProviderId, s: Service | undefined, hasKey: boolean): string[] {
  const out: string[] = [];
  if (id === 'custom' && !/^https?:\/\/\S+/i.test(s?.baseUrl?.trim() ?? '')) out.push('an address');
  if (id === 'cloudflare' && !/^[a-f0-9]{16,64}$/i.test(s?.accountId?.trim() ?? '')) out.push('your account ID');
  if (id !== 'custom' && !hasKey) out.push('a key');
  if (!s?.model.trim()) out.push('a model');
  return out;
}

/** The same test as `ai.connected`, plus "set up but not agreed to yet". */
export function serviceState(id: ProviderId, s: Service | undefined, hasKey: boolean): ServiceState {
  if (!s || !s.model.trim() || (id !== 'custom' && !hasKey)) return 'none';
  return s.consent ? 'on' : 'consent';
}

export const STATE_LABEL: Record<ServiceState, string> = { none: 'Not set up', consent: 'Needs your OK', on: 'Connected' };

/** Extra headers as "Name: value" lines, and back. */
export const headersText = (h?: Record<string, string>) =>
  Object.entries(h ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

export function parseHeaders(t: string): Record<string, string> {
  const h: Record<string, string> = {};
  for (const line of t.split('\n')) {
    const m = /^\s*([\w-]+)\s*:\s*(.+?)\s*$/.exec(line);
    if (m) h[m[1]] = m[2];
  }
  return h;
}

/** A damped spring from 0 to 1 (about 8% overshoot, settled by t = 1), for Svelte transitions. */
export function spring(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const z = 0.62;
  const w = 5.3 / z;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Opening: the height eases open while the content springs into place (a little overshoot,
 * then it settles). Put it on a wrapper without padding or margin. `still`: no motion.
 */
export function expand(node: HTMLElement, { still = false, duration = 460 }: { still?: boolean; duration?: number } = {}) {
  const h = node.offsetHeight;
  return {
    duration: still ? 0 : duration,
    css: (t: number) => {
      const s = spring(t);
      return `overflow:clip;height:${easeOut(Math.min(1, t * 1.25)) * h}px;opacity:${Math.min(1, t * 2)};transform:translateY(${(1 - s) * -8}px) scale(${0.98 + 0.02 * s});transform-origin:50% 0`;
    },
  };
}

/** Closing: quicker and plain. */
export function collapse(node: HTMLElement, { still = false }: { still?: boolean } = {}) {
  const h = node.offsetHeight;
  return {
    duration: still ? 0 : 200,
    css: (t: number) => `overflow:clip;height:${easeOut(t) * h}px;opacity:${t}`,
  };
}

/** A small thing landing: pops in from small with the spring. */
export function pop(_node: Element, { still = false, duration = 420 }: { still?: boolean; duration?: number } = {}) {
  return { duration: still ? 0 : duration, css: (t: number) => `transform:scale(${0.4 + 0.6 * spring(t)});opacity:${Math.min(1, t * 3)}` };
}

/** Words settling into place: a short rise with the spring. */
export function rise(_node: Element, { still = false, duration = 420 }: { still?: boolean; duration?: number } = {}) {
  return { duration: still ? 0 : duration, css: (t: number) => `transform:translateY(${(1 - spring(t)) * 5}px);opacity:${Math.min(1, t * 2.5)}` };
}

let playing: AudioBufferSourceNode | null = null;

/** Stop a sample that is playing. */
export function stopSample() {
  try {
    playing?.stop();
  } catch {
    /* already stopped */
  }
  playing = null;
}

/**
 * Play encoded audio (a service's WAV) once through the app's sound output. False when sounds
 * are off in Settings; resolves when it ends.
 */
export async function playSample(bytes: ArrayBuffer): Promise<boolean> {
  const out = audioOut();
  if (!out) return false;
  stopSample();
  const buf = await out.ctx.decodeAudioData(bytes.slice(0));
  const src = out.ctx.createBufferSource();
  src.buffer = buf;
  src.connect(out.master);
  playing = src;
  await new Promise<void>((done) => {
    src.onended = () => done();
    src.start();
  });
  if (playing === src) playing = null;
  return true;
}
