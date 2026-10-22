// Settings › AI: the AI services you set up once (a key in the system keychain, a default
// model, your agreement to send them data) and what each part of Daybloom uses to think,
// listen and speak. Alef, Ask Daybloom, Make it smaller and voice input all ask here, so a key
// is entered once and a model is picked per feature in one place.
//
//   ai.ready('smaller', 'think')       → is the chosen service set up and agreed to?
//   await ai.connection('alef', 'think') → { provider, config, key } or null (use this device)

import { platform } from '../platform';
import { persisted } from '../stores/persisted.svelte';
import { baseUrl, can, providerOf, PROVIDERS, type LlmConfig, type ProviderId, type Skill } from './providers';

export type Feature = 'alef' | 'assistant' | 'starter' | 'smaller' | 'reality' | 'voice';
/** 'device': Daybloom's own on-device models (Needle, Whistle, Alef's voice) or built-in rules. */
export type Source = 'device' | ProviderId;

export interface Service {
  /** The model for thinking, unless a feature picks its own. */
  model: string;
  /** Cloudflare's account id. */
  accountId?: string;
  /** Custom: the base URL (…/v1) and extra headers. */
  baseUrl?: string;
  headers?: Record<string, string>;
  /** Models for listening and speaking, and the voice it speaks in. */
  listenModel?: string;
  speakModel?: string;
  voice?: string;
  /** When you agreed that Daybloom may send this service what it needs (ms). */
  consent?: number;
}

export interface Use {
  via: Source;
  /** A model for this feature only; else the service's own. */
  model?: string;
}

/** How Alef speaks: its chirps, the on-device voice, the system voice, a service's voice, or not at all. */
export type SpeakVia = 'chirps' | 'device' | 'system' | 'off' | ProviderId;

export interface AiFile {
  version: 1;
  services: Partial<Record<ProviderId, Service>>;
  use: {
    alef: { think: Use; speak: { via: SpeakVia; voice?: string } };
    assistant: { think: Use };
    starter: { think: Use };
    smaller: { think: Use };
    reality: { think: Use };
    voice: { listen: Use };
  };
  /** Alef's own brain settings were moved here. */
  moved?: boolean;
}

/** What each feature can be set to, and what it does, for the settings page. */
export const FEATURES: { id: Feature; name: string; icon: string; skills: Skill[]; blurb: string; device: Partial<Record<Skill, string>> }[] = [
  { id: 'alef', name: 'Alef', icon: 'bot', skills: ['think', 'speak'], blurb: 'Talks with you, plans with you and speaks up on its own', device: { think: 'This device', speak: 'Chirps' } },
  { id: 'assistant', name: 'Ask Daybloom', icon: 'sparkles', skills: ['think'], blurb: platform.isMobile ? 'Understands what you type or say' : `Understands what you type or say (${platform.os === 'mac' ? '⌘' : 'Ctrl '}K)`, device: { think: 'Needle, on this device' } },
  { id: 'starter', name: 'Getting started', icon: 'rocket', skills: ['think'], blurb: 'A tiny first step and a kind nudge when a block hasn’t started', device: { think: 'Built-in first steps' } },
  { id: 'smaller', name: 'Make it smaller', icon: 'layers', skills: ['think'], blurb: 'Splits a big task into small first steps', device: { think: 'Built-in ideas' } },
  { id: 'reality', name: 'Reality check', icon: 'hourglass', skills: ['think'], blurb: 'Plans real lengths from your own track record, with practical tips', device: { think: 'Your own numbers' } },
  { id: 'voice', name: 'Voice input', icon: 'mic', skills: ['listen'], blurb: 'Turns your voice into words', device: { listen: 'Whistle, on this device' } },
];

const DEVICE: Use = { via: 'device' };
export const DEFAULT_AI: AiFile = {
  version: 1,
  services: {},
  use: { alef: { think: DEVICE, speak: { via: 'chirps' } }, assistant: { think: DEVICE }, starter: { think: DEVICE }, smaller: { think: DEVICE }, reality: { think: DEVICE }, voice: { listen: DEVICE } },
};

const IDS = PROVIDERS.map((p) => p.id);
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined);
const source = (v: unknown): Source => (v === 'device' || IDS.includes(v as ProviderId) ? (v as Source) : 'device');
const use = (v: any): Use => ({ via: source(v?.via), ...(str(v?.model, 200) ? { model: str(v.model, 200) } : {}) });

export function migrateAi(raw: any): AiFile {
  const services: AiFile['services'] = {};
  for (const [k, v] of Object.entries(raw?.services ?? {})) {
    if (!IDS.includes(k as ProviderId) || !v || typeof v !== 'object') continue;
    const c = v as Record<string, unknown>;
    services[k as ProviderId] = {
      model: str(c.model, 200) ?? '',
      ...(str(c.accountId, 80) ? { accountId: str(c.accountId, 80) } : {}),
      ...(str(c.baseUrl, 400) ? { baseUrl: str(c.baseUrl, 400) } : {}),
      ...(c.headers && typeof c.headers === 'object' ? { headers: Object.fromEntries(Object.entries(c.headers as object).filter(([, x]) => typeof x === 'string').slice(0, 12)) as Record<string, string> } : {}),
      ...(str(c.listenModel, 200) ? { listenModel: str(c.listenModel, 200) } : {}),
      ...(str(c.speakModel, 200) ? { speakModel: str(c.speakModel, 200) } : {}),
      ...(str(c.voice, 60) ? { voice: str(c.voice, 60) } : {}),
      ...(typeof c.consent === 'number' ? { consent: c.consent } : {}),
    };
  }
  const u = raw?.use ?? {};
  const speak = u.alef?.speak?.via;
  return {
    version: 1,
    services,
    use: {
      alef: {
        think: use(u.alef?.think),
        speak: { via: ['chirps', 'device', 'system', 'off', ...IDS].includes(speak) ? speak : 'chirps', ...(str(u.alef?.speak?.voice, 60) ? { voice: str(u.alef.speak.voice, 60) } : {}) },
      },
      assistant: { think: use(u.assistant?.think) },
      starter: { think: use(u.starter?.think) },
      smaller: { think: use(u.smaller?.think) },
      reality: { think: use(u.reality?.think) },
      voice: { listen: use(u.voice?.listen) },
    },
    ...(raw?.moved ? { moved: true } : {}),
  };
}

export const aiFile = persisted<AiFile>('ai', DEFAULT_AI, migrateAi);

/** The keychain entry for a service's key. */
export const keyAccount = (p: ProviderId) => `ai:${p}`;
/** Where Alef kept keys before Settings › AI. */
const oldKeyAccount = (p: ProviderId) => `alef-llm:${p}`;

export interface Connection {
  provider: ProviderId;
  config: LlmConfig;
  key: string;
}

class Ai {
  /** Which services have a key saved (custom endpoints may not need one). */
  keys = $state<Partial<Record<ProviderId, boolean>>>({});

  get file() {
    return aiFile.value;
  }

  service(id: ProviderId): Service | undefined {
    return aiFile.value.services[id];
  }

  /** Set up and agreed to: a model, a key (unless custom) and consent. */
  connected(id: ProviderId): boolean {
    const s = this.service(id);
    // A custom address or a Cloudflare account that was cleared later doesn't count either.
    return !!s && !!s.model.trim() && !!s.consent && (id === 'custom' || !!this.keys[id]) && baseUrl(this.configOf(id, 'think')) !== null;
  }

  /** Services you can choose for a skill (this device always comes first). */
  sources(skill: Skill): Source[] {
    return ['device', ...IDS.filter((id) => can(id, skill) && this.connected(id))];
  }

  route(f: Feature, skill: Skill): Use {
    const u = aiFile.value.use;
    if (f === 'alef') {
      if (skill === 'speak') {
        const v = u.alef.speak.via;
        return { via: v === 'chirps' || v === 'system' || v === 'off' ? 'device' : v };
      }
      return u.alef.think;
    }
    if (f === 'voice') return u.voice.listen;
    return u[f].think;
  }

  setRoute(f: Feature, skill: Skill, next: Use) {
    const u = aiFile.value.use;
    if (f === 'alef' && skill === 'think') u.alef.think = next;
    else if (f === 'voice') u.voice.listen = next;
    else if (f === 'assistant' || f === 'starter' || f === 'smaller' || f === 'reality') u[f].think = next;
  }

  /** Is this feature's skill going to a service that is ready right now? */
  ready(f: Feature, skill: Skill): boolean {
    const r = this.route(f, skill);
    return r.via !== 'device' && this.connected(r.via) && can(r.via, skill);
  }

  /** The service behind a feature's skill, with the model it should use and the key. Null: use this device. */
  async connection(f: Feature, skill: Skill): Promise<Connection | null> {
    const r = this.route(f, skill);
    if (r.via === 'device' || !can(r.via, skill)) return null;
    const s = this.service(r.via);
    if (!s || !s.consent) return null;
    const key = (await this.key(r.via)) ?? '';
    if (!key && r.via !== 'custom') return null;
    return { provider: r.via, key, config: this.configOf(r.via, skill, r.model) };
  }

  /** The request config for a service and skill (the model: the feature's, then the service's). */
  configOf(id: ProviderId, skill: Skill, model?: string): LlmConfig {
    const s = this.service(id) ?? { model: '' };
    const p = providerOf(id);
    const m =
      model?.trim() ||
      (skill === 'listen' ? s.listenModel || p.listen?.models[0] : skill === 'speak' ? s.speakModel || p.speak?.models[0] : s.model) ||
      s.model;
    return { provider: id, model: m ?? '', accountId: s.accountId, baseUrl: s.baseUrl, headers: s.headers };
  }

  /** Save or change part of a service's setup. */
  configure(id: ProviderId, patch: Partial<Service>) {
    const cur = aiFile.value.services[id] ?? { model: providerOf(id).suggested[0] ?? '' };
    aiFile.value.services = { ...aiFile.value.services, [id]: { ...cur, ...patch } };
  }

  /** Remove a service: its key, its setup, and every feature that used it goes back to this device. */
  async remove(id: ProviderId) {
    await this.forgetKey(id);
    const { [id]: _, ...rest } = aiFile.value.services;
    aiFile.value.services = rest;
    const u = aiFile.value.use;
    for (const f of ['assistant', 'starter', 'smaller', 'reality'] as const) if (u[f].think.via === id) u[f].think = DEVICE;
    if (u.alef.think.via === id) u.alef.think = DEVICE;
    if (u.alef.speak.via === id) u.alef.speak = { via: 'chirps' };
    if (u.voice.listen.via === id) u.voice.listen = DEVICE;
  }

  agree(id: ProviderId, on: boolean) {
    this.configure(id, { consent: on ? Date.now() : undefined });
  }

  async key(id: ProviderId): Promise<string | null> {
    try {
      return (await platform.secrets.get(keyAccount(id))) ?? null;
    } catch {
      return null;
    }
  }

  async saveKey(id: ProviderId, key: string) {
    await platform.secrets.set(keyAccount(id), key.trim());
    this.keys = { ...this.keys, [id]: true };
  }

  async forgetKey(id: ProviderId) {
    try {
      await platform.secrets.delete(keyAccount(id));
    } catch {
      /* already gone */
    }
    this.keys = { ...this.keys, [id]: false };
  }

  async refreshKeys() {
    const out: Partial<Record<ProviderId, boolean>> = {};
    await Promise.all(Object.keys(aiFile.value.services).map(async (id) => (out[id as ProviderId] = !!(await this.key(id as ProviderId)))));
    this.keys = out;
  }
}

export const ai = new Ai();

if (import.meta.env.DEV) (globalThis as { __ai?: Ai }).__ai = ai;

/**
 * Load Settings › AI (every window). The first time, the planner moves Alef's own brain setup
 * here: each provider's model, address and agreement, its key, and Alef's brain and voice.
 */
export async function startAi(isMain: boolean): Promise<void> {
  if (!aiFile.ready) await aiFile.load();
  if (isMain && !aiFile.value.moved) {
    try {
      const { alefFile } = await import('../addons/alef/alef.svelte');
      if (!alefFile.ready) await alefFile.load();
      const a = alefFile.value.settings as unknown as Record<string, any>;
      const services = { ...aiFile.value.services };
      for (const [k, c] of Object.entries((a.configs ?? {}) as Record<string, any>)) {
        const id = k as ProviderId;
        if (!IDS.includes(id) || services[id]) continue;
        services[id] = { model: c?.model ?? '', ...(c?.accountId ? { accountId: c.accountId } : {}), ...(c?.baseUrl ? { baseUrl: c.baseUrl } : {}), ...(c?.headers ? { headers: c.headers } : {}), ...(a.consent?.[id] ? { consent: a.consent[id] } : {}) };
        const old = await platform.secrets.get(oldKeyAccount(id)).catch(() => null);
        if (old && !(await ai.key(id))) await platform.secrets.set(keyAccount(id), old).catch(() => {});
      }
      aiFile.value.services = services;
      if (a.brain && a.brain !== 'local' && IDS.includes(a.brain)) aiFile.value.use.alef.think = { via: a.brain };
      const v = a.voice;
      if (v === 'speech') aiFile.value.use.alef.speak = { via: 'device' };
      else if (v === 'system' || v === 'off' || v === 'chirps') aiFile.value.use.alef.speak = { via: v };
    } catch (e) {
      console.warn('[daybloom] moving Alef’s AI setup', e);
    }
    aiFile.value.moved = true;
  }
  await ai.refreshKeys();
}
