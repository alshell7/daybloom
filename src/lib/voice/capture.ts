// Microphone → 16 kHz mono float PCM for Whistle. Opens the mic only while listening and
// closes every track afterwards, so the OS "mic in use" indicator goes away at once.

import { platform } from '../platform';
import { Resampler, SPEECH_RATE } from './audio';

export interface CaptureHandlers {
  /** 16 kHz mono samples, about every 20 ms. */
  onAudio(pcm: Float32Array): void;
  /** RMS and peak of the same 20 ms, at the device rate. */
  onLevel(rms: number, peak: number, ms: number): void;
}

export interface Capture {
  /** The device's own rate (what the resampler converts from). */
  readonly rate: number;
  readonly label: string;
  stop(): void;
}

export type MicProblem = 'denied' | 'missing' | 'busy' | 'unsupported';

export class MicError extends Error {
  constructor(
    readonly problem: MicProblem,
    message: string,
  ) {
    super(message);
    this.name = 'MicError';
  }
}

function micError(e: unknown): MicError {
  const name = e instanceof DOMException || e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new MicError('denied', 'Daybloom is not allowed to use the microphone.');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new MicError('missing', 'No microphone was found.');
  if (name === 'NotReadableError' || name === 'AbortError') return new MicError('busy', 'The microphone is busy in another app.');
  return new MicError('unsupported', e instanceof Error ? e.message : 'The microphone could not start.');
}

function workletUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}voice/capture-worklet.js`, location.href).href;
}

export async function startCapture(h: CaptureHandlers): Promise<Capture> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
    throw new MicError('unsupported', 'This window cannot record audio.');
  }
  // A phone: Android's own permission first (the web view's prompt alone isn't enough).
  if (platform.isMobile) {
    const { deviceCall } = await import('../native/device.svelte');
    const r = await deviceCall<{ granted: boolean }>('microphone').catch(() => null);
    if (r && !r.granted) throw new MicError('denied', 'The microphone isn’t allowed for Daybloom. You can allow it in Android’s settings.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch (e) {
    throw micError(e);
  }
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  let node: AudioWorkletNode | null = null;
  const stopTracks = () => stream.getTracks().forEach((t) => t.stop());
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    await ctx.audioWorklet.addModule(workletUrl());
    const source = ctx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ctx, 'daybloom-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
    // A silent path to the destination keeps WebKit pulling the node.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(node);
    node.connect(mute).connect(ctx.destination);
  } catch (e) {
    stopTracks();
    void ctx.close();
    throw micError(e);
  }
  const resampler = new Resampler(ctx.sampleRate, SPEECH_RATE);
  node.port.onmessage = (e: MessageEvent<{ pcm: Float32Array; rms: number; peak: number }>) => {
    const { pcm, rms, peak } = e.data;
    h.onLevel(rms, peak, (pcm.length / ctx.sampleRate) * 1000);
    const out = resampler.push(pcm);
    if (out.length) h.onAudio(out);
  };
  let stopped = false;
  const track = stream.getAudioTracks()[0];
  return {
    rate: ctx.sampleRate,
    label: track?.label ?? '',
    stop() {
      if (stopped) return;
      stopped = true;
      node?.port.postMessage('stop');
      node?.disconnect();
      stopTracks();
      void ctx.close();
    },
  };
}
