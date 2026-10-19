// Voice: speak to Daybloom. Whistle (Cactus Compute, on-device) turns speech into words while
// you talk; when you stop, a final pass over the whole clip gives the most accurate text, and
// that text goes to the same assistant as typing does: Needle picks the tool, a card answers.
//
//   idle → (needs-model → downloading →) opening → listening → finishing → thinking → result
//
// Surfaces: 'overlay' (the floating voice capsule, from the V key), 'assistant' (the mic in the
// Ask panel: words flow into its input and are sent), 'quickadd' (dictation into the quick-add
// field, for review before Enter). The mic is open only while listening.
//
// Listening starts the moment the microphone is open; Whistle warms up alongside (`warming`) and
// catches up on what was said, so letting go early never throws the sentence away.

import { addDays, isoOf, startOfDayMs } from '../engine/time';
import { blocksInRange } from '../engine/blocks';
import { openItems } from '../backlog';
import { sounds } from '../sound';
import { clock } from '../stores/clock.svelte';
import { settings } from '../stores/settings.svelte';
import { taskFile } from '../stores/tasks.svelte';
import type { SpeechEngine, StreamStep } from '../assistant/types';
import type { Entry } from '../assistant/session.svelte';
import { VoiceActivity, concat, loudness, SPEECH_RATE } from './audio';
import { MicError, startCapture, type Capture, type MicProblem } from './capture';
import { normalizeSpoken } from './spoken';

export type VoicePhase = 'idle' | 'needs-model' | 'downloading' | 'opening' | 'listening' | 'finishing' | 'thinking' | 'result' | 'error';
export type VoiceSurface = 'overlay' | 'assistant' | 'quickadd';

export interface SpokenToken {
  id: number;
  text: string;
}

export interface StartOptions {
  /** Live text while talking (final = false), then the final text once (final = true). */
  onText?: (text: string, final: boolean) => void;
  /** Keep listening until a pause instead of until stop(). */
  handsFree?: boolean;
}

/** Ticks on the voice ring: one per 20 ms frame, so the ring holds the last second. */
export const RING = 48;
const MIN_CLIP_S = 0.35;
const MAX_CLIP_MS = 45_000;
const PAUSE_MS = 1_300;
const NOTHING_MS = 7_000;
/** Feed the live recogniser about this much new audio per pass (smaller = words sooner). */
const STEP_SAMPLES = Math.round(SPEECH_RATE * 0.5);
const HOLD_MS = 380;
const PREROLL_SAMPLES = Math.round(SPEECH_RATE * 0.4);
/** Push-to-talk with no detected word still counts if it was at least this loud (0..1). */
const SOUND_FLOOR = 0.2;

const VOCABULARY = [
  'add', 'move', 'start', 'finish', 'done', 'skip', 'plan my day', "what's next", 'show',
  'Daybloom', 'backlog', 'focus', 'Pomodoro', 'wind down', 'check-in', 'timeline', 'dial', 'tomorrow', 'today', 'minutes',
];

/** Words Whistle should listen for: your blocks today and tomorrow, your backlog, app words. */
export function voiceKeywords(): string[] {
  const today = isoOf(clock.now);
  const blocks = blocksInRange(taskFile.value.tasks, [], startOfDayMs(today), startOfDayMs(addDays(today, 2)));
  const titles = [...blocks.map((b) => b.title), ...openItems(taskFile.value.tasks).map((t) => t.title)];
  return [...new Set([...titles.filter(Boolean), ...VOCABULARY])].slice(0, 64);
}

export function micAdvice(problem: MicProblem, os: string): string {
  if (problem === 'denied') {
    return os === 'mac'
      ? 'Open System Settings › Privacy & Security › Microphone and turn on Daybloom.'
      : os === 'windows'
        ? 'Open Settings › Privacy & security › Microphone and allow desktop apps.'
        : 'Allow microphone access for Daybloom, then try again.';
  }
  if (problem === 'missing') return 'Connect a microphone, then try again.';
  if (problem === 'busy') return 'Close the other app that uses the microphone, then try again.';
  return 'Voice input is not available in this window.';
}

const engineLoader = import.meta.glob<{ whistle: SpeechEngine }>('../assistant/engine.svelte.ts');
const sessionLoader = () => import('../assistant/session.svelte');

class Voice {
  phase = $state<VoicePhase>('idle');
  surface = $state<VoiceSurface>('overlay');
  /** Committed words, in order (stable ids, so each word animates in once). */
  words = $state<SpokenToken[]>([]);
  /** The unconfirmed tail the recogniser is still deciding on. */
  pending = $state('');
  /** The final text, once finishing is done. */
  final = $state('');
  language = $state('');
  /** Smoothed loudness 0..1 (the orb's breath). */
  level = $state(0);
  /** The last second of loudness, newest first. */
  ring = $state.raw<number[]>(Array(RING).fill(0));
  /** Seconds listened. */
  seconds = $state(0);
  handsFree = $state(false);
  speaking = $state(false);
  /** Listening while Whistle is still loading: words appear once it's ready. */
  warming = $state(false);
  error = $state<string | null>(null);
  problem = $state<MicProblem | null>(null);
  /** The assistant's answer to a spoken command (overlay surface). */
  entry = $state.raw<Entry | null>(null);
  engine = $state.raw<SpeechEngine | null>(null);
  /** Whistle's weights are on this device (null until checked). */
  installed = $state<boolean | null>(null);

  progress = $derived(this.engine?.progress ?? 0);
  active = $derived(this.phase !== 'idle');
  listening = $derived(this.phase === 'listening');
  /** Speech has been heard (until then, recogniser output on room noise is ignored). */
  heard = $state(false);
  /** Live text: committed words plus the tail. */
  live = $derived(this.heard ? [this.words.map((w) => w.text).join(' '), this.pending].filter(Boolean).join(' ') : '');

  #capture: Capture | null = null;
  /** Audio from just before the first word (so the onset isn't clipped). */
  #preroll: Float32Array[] = [];
  #prerollLen = 0;
  #clip: Float32Array[] = [];
  /** Everything since the mic opened (push-to-talk when no word was detected). */
  #all: Float32Array[] = [];
  #allLen = 0;
  #loudest = 0;
  #queue: Float32Array[] = [];
  #queued = 0;
  #inflight: Promise<void> | null = null;
  #ready: Promise<void> | null = null;
  #isReady = false;
  #streamed = false;
  #stopWhenOpen = false;
  /** Loudness arrives ~50 times a second; the ring and orb redraw once per frame. */
  #ringData: number[] = Array(RING).fill(0);
  #lvl = 0;
  #frame = 0;
  #vad = new VoiceActivity();
  #opts: StartOptions = {};
  #keywords: string[] = [];
  #seq = 0;
  #run = 0;
  #pressAt = 0;
  #held = false;
  #listenedMs = 0;
  #closeTimer: ReturnType<typeof setTimeout> | null = null;

  async #engine(): Promise<SpeechEngine> {
    if (this.engine) return this.engine;
    const load = engineLoader['../assistant/engine.svelte.ts'];
    if (!load) throw new Error('Voice is not part of this build.');
    this.engine = (await load()).whistle;
    return this.engine;
  }

  /** Cheap check for the settings row and the mic buttons. */
  async check(): Promise<boolean> {
    try {
      this.installed = await (await this.#engine()).hasWeights();
    } catch {
      this.installed = false;
    }
    return this.installed;
  }

  // ---- hotkey: hold to talk, or tap to talk hands-free

  press(surface: VoiceSurface) {
    if (this.#held) return;
    if (this.phase === 'listening' || this.phase === 'opening') {
      void this.stop();
      return;
    }
    this.#held = true;
    this.#pressAt = performance.now();
    void this.start(surface);
  }

  release() {
    if (!this.#held) return;
    this.#held = false;
    const held = performance.now() - this.#pressAt;
    if (held >= HOLD_MS) void this.stop();
    else this.handsFree = true;
  }

  /** The window lost focus mid-hold (a permission prompt, a click elsewhere): the key-up will
   *  never come, so finish on the next pause instead of cutting the sentence off. */
  blur() {
    if (!this.#held) return;
    this.#held = false;
    if (this.phase === 'opening' || this.phase === 'listening') this.handsFree = true;
  }

  // ---- lifecycle

  async start(surface: VoiceSurface, opts: StartOptions = {}) {
    if (this.phase === 'listening' || this.phase === 'opening' || this.phase === 'finishing') return;
    this.#clearClose();
    const run = ++this.#run;
    this.surface = surface;
    this.#opts = opts;
    this.handsFree = !!opts.handsFree;
    this.words = [];
    this.pending = '';
    this.final = '';
    this.language = '';
    this.error = null;
    this.problem = null;
    this.entry = null;
    this.seconds = 0;
    this.heard = false;
    this.warming = false;
    this.#ringData = Array(RING).fill(0);
    this.#lvl = 0;
    this.ring = this.#ringData;
    this.level = 0;

    let engine: SpeechEngine;
    try {
      engine = await this.#engine();
      this.installed = await engine.hasWeights();
    } catch (e) {
      this.#fail(e);
      return;
    }
    if (run !== this.#run) return;
    if (!this.installed) {
      this.phase = 'needs-model';
      return;
    }
    this.phase = 'opening';
    this.#keywords = voiceKeywords();
    this.#clip = [];
    this.#all = [];
    this.#allLen = 0;
    this.#loudest = 0;
    this.#preroll = [];
    this.#prerollLen = 0;
    this.#queue = [];
    this.#queued = 0;
    this.#listenedMs = 0;
    this.#streamed = false;
    this.#stopWhenOpen = false;
    this.#vad = new VoiceActivity();
    // Whistle loads alongside the microphone; listening doesn't wait for it.
    this.#isReady = false;
    this.warming = true;
    this.#ready = engine.ensureReady().then(
      () => {
        if (run !== this.#run) return;
        this.#isReady = true;
        this.warming = false;
        this.#pump(run);
      },
      (e) => {
        if (run === this.#run) this.#fail(e);
        throw e;
      },
    );
    this.#ready.catch(() => {});
    let capture: Capture;
    try {
      capture = await startCapture({ onAudio: (pcm) => this.#onAudio(run, pcm), onLevel: (rms, _peak, ms) => this.#onLevel(run, rms, ms) });
    } catch (e) {
      if (run === this.#run) this.#fail(e);
      return;
    }
    if (run !== this.#run || (this.phase as VoicePhase) !== 'opening') {
      capture.stop();
      return;
    }
    this.#capture = capture;
    this.phase = 'listening';
    if (settings.value.voice.chimes && settings.value.sound) sounds.listen();
    // Let go while the microphone was still opening: finish with what's heard from here.
    if (this.#stopWhenOpen) this.handsFree = true;
  }

  /** Opt-in: fetch Whistle (17 MB, once, verified), then start listening. */
  async download() {
    let engine: SpeechEngine;
    try {
      engine = await this.#engine();
    } catch (e) {
      this.#fail(e);
      return;
    }
    const surface = this.surface;
    const opts = this.#opts;
    this.phase = 'downloading';
    try {
      await engine.ensureReady();
      this.installed = true;
    } catch (e) {
      this.#fail(e);
      return;
    }
    this.phase = 'idle';
    // Nobody is holding V after clicking a button: listen until a pause.
    await this.start(surface, { ...opts, handsFree: true });
  }

  /** Stop listening and act on what was said. */
  async stop() {
    const run = this.#run;
    if (this.phase === 'opening') {
      // The microphone isn't open yet (a permission prompt, a slow device): keep going and
      // finish on the first pause rather than dropping what's about to be said.
      this.#stopWhenOpen = true;
      return;
    }
    if (this.phase !== 'listening') return;
    this.#capture?.stop();
    this.#capture = null;
    this.phase = 'finishing';
    this.speaking = false;
    this.#flushFrame();
    if (settings.value.voice.chimes && settings.value.sound) sounds.heard();
    // Commands go to the assistant: wake Needle now (not while you talk, where it would slow
    // the live words down), so it's ready by the time the words are.
    if (this.surface !== 'quickadd') void sessionLoader().then((m) => m.session.open());
    const engine = this.engine!;
    let text = '';
    try {
      // Whistle may still be warming up; then let the last live pass land and close the
      // stream, then one careful pass over the clip.
      await this.#ready;
      await this.#inflight;
      if (this.#streamed) {
        const tail = await engine.streamStop();
        if (run !== this.#run) return;
        if (this.heard) this.#commit(tail);
      }
      this.pending = '';
      // No word detected, but you held the key and something was said (quiet speech, a short
      // word): use everything that was recorded. Silence is never transcribed (it turns into
      // words nobody said).
      const pcm = this.heard ? concat(this.#clip) : !this.handsFree && this.#loudest >= SOUND_FLOOR ? concat(this.#all) : new Float32Array(0);
      this.#clip = [];
      this.#all = [];
      this.#preroll = [];
      if (pcm.length >= SPEECH_RATE * MIN_CLIP_S) {
        const t = await engine.transcribe(pcm, { language: this.#lang(), keywords: this.#keywords });
        if (run !== this.#run) return;
        text = normalizeSpoken(tidy(t.text) || tidy(this.live));
        if (t.language) this.language = t.language;
      }
    } catch (e) {
      if (run === this.#run) this.#fail(e);
      return;
    }
    if (run !== this.#run) return;
    this.final = text;
    this.pending = '';
    this.#opts.onText?.(text, true);
    if (!text) {
      this.error = "I didn't catch that. Try again a little closer?";
      this.phase = 'error';
      this.#closeLater(3500);
      return;
    }
    if (this.surface === 'quickadd' || this.surface === 'assistant') {
      this.phase = 'idle';
      if (this.surface === 'assistant') void sessionLoader().then((m) => m.session.ask(text, { spoken: true }));
      return;
    }
    this.phase = 'thinking';
    try {
      const { session } = await sessionLoader();
      await session.ask(text, { spoken: true });
      if (run !== this.#run) return;
      this.entry = session.entries.at(-1) ?? null;
      this.phase = 'result';
      if (!needsAnswer(this.entry)) this.#closeLater(7000);
    } catch (e) {
      if (run === this.#run) this.#fail(e);
    }
  }

  /** Throw away what was heard and close. */
  cancel() {
    this.#run++;
    this.#capture?.stop();
    this.#capture = null;
    this.#clip = [];
    this.#all = [];
    this.#queue = [];
    this.#queued = 0;
    this.#held = false;
    this.speaking = false;
    this.warming = false;
    this.#stopWhenOpen = false;
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#clearClose();
    const wasStreaming = this.#streamed && (this.phase === 'listening' || this.phase === 'finishing');
    this.#streamed = false;
    this.phase = 'idle';
    this.entry = null;
    if (wasStreaming) void this.engine?.streamStop().catch(() => {});
  }

  /** Keep the result on screen (pointer over it). */
  hold() {
    this.#clearClose();
  }
  letGo() {
    if (this.phase === 'result' && !needsAnswer(this.entry)) this.#closeLater(3500);
    else if (this.phase === 'error') this.#closeLater(3500);
  }

  // ---- internals

  #lang(): string | null {
    const l = settings.value.voice.language;
    return l === 'auto' ? null : l;
  }

  #onLevel(run: number, rms: number, ms: number) {
    if (run !== this.#run || this.phase !== 'listening') return;
    const l = loudness(rms);
    if (l > this.#loudest) this.#loudest = l;
    this.#lvl += (l - this.#lvl) * (l > this.#lvl ? 0.5 : 0.18);
    this.#ringData.pop();
    this.#ringData.unshift(l);
    this.#listenedMs += ms;
    if (!this.#frame) this.#frame = requestAnimationFrame(() => this.#flushFrame());
    const st = this.#vad.push(rms, ms);
    this.speaking = st.speaking;
    if (st.heard && !this.heard) {
      // The first word: from here the recogniser listens, starting a moment before it, so
      // the silence before can't turn into words that were never said.
      this.heard = true;
      this.words = [];
      this.#clip = [...this.#preroll];
      this.#queue = [...this.#preroll];
      this.#queued = this.#prerollLen;
      this.#preroll = [];
      this.#prerollLen = 0;
      this.#pump(run);
    }
    if (this.#listenedMs >= MAX_CLIP_MS) void this.stop();
    else if (this.handsFree && st.heard && st.quietMs >= PAUSE_MS) void this.stop();
    else if (this.handsFree && !st.heard && this.#listenedMs >= NOTHING_MS) {
      this.cancel();
      this.error = "I didn't hear anything. Hold V and talk, or tap V and speak.";
      this.phase = 'error';
      this.#closeLater(3500);
    }
  }

  /** Publish the ring, the orb's level and the clock (once per frame, not per audio message). */
  #flushFrame() {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.ring = this.#ringData.slice();
    this.level = this.#lvl;
    this.seconds = this.#listenedMs / 1000;
  }

  #onAudio(run: number, pcm: Float32Array) {
    if (run !== this.#run || this.phase !== 'listening') return;
    if (this.#allLen < (SPEECH_RATE * MAX_CLIP_MS) / 1000) {
      this.#all.push(pcm);
      this.#allLen += pcm.length;
    }
    if (!this.heard) {
      this.#preroll.push(pcm);
      this.#prerollLen += pcm.length;
      while (this.#preroll.length > 1 && this.#prerollLen - this.#preroll[0].length >= PREROLL_SAMPLES) {
        this.#prerollLen -= this.#preroll.shift()!.length;
      }
      return;
    }
    this.#clip.push(pcm);
    this.#queue.push(pcm);
    this.#queued += pcm.length;
    this.#pump(run);
  }

  #pump(run: number) {
    if (this.#inflight || !this.#isReady || this.#queued < STEP_SAMPLES || !this.engine) return;
    const chunk = concat(this.#queue);
    this.#queue = [];
    this.#queued = 0;
    this.#streamed = true;
    this.#inflight = this.engine
      .streamPush(chunk, { language: this.#lang(), keywords: this.#keywords })
      .then((step) => {
        if (run !== this.#run) return;
        if (!this.heard) return;
        this.#commit(step);
        this.pending = step.pending.trim();
        if (step.language) this.language = step.language;
        this.#opts.onText?.(this.live, false);
      })
      .catch((e) => {
        // A failed live pass only costs the preview; the final pass still runs.
        if (import.meta.env.DEV) console.warn('voice: live pass failed', e);
      })
      .finally(() => {
        this.#inflight = null;
        if (run === this.#run && this.phase === 'listening') this.#pump(run);
      });
  }

  #commit(step: StreamStep) {
    const fresh = step.text
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean)
      .map((text) => ({ id: ++this.#seq, text }));
    if (fresh.length) this.words = [...this.words, ...fresh];
  }

  #fail(e: unknown) {
    this.#capture?.stop();
    this.#capture = null;
    this.warming = false;
    this.speaking = false;
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    if (e instanceof MicError) {
      this.problem = e.problem;
      this.error = e.message;
    } else {
      this.problem = null;
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.phase = 'error';
  }

  #closeLater(ms: number) {
    this.#clearClose();
    this.#closeTimer = setTimeout(() => {
      this.#closeTimer = null;
      if (this.phase === 'result' || this.phase === 'error') {
        this.phase = 'idle';
        this.entry = null;
        this.error = null;
      }
    }, ms);
  }

  #clearClose() {
    if (this.#closeTimer) clearTimeout(this.#closeTimer);
    this.#closeTimer = null;
  }
}

/** Collapse spaces, drop a lone trailing full stop (commands read better without it). */
export function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim().replace(/^(.{0,80}[^.])\.$/, '$1');
}

/** Cards that ask for a choice stay until answered. */
function needsAnswer(entry: Entry | null): boolean {
  const kind = entry?.result?.card?.kind;
  return kind === 'choice' || kind === 'confirm';
}

export const voice = new Voice();

// Dev builds only: a handle for poking at voice from the console and from UI tests.
if (import.meta.env.DEV) (globalThis as { __voice?: Voice }).__voice = voice;
