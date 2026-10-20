// How Alef sounds when it talks: chirps in the rhythm of the words, a small spoken voice
// (tiny-tts, on this device, pitched up a little), the system's voice, or silence. Every
// voice goes through the app's sound switch and volume.

import { audioOut } from '../../sound';
import { babble, speaker } from './chirps';

export type VoiceMode = 'chirps' | 'speech' | 'system' | 'off';

/** When each syllable starts (s, from now) and how long it all lasts: the face moves to it. */
export interface Spoken {
  starts: number[];
  total: number;
}

/** The on-device voice, loaded on demand (see tts/). */
export interface SpeechSynth {
  ready(): boolean;
  synth(text: string, o?: { speed?: number }): Promise<{ samples: Float32Array; rate: number } | null>;
}

let stopCurrent: (() => void) | null = null;

/** Stop whatever Alef is saying. */
export function hush() {
  stopCurrent?.();
  stopCurrent = null;
  try {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  } catch {
    /* none */
  }
}

/** Speakable text: no links, no brackets, no emoji. */
export function speakable(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/[“”"]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Syllable starts for a sentence at a speaking pace (for the face, when the voice can't say). */
export function paced(text: string, total: number): number[] {
  const n = Math.max(1, Math.round(text.replace(/[^a-z0-9]/gi, '').length / 3.1));
  return Array.from({ length: Math.min(n, 60) }, (_, i) => (i / n) * total);
}

export async function speak(text: string, mode: VoiceMode, o: { pitch: number; volume: number; soundOn: boolean; tts?: SpeechSynth | null }): Promise<Spoken | null> {
  hush();
  const words = speakable(text);
  if (!words || mode === 'off' || !o.soundOn) return null;
  if (mode === 'chirps') return babble(words, { pitch: o.pitch, volume: o.volume });
  if (mode === 'speech' && o.tts?.ready()) {
    try {
      const pcm = await o.tts.synth(words, { speed: 1 });
      const out = pcm && audioOut();
      if (pcm && out) {
        const r = playPcm(pcm, out, o);
        stopCurrent = r.stop;
        const total = r.total;
        return { starts: paced(words, total), total };
      }
    } catch (e) {
      console.warn('[daybloom] alef voice', e);
    }
    // Not ready or failed: the system voice says it instead.
  }
  return systemVoice(words, o);
}

/**
 * Play the spoken voice like Alef's own: a little higher and quicker (a small robot, not a
 * grown-up), through the same small speaker as its chirps.
 */
export function playPcm(pcm: { samples: Float32Array; rate: number }, out: { ctx: BaseAudioContext; master: AudioNode }, o: { pitch: number; volume: number }): { total: number; stop: () => void } {
  const { ctx, master } = out;
  const buf = ctx.createBuffer(1, pcm.samples.length, pcm.rate);
  buf.copyToChannel(pcm.samples as Float32Array<ArrayBuffer>, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const rate = 1.14 + (o.pitch - 1) * 0.6;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = Math.max(0, Math.min(1, o.volume)) * 0.48;
  const { input, release } = speaker(ctx, master, { grit: 0.1 });
  src.connect(g).connect(input);
  src.start();
  src.onended = () => {
    g.disconnect();
    release();
  };
  return {
    total: buf.duration / rate,
    stop: () => {
      try {
        src.stop();
      } catch {
        /* ended */
      }
    },
  };
}

let voices: SpeechSynthesisVoice[] = [];
function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  if (!voices.length) voices = speechSynthesis.getVoices();
  const en = voices.filter((v) => /^en/i.test(v.lang));
  const liked = /samantha|karen|moira|tessa|aria|jenny|zira|google us english|nicky|serena/i;
  return en.find((v) => liked.test(v.name)) ?? en.find((v) => v.localService) ?? en[0] ?? null;
}
if (typeof speechSynthesis !== 'undefined') {
  try {
    speechSynthesis.onvoiceschanged = () => (voices = speechSynthesis.getVoices());
  } catch {
    /* read-only in some engines */
  }
}

function systemVoice(words: string, o: { pitch: number; volume: number }): Spoken | null {
  if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return babble(words, { pitch: o.pitch, volume: o.volume });
  const u = new SpeechSynthesisUtterance(words);
  const v = pickVoice();
  if (v) u.voice = v;
  u.pitch = Math.max(0.5, Math.min(2, 1.55 * o.pitch));
  u.rate = 1.04;
  u.volume = Math.max(0, Math.min(1, o.volume));
  speechSynthesis.speak(u);
  const total = Math.max(0.6, words.split(/\s+/).length * 0.34);
  return { starts: paced(words, total), total };
}
