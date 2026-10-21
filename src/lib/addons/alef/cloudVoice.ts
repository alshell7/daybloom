// Alef speaking in a voice from an AI service (Settings › AI › Alef › Speaks): the words go to
// the service, the audio comes back and plays through Alef's own small speaker, a little
// higher, like its other voices. Recent lines are kept, so a repeated line costs nothing.
// Anything that fails falls back to Alef's chirps.

import { ai, aiFile } from '../../ai/hub.svelte';
import { synthesize } from '../../ai/providers';
import { platform } from '../../platform';
import { audioOut } from '../../sound';
import { babble } from './chirps';
import { playSpoken, speakable, type Spoken } from './voice';

/** How the voice should sound, for models that take a manner. */
export const MANNER = 'You are Alef, a tiny, warm, playful robot. Speak brightly and gently, a little quick, with a smile; short and clear.';

const cache = new Map<string, { samples: Float32Array; rate: number }>();

export async function speakCloud(text: string, o: { pitch: number; volume: number; soundOn: boolean }): Promise<Spoken | null> {
  const words = speakable(text);
  if (!words || !o.soundOn) return null;
  const out = audioOut();
  const conn = out ? await ai.connection('alef', 'speak') : null;
  if (!out || !conn) return babble(words, o);
  const voice = aiFile.value.use.alef.speak.voice ?? ai.service(conn.provider)?.voice;
  const id = `${conn.provider}|${conn.config.model}|${voice}|${words}`;
  try {
    let pcm = cache.get(id);
    if (!pcm) {
      const bytes = await synthesize(conn.config, conn.key, words, (u, i) => platform.fetch(u, i), { voice, instructions: MANNER });
      const buf = await out.ctx.decodeAudioData(bytes);
      pcm = { samples: buf.getChannelData(0).slice(), rate: buf.sampleRate };
      cache.set(id, pcm);
      if (cache.size > 24) cache.delete(cache.keys().next().value!);
    }
    return playSpoken(words, pcm, o);
  } catch (e) {
    console.warn('[daybloom] alef cloud voice', e);
    return babble(words, o);
  }
}
