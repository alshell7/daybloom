// Alef, the live side. The main window runs the feelings: it watches the day (signals.ts),
// lets moments move the mood (affect.ts), plays a behaviour for each (behaviors.ts), chirps
// and sometimes says a line (lines.ts), and keeps Alef alive between moments with small idle
// performances. It talks with you through an AI brain you set up (llm.ts), or on this device
// with the planner's own tools. The widget only mirrors the face (startAlefView).

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
import { ACTS, BEHAVIOR_IDS, lengthOf, type ActId, type BehaviorId } from './behaviors';
import { chirp } from './chirps';
import { moodGlow, moodLed } from './face';
import { screenPalette, type ScreenPalette, type ScreenStyle } from './palette';
import type { Finish } from '../../presets';
import { lateLine, lineFor, type Chattiness } from './lines';
import type { LlmConfig, ProviderId } from './llm';
import { moments, NOTHING_SEEN, signalsOf, type Seen, type Snapshot } from './signals';
import { hush, speak, type SpeechSynth, type VoiceMode } from './voice';

export type Brain = 'local' | ProviderId;

export interface AlefSettings {
  /** The eyes' colour: 'dial' follows the dial's finish, or one colour. */
  eyes: string;
  /** The screen: in the dial's colours, or classic OLED black. */
  screen: ScreenStyle;
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
  /** Your friendship: the days you spent together, pets and chats. */
  bond: { days: string[]; pets: number; chats: number };
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
  led: 'feeling',
  voice: 'chirps',
  pitch: 1,
  volume: 0.7,
  chattiness: 'some',
  onDial: true,
  inWidget: true,
  lively: true,
  mayChange: true,
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
    },
    settings: {
      eyes: s.eyes === 'dial' ? 'dial' : hex(s.eyes, DEFAULT_ALEF.eyes),
      screen: s.screen === 'oled' ? 'oled' : 'dial',
      led: s.led === 'feeling' ? 'feeling' : hex(s.led, 'feeling'),
      voice: VOICES.includes(s.voice) ? s.voice : DEFAULT_ALEF.voice,
      pitch: num(s.pitch, 1, 0.8, 1.3),
      volume: num(s.volume, 0.7, 0, 1),
      chattiness: CHATTY.includes(s.chattiness) ? s.chattiness : DEFAULT_ALEF.chattiness,
      onDial: s.onDial !== false,
      inWidget: s.inWidget !== false,
      lively: s.lively !== false,
      mayChange: s.mayChange !== false,
      brain: BRAINS.includes(s.brain) ? s.brain : 'local',
      configs,
      consent,
    },
  };
}

export const alefFile = persisted<AlefFile>('addon-alef', migrateAlef(null), migrateAlef);

export const keyAccount = (p: ProviderId) => `alef-llm:${p}`;

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
  pending?: boolean;
}

/** What the widget needs to mirror the face. */
interface Mirror {
  perf?: { id: ActId; seq: number };
  affect?: Affect;
  talk?: { seq: number; starts: number[]; total: number } | null;
  bubble?: { text: string; seq: number } | null;
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
  bubble = $state<{ text: string; seq: number } | null>(null);
  /** Syllable timings while Alef speaks (the eyes bob to them). */
  talk = $state<{ seq: number; starts: number[]; total: number } | null>(null);
  thinking = $state(false);
  /** You're typing to Alef (it watches the field). */
  typing = $state(false);
  messages = $state<Msg[]>([]);
  busy = $state(false);
  /** A key is saved for the chosen AI brain. */
  hasKey = $state(false);
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
    return screenPalette(finish, this.settings.screen, this.settings.eyes);
  }

  #seq = 0;
  #msg = 0;
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
    if (s.voice === 'off' || !settings.value.sound) return;
    const now = Date.now();
    if (now - this.#lastChirp < 2500) return;
    this.#lastChirp = now;
    chirp(ACTS[id].chirp, { pitch: s.pitch, volume: s.volume });
  }

  /** A moment happened: feel it, show it, maybe say something. */
  react(ev: AffectEvent, o: { block?: Block | null; name?: string; inMin?: number; quiet?: boolean; line?: string | null } = {}) {
    this.affect = impulse(this.affect, ev);
    const id = behaviorForEvent(ev, this.affect);
    const line =
      o.line !== undefined
        ? o.line
        : lineFor(
            ev,
            {
              title: o.block ? shownTitle(o.block.title, o.block.category) : undefined,
              at: o.block ? formatTime(o.block.startMs, view.hour12) : undefined,
              inMin: o.inMin,
              name: o.name,
              hour: new Date(clock.now).getHours(),
              seed: this.#seq + Math.floor(clock.now / 1000),
            },
            this.settings.chattiness,
          );
    // A line speaks for itself; otherwise the chirp does.
    this.perform(id, { sound: !o.quiet && !line });
    // The whole day done: after the cheer, a little dance.
    if (ev === 'allDone') setTimeout(() => this.perform('dancing', { sound: true }), lengthOf(ACTS[id]) + 300);
    if (line && !o.quiet) this.say(line, { voice: true, important: ['allDone', 'poke', 'pokeAgain', 'pokeTooMuch', 'greet'].includes(ev) });
  }

  /** Show a line in the bubble (and speak it, in Alef's voice). */
  say(text: string, o: { voice?: boolean; important?: boolean; ms?: number } = {}) {
    const now = Date.now();
    if (!o.important && now - this.#lastLine < 15_000) return;
    this.#lastLine = now;
    this.bubble = { text, seq: ++this.#seq };
    this.#send({ bubble: this.bubble });
    if (this.#bubbleTimer) clearTimeout(this.#bubbleTimer);
    this.#bubbleTimer = setTimeout(() => {
      this.bubble = null;
      this.#send({ bubble: null });
    }, o.ms ?? Math.max(3600, Math.min(9000, text.length * 75)));
    if (o.voice) void this.#voice(text);
  }

  async #voice(text: string) {
    const s = this.settings;
    const spoken = await speak(text, s.voice, { pitch: s.pitch, volume: s.volume, soundOn: settings.value.sound, tts: this.tts });
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
    hush();
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

  /** Is the AI brain set up and agreed to? */
  get aiReady(): boolean {
    const s = this.settings;
    if (s.brain === 'local') return false;
    const c = s.configs[s.brain];
    return !!c?.model?.trim() && !!s.consent[s.brain] && (this.hasKey || s.brain === 'custom');
  }

  async refreshKey() {
    const b = this.settings.brain;
    if (b === 'local') {
      this.hasKey = false;
      return;
    }
    try {
      this.hasKey = !!(await platform.secrets.get(keyAccount(b)));
    } catch {
      this.hasKey = false;
    }
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
    this.react('listening', { line: null, quiet: true });
    const think = setTimeout(() => this.thinking && this.perform('spinning'), 650);
    try {
      const { answer } = await import('./conversation');
      const out = await answer(text, {
        history: this.messages.filter((m) => !m.pending && m.id !== reply.id).slice(-14, -1),
        aiReady: this.aiReady,
      });
      this.#settle(reply, out);
    } catch (e) {
      console.warn('[daybloom] alef', e);
      Object.assign(reply, { text: 'Something went wrong in my circuits. Try again?', feeling: 'frustrated', error: true, pending: false });
      this.perform('frustrated', { sound: true });
    } finally {
      clearTimeout(think);
      this.thinking = false;
      this.busy = false;
    }
  }

  #settle(reply: Msg, out: { text: string; feeling: BehaviorId; entry?: Entry; tools?: string[]; via: 'ai' | 'device'; error?: boolean; note?: string; thanks?: boolean }) {
    Object.assign(reply, { text: out.text, feeling: out.feeling, entry: out.entry, tools: out.tools, via: out.via, error: out.error, note: out.note, pending: false });
    this.thinking = false;
    if (out.thanks) this.affect = impulse(this.affect, 'thanks');
    this.affect = impulse(this.affect, out.error || out.note ? 'failed' : out.feeling === 'confused' ? 'unsure' : 'answered');
    this.perform(out.feeling, { sound: false });
    this.say(out.text, { voice: true, important: true });
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
  }

  #send(m: Mirror) {
    if (this.mirror) void platform.broadcast('alef', m).catch(() => {});
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
    if (m.bubble !== undefined) {
      this.bubble = m.bubble;
      if (this.#bubbleTimer) clearTimeout(this.#bubbleTimer);
      if (m.bubble) this.#bubbleTimer = setTimeout(() => (this.bubble = null), 9000);
    }
  }
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
  void alef.refreshKey();
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
    // A day together.
    const bond = alefFile.value.bond;
    if (sig.awake && idleMin < 5 && bond.days.at(-1) !== today) bond.days = [...bond.days, today].slice(-400);
    activeMin = idleMin >= 5 ? 0 : activeMin + Math.max(1, Math.round(dt / MINUTE));
    if (r.moments.length) {
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
      if (p.moment) {
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
      if (!alef.performing && !alef.talk && !alef.busy && !(typeof document !== 'undefined' && document.hidden && !alef.settings.inWidget)) {
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
    // Focus sessions: Alef works alongside you.
    let wasFocus: boolean | null = null;
    $effect(() => {
      const on = !!timer.active;
      untrack(() => {
        if (wasFocus !== null && on !== wasFocus) alef.react(on ? 'focusStart' : 'focusEnd');
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

  scheduleIdle();
  const settleTimer = setInterval(() => {
    const dt = Date.now() - lastTick;
    if (dt > 25_000) void look();
  }, 30_000);

  return () => {
    stopped = true;
    alef.mirror = false;
    offTouch();
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
