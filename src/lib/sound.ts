// Every sound is synthesised on the fly with WebAudio: no assets, ~zero weight.
// Sounds are soft, short and never startle: slow attacks, low gain, no sharp highs.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let volume = 0.5;

/** The volume slider, gently curved so the middle is clearly audible and the top not loud. */
const gainFor = (v: number) => Math.min(1, Math.max(0, v)) ** 1.15 * 0.95;

function audio() {
  if (!enabled || typeof AudioContext === 'undefined') return null;
  // A closed context never plays again: start a fresh one.
  if (ctx && ctx.state === 'closed') {
    ctx = null;
    master = null;
  }
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = gainFor(volume);
    master.connect(ctx.destination);
  }
  // 'suspended', or WebKit's 'interrupted' (after sleep, an output change or the microphone).
  if (ctx.state !== 'running') {
    const c = ctx;
    c.resume().catch(() => {
      if (ctx === c) {
        void c.close().catch(() => {});
        ctx = null;
        master = null;
      }
    });
  }
  return ctx;
}

// Wake the context when the window comes back, so the next sound plays on time.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {});
  });
}

/** The shared output (context and master gain), for other voices like Alef's; null when sound is off. */
export function audioOut(): { ctx: AudioContext; master: GainNode } | null {
  const c = audio();
  return c && master ? { ctx: c, master } : null;
}

export function configureSound(on: boolean, vol: number) {
  enabled = on;
  volume = vol;
  if (master) master.gain.value = gainFor(vol);
}

/** A bell-like tone: fundamental plus an inharmonic partial that fades first. */
function bell(freq: number, at: number, dur = 1.6, gain = 0.22) {
  const c = audio();
  if (!c || !master) return;
  const t = c.currentTime + at;
  for (const [mult, g, d] of [
    [1, gain, dur],
    [2.76, gain * 0.18, dur * 0.35],
    [5.4, gain * 0.05, dur * 0.15],
  ] as const) {
    const o = c.createOscillator();
    const v = c.createGain();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    v.gain.setValueAtTime(0, t);
    v.gain.linearRampToValueAtTime(g, t + 0.012);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(v).connect(master);
    o.start(t);
    o.stop(t + d + 0.05);
  }
}

let lastDetent = 0;
/** The bezel's 5-minute click. Rate-limited so fast sweeps purr instead of rattle. */
export function detent() {
  const c = audio();
  if (!c || !master) return;
  const now = performance.now();
  if (now - lastDetent < 28) return;
  lastDetent = now;
  const t = c.currentTime;
  const len = Math.floor(c.sampleRate * 0.012);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400;
  bp.Q.value = 2.2;
  const g = c.createGain();
  g.gain.value = 0.5;
  src.connect(bp).connect(g).connect(master);
  src.start(t);
}

export const sounds = {
  /** Block finished: a rising fifth. */
  done() {
    bell(659.25, 0, 1.4, 0.2);
    bell(987.77, 0.09, 1.8, 0.16);
  },
  /** Subtask ticked: one light tap. */
  tick() {
    bell(1318.5, 0, 0.5, 0.08);
  },
  /** Heads-up: a single low, warm tone. */
  headsUp() {
    bell(440, 0, 2.2, 0.16);
  },
  /** A new block begins: soft rising triad. */
  begin() {
    bell(523.25, 0, 1.2, 0.12);
    bell(659.25, 0.12, 1.2, 0.11);
    bell(783.99, 0.24, 1.6, 0.1);
  },
  /** Timer ran out. */
  timerEnd() {
    bell(783.99, 0, 1.6, 0.16);
    bell(783.99, 0.5, 1.6, 0.13);
    bell(1046.5, 1.0, 2.2, 0.13);
  },
  /** Listening starts: two quick rising notes. */
  listen() {
    bell(880, 0, 0.35, 0.07);
    bell(1174.66, 0.07, 0.45, 0.07);
  },
  /** Listening stops: the same two notes, falling. */
  heard() {
    bell(1174.66, 0, 0.35, 0.06);
    bell(880, 0.07, 0.5, 0.06);
  },
  /** Breathing guide: a soft, low swell as the in-breath begins… */
  breatheIn() {
    bell(392, 0, 3.2, 0.05);
  },
  /** …and a lower one as the long out-breath begins. */
  breatheOut() {
    bell(293.66, 0, 4.2, 0.045);
  },
  /** The adhan's time: three soft, low bells rising, unhurried. */
  adhan() {
    bell(293.66, 0, 3.2, 0.07);
    bell(349.23, 0.55, 3.2, 0.065);
    bell(440, 1.1, 4.2, 0.06);
  },
  /** Last block of the day finished. */
  dayComplete() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, i * 0.11, 2.4, 0.11));
  },
};
