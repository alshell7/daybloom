// Alef's spoken voice: tiny-tts on this device (filled in below).

import type { SpeechSynth } from '../voice';

export type TtsStatus = 'absent' | 'downloading' | 'loading' | 'ready' | 'error';

class TinyTts implements SpeechSynth {
  status = $state<TtsStatus>('absent');
  progress = $state(0);
  error = $state<string | null>(null);

  ready() {
    return this.status === 'ready';
  }

  async download(): Promise<void> {}

  async synth(_text: string): Promise<{ samples: Float32Array; rate: number } | null> {
    return null;
  }
}

export const tinyTts = new TinyTts();
