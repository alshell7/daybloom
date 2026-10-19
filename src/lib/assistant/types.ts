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
