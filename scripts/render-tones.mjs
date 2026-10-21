// Renders Daybloom's alarm tones (src/lib/alarm.ts, the same synthesiser the app plays) to
// WAV files for Android, which rings alarms natively while the app is closed:
//   src-tauri/gen/android/app/src/main/res/raw/tone_<id>.wav
// Each file is one seamless period of the tone (Android repeats it while the alarm rings),
// mono, 16-bit, 32 kHz. Run again after a tone changes: node scripts/render-tones.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALARM_TONES, renderTone } from '../src/lib/alarm.ts';

const SR = 32_000;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res', 'raw');
mkdirSync(out, { recursive: true });

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32_767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

for (const t of ALARM_TONES) {
  const chans = renderTone(t.id, SR, 'loop');
  const n = chans[0].length;
  const mono = new Float32Array(n);
  for (const c of chans) for (let i = 0; i < n; i++) mono[i] += c[i] / chans.length;
  const file = join(out, `tone_${t.id}.wav`);
  writeFileSync(file, wav(mono));
  console.log(`${t.id}: ${(n / SR).toFixed(2)} s, ${Math.round((n * 2) / 1024)} KB`);
}
