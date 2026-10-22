// Alef, the live side. The main window runs the feelings: it watches the day (signals.ts),
// lets moments move the mood (affect.ts), plays a behaviour for each (behaviors.ts), chirps
// and sometimes says a line (lines.ts) with a helping hand under it (coach.ts: start for two
// minutes, make it smaller, move it…), and keeps Alef alive between moments with small idle
// performances. It reacts at once to what you do (a new block, a move, a new look) and glances
// at what you touch. With an AI brain from Settings › AI it talks with you and the planner's
// tools, and says its own moments in its own words (muse.ts); otherwise it answers on this
// device. The widget only mirrors the face and bubble (startAlefView).

import { attention } from '../../native/attention.svelte';
import { untrack } from 'svelte';
import { isoOf, MINUTE, formatTime } from '../../engine/time';
import type { Block } from '../../engine/types';
import { platform } from '../../platform';
import { shownTitle } from '../../privacy';
import { clock } from '../../stores/clock.svelte';
import { persisted } from '../../stores/persisted.svelte';
import { settings } from '../../stores/settings.svelte';
import { taskFile } from '../../stores/tasks.svelte';
import { timer } from '../../stores/timer.svelte';
import { view } from '../../stores/view.svelte';
import type { Entry } from '../../assistant/session.svelte';
import type { Call } from '../../assistant/tools';
import { behaviorForEvent, idleBehavior, impulse, moodTarget, settle, type Affect, type AffectEvent } from './affect';
import { ACTS, BEHAVIOR_IDS, lengthOf, type ActId, type BehaviorId, type ChirpId } from './behaviors';
import { chirp } from './chirps';
import { moodGlow, moodLed } from './face';
import { screenPalette, type ScreenPalette, type ScreenStyle } from './palette';
import type { AboutYou } from './persona';
import type { Finish } from '../../presets';
import { lateLine, lineFor, speaksFor, type Chattiness } from './lines';
import type { LlmConfig, ProviderId } from './llm';
import { moments, NOTHING_SEEN, signalsOf, type Seen, type Snapshot } from './signals';
import { hush, speak, type SpeechSynth, type VoiceMode } from './voice';
import { ai, aiFile } from '../../ai/hub.svelte';
import { helpFor, type Help, type Offer } from './coach';
import { isOn } from '../registry';
import { starter } from '../../starter.svelte';

export type Brain = 'local' | ProviderId;

export interface AlefSettings {
  /** The eyes' colour: 'dial' follows the dial's finish, or one colour. */
  eyes: string;
  /** The screen: in the dial's colours, or classic OLED black. */
  screen: ScreenStyle;
  /** A glassy shine on the screen. */
  glare: boolean;
  /** About you: a name to use, a few lines in your words, and how Alef talks. */
  you: AboutYou;
  /** The mood light: 'feeling' follows Alef's feelings, or one fixed colour. */
  led: string;
  voice: VoiceMode;
  /** 0.8 (lower) … 1.3 (higher). */
  pitch: number;
  volume: number;
  chattiness: Chattiness;
  /** Alef's face in the dial's centre (planner and focus). */
  onDial: boolean;
  /** …and on the desktop widget. */
  inWidget: boolean;
  /** Little performances between moments: often, or now and then. */
  lively: boolean;
  /** The AI brain may change plans (each change shows with an Undo). */
  mayChange: boolean;
  /** With an AI brain: Alef also speaks up on its own, in its own words (a few times a day). */
  proactive: boolean;
  brain: Brain;
  /** Per provider: model, Cloudflare account, custom address and headers. */
  configs: Partial<Record<ProviderId, Omit<LlmConfig, 'provider'>>>;
  /** You agreed that this provider may read your blocks and settings. */
  consent: Partial<Record<ProviderId, number>>;
}

export interface AlefFile {
  version: 1;
  settings: AlefSettings;
  /** The day you met. */
  met: string | null;
  /** Your friendship: the days you spent together, pets and chats, and the milestone last celebrated. */
  bond: { days: string[]; pets: number; chats: number; celebrated?: number };
  /** The last words you and Alef said to each other, so a conversation picks up where it left off. */
  recent?: { who: 'you' | 'alef'; text: string; at: number; ui?: string }[];
}

export const EYE_COLORS = [
  { id: 'dial', name: 'The dial’s colour' },
  { id: '#5CE1E6', name: 'Cyan' },
  { id: '#7CF29A', name: 'Mint' },
  { id: '#7AB8FF', name: 'Sky' },
  { id: '#B69CFF', name: 'Lilac' },
  { id: '#FF8FC7', name: 'Rose' },
  { id: '#FFC75C', name: 'Amber' },
  { id: '#F4F7FB', name: 'Moon' },
];

export const DEFAULT_ALEF: AlefSettings = {
  eyes: 'dial',
  screen: 'dial',
  glare: true,
  you: { name: '', about: '', tone: 'warm' },
  led: 'feeling',
  voice: 'chirps',
  pitch: 1,
  volume: 0.7,
  chattiness: 'some',
  onDial: true,
  inWidget: true,
  lively: true,
  mayChange: true,
  proactive: true,
  brain: 'local',
  configs: {},
  consent: {},
};

const VOICES: VoiceMode[] = ['chirps', 'speech', 'system', 'off'];
const CHATTY: Chattiness[] = ['quiet', 'some', 'chatty'];
const BRAINS: Brain[] = ['local', 'openai', 'anthropic', 'gemini', 'openrouter', 'cloudflare', 'custom'];
const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

export function migrateAlef(raw: any): AlefFile {
  const s = raw?.settings ?? {};
  const configs: AlefSettings['configs'] = {};
  for (const [k, v] of Object.entries(s.configs ?? {})) {
    if (!BRAINS.includes(k as Brain) || k === 'local' || !v || typeof v !== 'object') continue;
    const c = v as Record<string, unknown>;
    configs[k as ProviderId] = {
      model: typeof c.model === 'string' ? c.model.slice(0, 200) : '',
      ...(typeof c.accountId === 'string' ? { accountId: c.accountId.slice(0, 80) } : {}),
      ...(typeof c.baseUrl === 'string' ? { baseUrl: c.baseUrl.slice(0, 400) } : {}),
      ...(c.headers && typeof c.headers === 'object' ? { headers: Object.fromEntries(Object.entries(c.headers as object).filter(([, x]) => typeof x === 'string').slice(0, 12)) as Record<string, string> } : {}),
    };
  }
  const consent: AlefSettings['consent'] = {};
  for (const [k, v] of Object.entries(s.consent ?? {})) if (BRAINS.includes(k as Brain) && typeof v === 'number') consent[k as ProviderId] = v;
  return {
    version: 1,
    met: typeof raw?.met === 'string' ? raw.met : null,
    bond: {
      days: Array.isArray(raw?.bond?.days) ? raw.bond.days.filter((d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-400) : [],
      pets: Number.isFinite(raw?.bond?.pets) ? Math.max(0, raw.bond.pets) : 0,
      chats: Number.isFinite(raw?.bond?.chats) ? Math.max(0, raw.bond.chats) : 0,
      celebrated: Number.isFinite(raw?.bond?.celebrated) ? Math.max(0, raw.bond.celebrated) : 0,
    },
    recent: Array.isArray(raw?.recent)
      ? raw.recent
          .filter((m: any) => (m?.who === 'you' || m?.who === 'alef') && typeof m?.text === 'string' && Number.isFinite(m?.at))
          .slice(-40)
          .map((m: any) => ({ who: m.who, text: m.text.slice(0, 4000), at: m.at, ...(typeof m.ui === 'string' && m.ui.length <= 6000 ? { ui: m.ui } : {}) }))
      : [],
    settings: {
      eyes: s.eyes === 'dial' ? 'dial' : hex(s.eyes, DEFAULT_ALEF.eyes),
      screen: s.screen === 'oled' ? 'oled' : 'dial',
      glare: s.glare !== false,
      you: {
        name: typeof s.you?.name === 'string' ? s.you.name.slice(0, 40) : '',
        about: typeof s.you?.about === 'string' ? s.you.about.slice(0, 1200) : '',
        tone: ['warm', 'playful', 'calm', 'brief'].includes(s.you?.tone) ? s.you.tone : 'warm',
      },
      led: s.led === 'feeling' ? 'feeling' : hex(s.led, 'feeling'),
      voice: VOICES.includes(s.voice) ? s.voice : DEFAULT_ALEF.voice,
      pitch: num(s.pitch, 1, 0.8, 1.3),
      volume: num(s.volume, 0.7, 0, 1),
      chattiness: CHATTY.includes(s.chattiness) ? s.chattiness : DEFAULT_ALEF.chattiness,
      onDial: s.onDial !== false,
      inWidget: s.inWidget !== false,
      lively: s.lively !== false,
      mayChange: s.mayChange !== false,
      proactive: s.proactive !== false,
      brain: BRAINS.includes(s.brain) ? s.brain : 'local',
      configs,
      consent,
    },
  };
}

export const alefFile = persisted<AlefFile>('addon-alef', migrateAlef(null), migrateAlef);

/** Where Alef's AI keys lived before Settings › AI (moved by startAi). */
export const keyAccount = (p: ProviderId) => `alef-llm:${p}`;

/** Friendship milestones (days together) Alef celebrates once each. */
export const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

export interface Msg {
  id: number;
  who: 'you' | 'alef';
  text: string;
  at: number;
  feeling?: BehaviorId;
  /** A local answer's card (the planner's own tools). */
  entry?: Entry;
  /** Tools the AI brain used. */
  tools?: string[];
  via?: 'ai' | 'device';
  error?: boolean;
  /** Why the AI brain didn't answer this time. */
  note?: string;
  /** The AI's generative UI (OpenUI Lang), drawn under the words. */
  ui?: string;
  pending?: boolean;
}

/** What the widget needs to mirror the face. */
interface Mirror {
  perf?: { id: ActId; seq: number };
  affect?: Affect;
  talk?: { seq: number; starts: number[]; total: number } | null;
  bubble?: Bubble | null;
  thinking?: boolean;
  glance?: { x: number; y: number } | null;
  /** The planner is hidden: the widget plays this chirp… */
  sound?: { chirp: ChirpId; pitch: number; volume: number };
  /** …or says this line. */
  speak?: string;
}

/** A line in Alef's speech bubble, with its helping hand (buttons) if any. */
export interface Bubble {
  text: string;
  seq: number;
  offers?: Offer[];
}

/** Feeling colours for the mood light. */
export function ledOf(id: ActId, s: AlefSettings): string {
  return s.led === 'feeling' ? ACTS[id].led : s.led;
}

class Alef {
  affect = $state<Affect>({ v: 0.25, a: 0.05 });
  /** The behaviour playing (or last played) and a counter that restarts it. */
  perf = $state<{ id: ActId; seq: number }>({ id: 'blinking', seq: 0 });
  /** While a behaviour plays: the dial's posture and the blocks' lift follow it. */
  performing = $state(false);
  /** A line in a speech bubble. */
  bubble = $state<Bubble | null>(null);
  /** Where Alef glances for a moment (−1..1 each way): a block you picked, the way you scrolled. */
  glance = $state<{ x: number; y: number } | null>(null);
  /** What the AI brain is doing right now ("Finding free time…"). */
  doing = $state<string | null>(null);
  /** Syllable timings while Alef speaks (the eyes bob to them). */
  talk = $state<{ seq: number; starts: number[]; total: number } | null>(null);
  thinking = $state(false);
  /** You're typing to Alef (it watches the field). */
  typing = $state(false);
  messages = $state<Msg[]>([]);
  busy = $state(false);
  /** The on-device voice, once loaded (tts/). */
  tts = $state.raw<SpeechSynth | null>(null);

  get settings() {
    return alefFile.value.settings;
  }

  /** The mood light's colour now: the feeling's while one plays, the mood's otherwise (or a fixed one). */
  get led(): string {
    const s = this.settings.led;
    return s === 'feeling' ? moodLed(this.affect, this.performing ? this.perf.id : null) : s;
  }
  get glow(): number {
    return moodGlow(this.affect, this.performing ? this.perf.id : null);
  }

  /** The screen and eyes in this dial's colours. */
  screenFor(finish: Finish): ScreenPalette {
    return screenPalette(finish, this.settings.screen, this.settings.eyes, this.settings.glare);
  }

  #seq = 0;
  #msg = 0;
  #reactions = 0;
  #perfTimer: ReturnType<typeof setTimeout> | null = null;
  #bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  #lastChirp = 0;
  #lastLine = 0;
  #pokes: number[] = [];
  #lastTouch = 0;
  /** Asleep after a "sleeping" performance, until the next one. */
  asleep = $state(false);
  /** Main window: broadcast to the widget. */
  mirror = false;

  /** Play a behaviour: the face, the dial's posture and lift, and (if asked) its chirp. */
  perform(id: ActId, o: { sound?: boolean } = {}) {
    const b = ACTS[id];
    this.asleep = id === 'sleeping';
    this.perf = { id, seq: ++this.#seq };
    this.performing = true;
    if (this.#perfTimer) clearTimeout(this.#perfTimer);
    this.#perfTimer = setTimeout(() => (this.performing = false), Math.min(lengthOf(b), 6000) + 120);
    if (o.sound && b.chirp !== 'none' && b.chirp !== 'blink') this.#chirp(id);
    this.#send({ perf: this.perf, affect: this.affect });
  }

  #chirp(id: ActId) {
    const s = this.settings;
    if (aiFile.value.use.alef.speak.via === 'off' || !settings.value.sound) return;
    const now = Date.now();
    if (now - this.#lastChirp < 2500) return;
    this.#lastChirp = now;
    const sound = { chirp: ACTS[id].chirp, pitch: s.pitch, volume: s.volume };
    if (this.#elsewhere) this.#send({ sound });
    else chirp(sound.chirp, sound);
  }

  /**
   * The planner is hidden and the widget shows Alef: its sounds play there, where you are. A
   * hidden window's audio wakes late (seconds, sometimes), so a poke on the widget would chirp
   * long after the face moved.
   */
  get #elsewhere(): boolean {
    return this.mirror && typeof document !== 'undefined' && document.hidden && settings.value.widget.visible && this.settings.inWidget;
  }

  /**
   * A moment happened: feel it, show it, maybe say something — with a helping hand when the
   * moment calls for one. With an AI brain, the words may be its own (muse.ts); the face never
   * waits for them.
   */
  react(ev: AffectEvent | 'stuck' | 'gap', o: { block?: Block | null; name?: string; inMin?: number; count?: number; quiet?: boolean; line?: string | null; help?: Help | null } = {}) {
    const affectEv: AffectEvent = ev === 'stuck' || ev === 'gap' ? 'nudge' : ev;
    this.affect = impulse(this.affect, affectEv);
    const id = behaviorForEvent(affectEv, this.affect);
    const title = o.block ? shownTitle(o.block.title, o.block.category) : undefined;
    const seed = this.#seq + Math.floor(clock.now / 1000);
    const chatty = this.settings.chattiness;
    // A block starting (or stuck): Help me start's prepared first step, if there is one.
    const first = (ev === 'blockStart' || ev === 'stuck') && o.block && o.help === undefined && chatty !== 'quiet' ? starter.helpFor(o.block.key) : null;
    const help =
      o.help !== undefined
        ? o.help
        : first
          ? first
          : chatty === 'quiet'
          ? null
          : helpFor(ev, {
              title,
              key: o.block?.key,
              minutes: o.block ? Math.round((o.block.endMs - o.block.startMs) / MINUTE) : undefined,
              own: o.block?.kind === 'task',
              smaller: isOn('smaller'),
              crumbs: isOn('crumbs'),
              who: this.settings.you.name.trim() || undefined,
              seed,
            });
    const plain =
      o.line !== undefined
        ? o.line
        : ev === 'stuck' || ev === 'gap'
          ? null
          : lineFor(ev, { title, at: o.block ? formatTime(o.block.startMs, view.hour12) : undefined, inMin: o.inMin, count: o.count, name: o.name, hour: new Date(clock.now).getHours(), seed, who: this.settings.you.name.trim() || undefined }, chatty);
    const line = help && (ev === 'stuck' || ev === 'gap' || speaksFor(ev as AffectEvent, chatty) || ev === 'checkIn') ? help.line : plain;
    // A line speaks for itself; otherwise the chirp does.
    this.perform(id, { sound: !o.quiet && !line });
    // The whole day done: after the cheer, a little dance.
    if (ev === 'allDone') setTimeout(() => this.perform('dancing', { sound: true }), lengthOf(ACTS[id]) + 300);
    if (!line || o.quiet) return;
    const offers = line === help?.line ? help.offers : undefined;
    const important = ['allDone', 'poke', 'pokeAgain', 'pokeTooMuch', 'greet', 'milestone', 'stuck', 'checkIn'].includes(ev) || !!offers;
    const mine = ++this.#reactions;
    void import('./muse')
      .then(async ({ canMuse, muse }) => {
        if (!canMuse(ev)) return null;
        this.thinking = true;
        this.#send({ thinking: true });
        try {
          return await muse({ moment: ev, fallback: line, offers: (offers ?? []).map((x) => x.label), feeling: id });
        } finally {
          this.thinking = false;
          this.#send({ thinking: false });
        }
      })
      .catch(() => null)
      .then((m) => {
        // Something newer happened meanwhile: let it speak instead.
        if (this.#reactions !== mine) return;
        if (m?.feeling && m.feeling !== id) this.perform(m.feeling);
        this.say(m?.text ?? line, { voice: true, important, offers });
      });
  }

  /** Show a line in the bubble (and speak it, in Alef's voice); `offers` puts buttons under it. */
  say(text: string, o: { voice?: boolean; important?: boolean; ms?: number; offers?: Offer[] } = {}) {
    const now = Date.now();
    if (!o.important && now - this.#lastLine < 15_000) return;
    this.#lastLine = now;
    this.bubble = { text, seq: ++this.#seq, ...(o.offers?.length ? { offers: o.offers } : {}) };
    this.#send({ bubble: this.bubble });
    if (this.#bubbleTimer) clearTimeout(this.#bubbleTimer);
    // With buttons under it, the bubble waits longer for you.
    this.#bubbleMs = o.ms ?? readingMs(text) + (o.offers?.length ? 14_000 : 0);
    this.#hideBubbleLater(this.#bubbleMs);
    if (o.voice) void this.#voice(text);
  }

  /** A button under the bubble: do it, and feel good about it. */
  async act(seq: number, index: number) {
    const offer = this.bubble?.seq === seq ? this.bubble.offers?.[index] : undefined;
    if (!offer) return;
    this.dismissBubble();
    const { runOffer } = await import('./offers');
    const r = runOffer(offer);
    if (r) {
      this.react(offer.id === 'start2' ? 'started' : offer.id === 'tick' ? 'done' : 'answered', { line: r.line ?? null, block: r.block ?? null, quiet: !r.line });
    }
  }

  /** Glance somewhere for a moment (−1..1 each way), then look back. */
  look(x: number, y: number, ms = 1100) {
    this.glance = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    this.#send({ glance: this.glance });
    if (this.#glanceTimer) clearTimeout(this.#glanceTimer);
    this.#glanceTimer = setTimeout(() => {
      this.glance = null;
      this.#send({ glance: null });
    }, ms);
  }
  #glanceTimer: ReturnType<typeof setTimeout> | null = null;

  async #voice(text: string) {
    if (this.#elsewhere) {
      // The widget says it (and moves its eyes to it).
      this.#send({ speak: text });
      return;
    }
    await this.#speakHere(text);
  }

  /** Say it in this window, in the voice from Settings › AI, and bob the eyes to the syllables. */
  async #speakHere(text: string) {
    const s = this.settings;
    const via = aiFile.value.use.alef.speak.via;
    // The widget loads the on-device voice the first time it has to speak.
    if (via === 'device' && !this.tts) {
      try {
        const m = await import('./tts/tts.svelte');
        this.tts = m.tinyTts;
        await m.tinyTts.check();
      } catch {
        /* the system voice speaks instead */
      }
    }
    const mode: VoiceMode | 'cloud' = via === 'device' ? 'speech' : via === 'chirps' || via === 'system' || via === 'off' ? via : 'cloud';
    const spoken =
      mode === 'cloud'
        ? await import('./cloudVoice').then((m) => m.speakCloud(text, { pitch: s.pitch, volume: s.volume, soundOn: settings.value.sound })).catch(() => null)
        : await speak(text, mode, { pitch: s.pitch, volume: s.volume, soundOn: settings.value.sound, tts: this.tts });
    const total = spoken?.total ?? Math.max(0.8, text.split(/\s+/).length * 0.3);
    this.talk = { seq: ++this.#seq, starts: spoken?.starts ?? [], total };
    this.#send({ talk: this.talk });
    const seq = this.talk.seq;
    setTimeout(() => {
      if (this.talk?.seq === seq) {
        this.talk = null;
        this.#send({ talk: null });
      }
    }, total * 1000 + 200);
  }

  dismissBubble() {
    this.bubble = null;
    this.#send({ bubble: null });
    hush();
  }

  #bubbleMs = 0;
  #held = false;
  #hideBubbleLater(ms: number) {
    if (this.#bubbleTimer) clearTimeout(this.#bubbleTimer);
    this.#bubbleTimer = setTimeout(() => {
      if (this.#held) return;
      this.bubble = null;
      if (this.mirror) this.#send({ bubble: null });
    }, ms);
  }
  /** The pointer rests on the bubble: keep it up while you read, then a few seconds more. */
  holdBubble(on: boolean) {
    this.#held = on;
    if (!on && this.bubble) this.#hideBubbleLater(3500);
    else if (on && this.#bubbleTimer) clearTimeout(this.#bubbleTimer);
  }

  /** A tap on the face. Once is a hello; a flurry gets a grumble. */
  poke() {
    const now = Date.now();
    // Asleep: a poke wakes it, groggily.
    if (this.asleep) {
      this.asleep = false;
      this.affect = { v: this.affect.v, a: Math.max(this.affect.a, -0.1) };
      this.perform('waking', { sound: true });
      setTimeout(() => this.say('Huh? Oh, hi!', { voice: true, important: true }), 900);
      this.#pokes = [now];
      return;
    }
    this.#pokes = [...this.#pokes.filter((t) => now - t < 8000), now];
    const n = this.#pokes.length;
    this.react(n >= 6 ? 'pokeTooMuch' : n >= 3 ? 'pokeAgain' : 'poke');
  }

  /** Touch from the face (here or on the widget): petting, a tickle, a squeeze. */
  touch(kind: 'pet' | 'tickle' | 'squish' | 'poke') {
    if (kind === 'poke') return this.poke();
    const now = Date.now();
    // One reaction per touch, not one per pointer move.
    if (now - this.#lastTouch < 2600) return;
    this.#lastTouch = now;
    this.asleep = false;
    if (kind === 'pet') {
      alefFile.value.bond.pets++;
      this.affect = { v: Math.min(1, this.affect.v + 0.35), a: Math.max(-0.6, this.affect.a - 0.1) };
      this.perform('purring', { sound: true });
      if (this.settings.chattiness === 'chatty' && Math.random() < 0.4) this.say(['Mmm…', 'That’s nice.', 'Purrr…'][Math.floor(Math.random() * 3)], { important: true, ms: 2600 });
    } else if (kind === 'tickle') {
      this.affect = { v: Math.min(1, this.affect.v + 0.3), a: Math.min(1, this.affect.a + 0.4) };
      this.perform('giggling', { sound: true });
    } else {
      this.affect = { v: this.affect.v, a: Math.min(1, this.affect.a + 0.3) };
      this.perform('squished', { sound: true });
    }
  }

  // ── Conversation ───────────────────────────────────────────────────────────

  #push(m: Omit<Msg, 'id' | 'at'>): Msg {
    this.messages.push({ ...m, id: ++this.#msg, at: Date.now() });
    if (this.messages.length > 60) this.messages.splice(0, this.messages.length - 60);
    return this.messages[this.messages.length - 1];
  }

  /** Is Alef's AI brain (Settings › AI) set up and agreed to? */
  get aiReady(): boolean {
    return ai.ready('alef', 'think');
  }

  /** The service Alef thinks with, when it has one ready. */
  get brainName(): string | null {
    const r = ai.route('alef', 'think');
    if (r.via === 'device' || !this.aiReady) return null;
    return r.via;
  }

  async ask(raw: string) {
    const text = raw.trim();
    if (!text || this.busy) return;
    this.asleep = false;
    alefFile.value.bond.chats++;
    this.#push({ who: 'you', text });
    const reply = this.#push({ who: 'alef', text: '', pending: true });
    this.busy = true;
    this.thinking = true;
    this.#send({ thinking: true });
    this.react('listening', { line: null, quiet: true });
    const think = setTimeout(() => this.thinking && this.perform('spinning'), 650);
    try {
      const { answer, TOOL_WORDS } = await import('./conversation');
      const out = await answer(text, {
        history: this.messages.filter((m) => !m.pending && m.id !== reply.id).slice(-14, -1),
        aiReady: this.aiReady,
        // While the brain works with your day, Alef shows what it's doing.
        onTool: (name) => {
          this.doing = TOOL_WORDS[name] ?? 'Working on it…';
          this.perform(/^(create|update|complete|delete|schedule|add)/.test(name) ? 'excited' : 'curious');
        },
      });
      this.#settle(reply, out);
    } catch (e) {
      console.warn('[daybloom] alef', e);
      Object.assign(reply, { text: 'Something went wrong in my circuits. Try again?', feeling: 'frustrated', error: true, pending: false });
      this.perform('frustrated', { sound: true });
    } finally {
      clearTimeout(think);
      this.thinking = false;
      this.doing = null;
      this.#send({ thinking: false });
      this.busy = false;
    }
  }

  #settle(reply: Msg, out: { text: string; feeling: BehaviorId; beats?: { at: number; feeling: BehaviorId }[]; offers?: Offer[]; entry?: Entry; tools?: string[]; via: 'ai' | 'device'; error?: boolean; note?: string; thanks?: boolean; ui?: string }) {
    Object.assign(reply, { text: out.text, feeling: out.feeling, entry: out.entry, tools: out.tools, via: out.via, error: out.error, note: out.note, ui: out.ui, pending: false });
    this.thinking = false;
    this.doing = null;
    if (out.thanks) this.affect = impulse(this.affect, 'thanks');
    this.affect = impulse(this.affect, out.error || out.note ? 'unsure' : out.feeling === 'confused' ? 'unsure' : 'answered');
    this.perform(out.feeling, { sound: false });
    this.say(out.text, { voice: true, important: true, offers: out.offers });
    // Feelings that change as it speaks, timed along the words.
    const span = readingMs(out.text) * 0.55;
    for (const b of out.beats ?? []) setTimeout(() => this.bubble && this.perform(b.feeling), Math.max(700, b.at * span));
    this.#remember();
  }

  /** Keep the last words between you, so the chat picks up where it left off next time. */
  #remember() {
    alefFile.value.recent = this.messages
      .filter((m) => !m.pending && !m.error && m.text)
      .slice(-40)
      .map((m) => ({ who: m.who, text: m.text.slice(0, 4000), at: m.at, ...(m.ui && m.ui.length <= 6000 ? { ui: m.ui } : {}) }));
  }

  /** Run what a card offered ("Did you mean…" or a help example). */
  async run(call: Call, label: string) {
    if (this.busy) return;
    this.#push({ who: 'you', text: label });
    const reply = this.#push({ who: 'alef', text: '', pending: true });
    this.busy = true;
    try {
      const { runCall } = await import('./conversation');
      this.#settle(reply, await runCall(call, label));
    } catch (e) {
      console.warn('[daybloom] alef', e);
      Object.assign(reply, { text: "That didn't work. Try saying it another way?", feeling: 'confused', error: true, pending: false });
    } finally {
      this.busy = false;
    }
  }

  clearChat() {
    this.messages = [];
    alefFile.value.recent = [];
  }

  /** Bring back the last conversation (once, when Alef starts). */
  restore() {
    if (this.messages.length) return;
    const r = alefFile.value.recent ?? [];
    this.messages = r.map((m) => ({ id: ++this.#msg, who: m.who, text: m.text, at: m.at, via: 'device' as const, ...(m.ui ? { ui: m.ui } : {}) }));
  }

  #send(m: Mirror) {
    // Plain data: reactive proxies can't cross windows.
    if (this.mirror) void platform.broadcast('alef', $state.snapshot(m)).catch(() => {});
  }

  /** The widget's copy follows the main window's. */
  receive(m: Mirror) {
    if (m.affect) this.affect = m.affect;
    if (m.perf) {
      this.perf = m.perf;
      this.performing = true;
      if (this.#perfTimer) clearTimeout(this.#perfTimer);
      this.#perfTimer = setTimeout(() => (this.performing = false), Math.min(lengthOf(ACTS[m.perf.id]), 6000) + 120);
    }
    if (m.talk !== undefined) this.talk = m.talk;
    if (m.thinking !== undefined) this.thinking = m.thinking;
    if (m.glance !== undefined) this.glance = m.glance;
    if (m.sound && settings.value.sound) chirp(m.sound.chirp, m.sound);
    if (m.speak) void this.#speakHere(m.speak);
    if (m.bubble !== undefined) {
      this.bubble = m.bubble;
      if (this.#bubbleTimer) clearTimeout(this.#bubbleTimer);
      if (m.bubble) this.#hideBubbleLater(readingMs(m.bubble.text) + 1500);
    }
  }
}

/** Long enough to read a line, unhurried: ~14 characters a second, 4–25 s. */
export function readingMs(text: string): number {
  return Math.max(4000, Math.min(25_000, 1500 + text.length * 70));
}

export const alef = new Alef();

if (import.meta.env.DEV) (globalThis as { __alef?: Alef }).__alef = alef;

/** Today's snapshot for signals and moments. */
async function snapshot(now: number, idleMin: number): Promise<Snapshot> {
  const today = isoOf(now);
  const blocks = [...view.todayBlocks.filter((b) => b.date === today || isoOf(b.startMs) === today), ...(view.isToday ? view.floating : [])];
  const [{ openCheckIns }, { rhythm }] = await Promise.all([import('../../assistant/tools'), import('../../streaks')]);
  return {
    now,
    blocks,
    inFocus: !!timer.active,
    idleMin,
    streak: rhythm(taskFile.value.tasks, now).current,
    openCheckIns: openCheckIns(now).length,
    wake: settings.value.wake,
    sleep: settings.value.sleep,
  };
}

/** Main window, while the addon is on. */
export function startAlef(): () => void {
  alef.mirror = true;
  alef.restore();
  void ai.refreshKeys();
  void import('./tts/tts.svelte')
    .then((m) => {
      alef.tts = m.tinyTts;
      void m.tinyTts.check();
    })
    .catch(() => {});
  let seen: Seen = NOTHING_SEEN;
  let idleMin = 0;
  let lastTick = Date.now();
  let stopped = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let greeted = false;
  let saidLate = '';
  let prevIdleMin = 0;
  let activeMin = 0;
  let petMemory: import('./pet').PetMemory = { last: {}, halfway: null, checked: null, quirks: { day: '', n: 0 } };
  /** Help already offered (one per block and kind). */
  const offered = new Set<string>();
  let openItemsOf: ((tasks: import('../../engine/types').Task[]) => import('../../engine/types').Task[]) | null = null;
  void import('../../backlog').then((m) => (openItemsOf = m.openItems));
  /** The first backlog task that fits the free time until the next block (at most an hour). */
  function fitting(now: number, next: Block | undefined): { item: { id: string; title: string; minutes: number }; freeMin: number } | null {
    const freeMin = Math.min(60, Math.floor(((next?.startMs ?? now + 60 * MINUTE) - now) / MINUTE));
    if (freeMin < 10 || !openItemsOf) return null;
    const t = openItemsOf(taskFile.value.tasks).find((x) => x.duration <= freeMin - 5 && !offered.has(`fill:${x.id}`));
    if (!t) return null;
    offered.add(`fill:${t.id}`);
    return { item: { id: t.id, title: t.title, minutes: t.duration }, freeMin };
  }

  async function look() {
    if (stopped) return;
    const now = clock.now;
    try {
      const { idleSeconds } = await import('../tracker/native');
      idleMin = Math.floor((await idleSeconds()) / 60);
    } catch {
      idleMin = 0;
    }
    const snap = await snapshot(now, idleMin);
    if (stopped) return;
    // The mood drifts toward how the day is going.
    const sig = signalsOf(snap);
    const dt = Date.now() - lastTick;
    lastTick = Date.now();
    alef.affect = settle(alef.affect, moodTarget(sig), dt);
    const r = moments(seen, snap);
    seen = r.seen;
    // Hello, once a day, the first time you're around in the waking day.
    const today = isoOf(now);
    if (!greeted && sig.awake && idleMin < 5) {
      greeted = true;
      if (alefFile.value.met !== today) {
        alefFile.value.met = today;
        const first = snap.blocks.filter((b) => !b.floating && b.startMs > now).sort((a, b) => a.startMs - b.startMs)[0];
        alef.react('greet', { block: first ?? null });
        return;
      }
    }
    // A day together, and now and then a milestone worth a little party.
    const bond = alefFile.value.bond;
    if (sig.awake && idleMin < 5 && bond.days.at(-1) !== today) {
      bond.days = [...bond.days, today].slice(-400);
      const m = MILESTONES.filter((x) => x <= bond.days.length).at(-1) ?? 0;
      if (m > (bond.celebrated ?? 0)) {
        bond.celebrated = m;
        alef.react('milestone', { count: m });
        return;
      }
    }
    activeMin = idleMin >= 5 ? 0 : activeMin + Math.max(1, Math.round(dt / MINUTE));
    // Around, a block of yours under way a while, no focus running: a hand to get started (once per block).
    const cur = snap.blocks.find((b) => b.kind === 'task' && !b.floating && !b.done && b.startMs <= now && now < b.endMs);
    const stuck =
      !r.moments.length && cur && !timer.active && sig.awake && idleMin < 2 && now - cur.startMs >= 8 * MINUTE && cur.endMs - now >= 10 * MINUTE && ['focus', 'learn'].includes(cur.category) && !offered.has(`stuck:${cur.key}`);
    if (stuck && cur) {
      offered.add(`stuck:${cur.key}`);
      alef.react('stuck', { block: cur });
    } else if (r.moments.length) {
      for (const m of r.moments.slice(0, 1)) alef.react(m.ev, { block: m.block ?? null });
    } else if (!alef.performing && !alef.busy && !alef.talk) {
      // Nothing happened in the day: maybe Alef does something on its own.
      const ts = timer.active ? timer.status(now) : null;
      const focus = ts && timer.active && !ts.finished ? { progress: ts.progress, startedAt: timer.active.startedAt } : null;
      const { petMoment } = await import('./pet');
      const next = snap.blocks.find((b) => !b.floating && b.startMs > now && b.startMs - now < 60 * MINUTE);
      const { openItems } = await import('../../backlog');
      const p = petMoment(
        { now, awake: sig.awake, idleMin, prevIdleMin, activeMin, focus, v: alef.affect.v, a: alef.affect.a, quiet: !next && !snap.blocks.some((b) => !b.floating && b.startMs <= now && b.endMs > now), backlog: openItems(taskFile.value.tasks).length, roll: Math.random() },
        petMemory,
      );
      petMemory = p.memory;
      const fits = p.moment?.kind === 'bored' ? fitting(now, next) : null;
      if (p.moment?.kind === 'welcome' && alef.settings.chattiness !== 'quiet') {
        alef.react('welcomeBack', { block: next ?? null });
      } else if (p.moment?.kind === 'bored' && fits && alef.settings.chattiness !== 'quiet') {
        // A free stretch and something from the backlog fits it: offer just that one.
        alef.react('gap', { help: helpFor('gap', { fits: fits.item, freeMin: fits.freeMin, seed: Math.floor(now / 1000) }) });
      } else if (p.moment) {
        const quietLine = alef.settings.chattiness === 'quiet' && p.moment.kind !== 'still-there';
        alef.perform(p.moment.act, { sound: !p.moment.line || quietLine });
        if (p.moment.line && !quietLine) alef.say(p.moment.line, { voice: true, important: true });
      }
    }
    prevIdleMin = idleMin;
    // Late and you're still here: a gentle goodnight, once.
    if (!sig.awake && idleMin < 3 && saidLate !== today && alef.settings.chattiness !== 'quiet') {
      saidLate = today;
      alef.perform('sleepy', { sound: true });
      alef.say(lateLine(Math.floor(now / MINUTE)), { voice: true });
    }
  }

  // Between moments: a small performance now and then, never while it talks or you type to it.
  function scheduleIdle() {
    const lively = alef.settings.lively;
    const ms = (lively ? 9000 : 22000) + Math.random() * (lively ? 13000 : 26000);
    idleTimer = setTimeout(() => {
      if (stopped) return;
      // (A phone: only while someone is looking; each one moves the whole dial.)
      if (attention.looking && !alef.performing && !alef.talk && !alef.busy && !(typeof document !== 'undefined' && document.hidden && !alef.settings.inWidget)) {
        const night = !signalsOf({ now: clock.now, blocks: [], inFocus: false, idleMin, streak: 0, openCheckIns: 0, wake: settings.value.wake, sleep: settings.value.sleep }).awake;
        const id = idleBehavior(alef.affect, Math.floor(Math.random() * 1000), { night, idleMin });
        alef.perform(id, { sound: (id === 'sleeping' || id === 'sleepy') && Math.random() < 0.25 });
      }
      scheduleIdle();
    }, ms);
  }

  const root = $effect.root(() => {
    // Each minute, and whenever the day changes (a tick, a new block…).
    $effect(() => {
      void clock.minute;
      void taskFile.value.tasks;
      void view.todayBlocks;
      untrack(() => void look());
    });
    // Heads-up: the next block is close.
    $effect(() => {
      const key = view.headsUpKey;
      if (!key) return;
      untrack(() => {
        const b = view.todayBlocks.find((x) => x.key === key);
        if (b) alef.react('headsUp', { block: b, inMin: Math.max(1, Math.round((b.startMs - clock.now) / MINUTE)) });
      });
    });
    // You add a block: a happy little nod (and a word, if Alef is chatty).
    let count = taskFile.value.tasks.length;
    const bornAt = Date.now();
    $effect(() => {
      const n = taskFile.value.tasks.length;
      untrack(() => {
        const added = n === count + 1 && Date.now() - bornAt > 5000 && !alef.busy;
        count = n;
        if (!added) return;
        const t = taskFile.value.tasks.at(-1);
        if (!t || Date.now() - t.createdAt > 5000) return;
        const b = t.date ? view.todayBlocks.find((x) => x.taskId === t.id) ?? null : null;
        alef.react('planned', { block: b, quiet: alef.settings.chattiness !== 'chatty' });
      });
    });
    // You pick a block on the dial: Alef looks at it. You change days: it looks that way.
    $effect(() => {
      const key = view.selected;
      untrack(() => {
        const b = key ? view.blockByKey(key) : null;
        if (!b || b.floating) return;
        const w = view.dialFor(settings.value.preset);
        const deg = (((b.startMs + b.endMs) / 2 - w.originMs) / w.spanMs) * 360;
        alef.look(Math.sin((deg * Math.PI) / 180) * 0.9, -Math.cos((deg * Math.PI) / 180) * 0.9, 1600);
      });
    });
    let lastDate = view.date;
    $effect(() => {
      const d = view.date;
      untrack(() => {
        if (d !== lastDate) alef.look(view.dayDir * 0.95, 0, 900);
        lastDate = d;
      });
    });
    // Dragging a block in the timeline: Alef watches, then likes where it landed.
    let dragging = false;
    $effect(() => {
      const p = view.railPreview;
      untrack(() => {
        if (p) alef.look(0.95, 0.15, 1500);
        else if (dragging) alef.react('moved', { quiet: alef.settings.chattiness !== 'chatty' });
        dragging = !!p;
      });
    });
    // A new look for the app or the dial: Alef notices.
    let style = `${settings.value.lightTheme}|${settings.value.darkTheme}|${settings.value.finish}|${settings.value.preset}`;
    $effect(() => {
      const l = `${settings.value.lightTheme}|${settings.value.darkTheme}|${settings.value.finish}|${settings.value.preset}`;
      untrack(() => {
        if (l !== style && !alef.performing) alef.react('newLook', { quiet: alef.settings.chattiness !== 'chatty' });
        style = l;
      });
    });

    // Focus sessions: Alef works alongside you.
    let wasFocus: boolean | null = null;
    let focusKey: string | null = null;
    $effect(() => {
      const a = timer.active;
      const on = !!a;
      untrack(() => {
        if (on) focusKey = a?.target?.key ?? null;
        // Ending a session on a block that isn't ticked: "Is it done?"
        const block = !on && focusKey ? (view.todayBlocks.find((b) => b.key === focusKey && !b.done) ?? null) : null;
        if (wasFocus !== null && on !== wasFocus) alef.react(on ? 'focusStart' : 'focusEnd', { block });
        wasFocus = on;
      });
    });
  });

  // Salah and soft landings, when those addons run.
  const offers: (() => void)[] = [];
  void import('../waqt/waqt.svelte').then(({ waqt }) => {
    if (stopped) return;
    offers.push(
      $effect.root(() => {
        let last = waqt.bloom;
        $effect(() => {
          const b = waqt.bloom;
          untrack(() => {
            if (b !== last && b > 0) alef.react('prayer', { name: waqt.moment?.prayer.name });
            last = b;
          });
        });
      }),
    );
  });
  void import('../landings/landings.svelte').then(({ landings }) => {
    if (stopped) return;
    offers.push(
      $effect.root(() => {
        let last: string | null = landings.moment?.key ?? null;
        $effect(() => {
          const k = landings.moment?.key ?? null;
          untrack(() => {
            if (k && k !== last) alef.react('landing');
            last = k;
          });
        });
      }),
    );
  });

  // Touches on the widget's face come here; the reaction goes back to it.
  const offTouch = platform.onBroadcast<{ kind: 'pet' | 'tickle' | 'squish' | 'poke' }>('alef-touch', (m) => alef.touch(m.kind));
  // Words typed or said to Alef on the widget: the same conversation as here.
  const offAsk = platform.onBroadcast<{ text: string }>('alef-ask', (m) => {
    if (typeof m?.text === 'string' && m.text.trim()) void alef.ask(m.text.slice(0, 600));
  });
  // A button under the bubble, tapped on the widget.
  const offAct = platform.onBroadcast<{ seq: number; index: number }>('alef-act', (m) => {
    if (Number.isFinite(m?.seq) && Number.isFinite(m?.index)) void alef.act(m.seq, m.index);
  });

  scheduleIdle();
  const settleTimer = setInterval(() => {
    const dt = Date.now() - lastTick;
    if (dt > 25_000) void look();
  }, 30_000);

  return () => {
    stopped = true;
    alef.mirror = false;
    offTouch();
    offAsk();
    offAct();
    root();
    offers.forEach((f) => f());
    if (idleTimer) clearTimeout(idleTimer);
    clearInterval(settleTimer);
    hush();
  };
}

/** The widget: mirror the main window's Alef. */
export function startAlefView(): () => void {
  return platform.onBroadcast<Mirror>('alef', (m) => alef.receive(m));
}

/** For the emotions gallery and tests. */
export const ALL_BEHAVIORS = BEHAVIOR_IDS;
