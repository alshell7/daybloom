// Shared contract between the on-device Needle engine (engine.svelte.ts + needle.worker.ts)
// and the assistant (brain + tools + generative UI). Needle is a small tool-calling model by
// Cactus Compute (Apache-2.0), run here as WebAssembly in a worker. No cloud, no LLM.

/** A tool as Needle sees it: JSON-Schema parameters, optional regex triggers that force routing. */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
  /** Regexes (Needle-native) that force a matching request to this tool. */
  triggers?: string[];
}

export interface NeedleCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface NeedleResult {
  calls: NeedleCall[];
  /** Calibrated confidence from Needle (floor 0.1); 0 when the engine wasn't used. */
  confidence: number;
  reasoning?: string;
  /** Wall time for the turn in ms. */
  ms: number;
  /** The engine's raw JSON object, for debugging. */
  raw?: unknown;
}

export type EngineStatus =
  | 'absent' // weights not on this device yet
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'error';

/** Where the weights come from — pinned to an exact revision and hash. */
export const NEEDLE_WEIGHTS = {
  url: 'https://huggingface.co/Cactus-Compute/needle3/resolve/3391a1007e7db31d2fe5c69c734bbe93a9c1ce79/needle3.cact',
  sha256: 'c9d915eca282ed42d1a09b143b592adb4cc6744ffe2d294adf5cfc5548170c38',
  bytes: 35_335_380,
  file: 'needle3.cact',
} as const;

/** Whistle, the speech-to-text model by the same team, run by the same engine. */
export const WHISTLE_WEIGHTS = {
  url: 'https://huggingface.co/Cactus-Compute/whistle/resolve/741118687e1f008f06d1351a402a731274789790/whistle.cact',
  sha256: 'b6e02f048568ac5d01a2042556c658061e699acbc0aa2a1439f52f3d461dffeb',
  bytes: 16_919_407,
  file: 'whistle.cact',
} as const;

/** One recognised word, with times in seconds from the start of the audio. */
export interface SpokenWord {
  word: string;
  start: number;
  end: number;
  probability: number;
}

export interface TranscribeOptions {
  /** "en", "de", "fr", "es", "it", "nl", "pl", or null to detect. */
  language?: string | null;
  /** Words and phrases to bias recognition towards (task titles, app words). */
  keywords?: string[];
  /** Include per-word times (transcribe only). */
  words?: boolean;
}

export interface Transcript {
  text: string;
  language: string;
  words: SpokenWord[];
  /** Wall time for the call in ms. */
  ms: number;
}

/** One live-transcription step: the words this step committed and the unconfirmed tail. */
export interface StreamStep {
  text: string;
  words: SpokenWord[];
  pending: string;
  language: string;
  /** Seconds of audio received so far. */
  received: number;
  ms: number;
}

/** The speech side of the engine (implemented by `whistle` in engine.svelte.ts). */
export interface SpeechEngine {
  readonly status: EngineStatus;
  readonly progress: number;
  readonly error: string | null;
  hasWeights(): Promise<boolean>;
  ensureReady(): Promise<void>;
  /** 16 kHz mono float PCM in [-1, 1], any length. */
  transcribe(pcm: Float32Array, opts?: TranscribeOptions): Promise<Transcript>;
  /** Live: append about a second of audio and re-transcribe what is buffered. */
  streamPush(pcm: Float32Array, opts?: TranscribeOptions): Promise<StreamStep>;
  /** End the live stream: the tail becomes committed words. */
  streamStop(): Promise<StreamStep>;
  unload(): void;
  forget(): Promise<void>;
}

/**
 * The engine API the assistant uses (implemented by `needle` in engine.svelte.ts).
 * All methods are safe to call before the weights exist; they reject with a clear error.
 */
export interface NeedleEngine {
  readonly status: EngineStatus;
  /** 0..1 while downloading. */
  readonly progress: number;
  readonly error: string | null;
  /** Whether the verified weights are already on this device. */
  hasWeights(): Promise<boolean>;
  /** Download (if needed, only when called) + verify + load the model in its worker. */
  ensureReady(): Promise<void>;
  /** Set the tool catalogue and session facts (date, locale). Cheap to call again when they change. */
  configure(tools: ToolSchema[], system: string): Promise<void>;
  /** One independent turn (the conversation is reset first). */
  complete(text: string, maxTokens?: number): Promise<NeedleResult>;
  /** Text embedding for semantic matching / search. */
  embed(text: string): Promise<Float32Array>;
  /** Free the model's memory (also happens automatically after a few idle minutes). */
  unload(): void;
  /** Delete the downloaded weights. */
  forget(): Promise<void>;
}
