// Daybloom's own models, kept on this device: Needle (understands what you ask), Whistle (hears
// what you say) and Alef's voice (speaks). One shape for the page, whichever engine is behind it.

import { needle, whistle } from '../../../lib/assistant/engine.svelte';
import { tinyTts, VOICE_BYTES } from '../../../lib/addons/alef/tts/tts.svelte';
import { BUILDS, decision } from '../../../lib/addons/decision/decision.svelte';

export type DeviceId = 'needle' | 'whistle' | 'voice' | 'tinydecide';
export type DeviceStatus = 'absent' | 'downloading' | 'loading' | 'ready' | 'error';

export interface DeviceModel {
  id: DeviceId;
  name: string;
  /** What it does, in a few words. */
  does: string;
  icon: string;
  mb: number;
  /** What happens until it's downloaded. */
  until?: string;
  readonly status: DeviceStatus;
  readonly progress: number;
  readonly error: string | null;
  /** Bytes in memory right now (0: asleep, or unknown). */
  readonly memory: number;
  get(): Promise<void>;
  remove(): Promise<void>;
}

const engine = (id: DeviceId, name: string, does: string, icon: string, mb: number, e: typeof needle, until?: string): DeviceModel => ({
  id,
  name,
  does,
  icon,
  mb,
  until,
  get status() {
    return e.status;
  },
  get progress() {
    return e.progress;
  },
  get error() {
    return e.error;
  },
  get memory() {
    return e.loaded ? e.memory : 0;
  },
  get: () => e.ensureReady(),
  remove: () => e.forget(),
});

export const DEVICE_MODELS: DeviceModel[] = [
  engine('needle', 'Needle', 'Understands what you ask', 'cpu', 35, needle, 'Until then, it works in basic mode.'),
  engine('whistle', 'Whistle', 'Hears what you say', 'ear', 17, whistle),
  {
    id: 'voice',
    name: "Alef's voice",
    does: 'Speaks for Alef',
    icon: 'speech',
    mb: Math.round(VOICE_BYTES / 1e6),
    until: "Until then, your computer's voice speaks.",
    get status() {
      return tinyTts.status;
    },
    get progress() {
      return tinyTts.progress;
    },
    get error() {
      return tinyTts.error;
    },
    memory: 0,
    get: () => tinyTts.download(),
    remove: () => tinyTts.forget(),
  },
  {
    id: 'tinydecide',
    // The build chosen for Decision (Settings › AI › Decision): 6 MB, or the 10 MB full one.
    get name() {
      return BUILDS[decision.build].name;
    },
    get does() {
      return `Decision: ${BUILDS[decision.build].does.toLowerCase()}`;
    },
    icon: 'route',
    get mb() {
      return BUILDS[decision.build].mb;
    },
    until: 'Until then, Decision uses the plain rules.',
    get status() {
      return decision.status;
    },
    get progress() {
      return decision.progress;
    },
    get error() {
      return decision.error || null;
    },
    memory: 0,
    get: () => decision.ensure(),
    remove: () => decision.forget(),
  },
];

export const deviceModel = (id: DeviceId) => DEVICE_MODELS.find((m) => m.id === id)!;

/** Look once whether Alef's voice and TinyDecide are here (Needle and Whistle look on their own). */
export const checkDevice = () => {
  void tinyTts.check();
  void decision.check();
};
