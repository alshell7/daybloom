// Alef's feelings and tricks, a subset of the app's 32 behaviours
// (src/lib/addons/alef/behaviors.ts), each a short performance of eye poses with a mood light.

export interface Eye {
  /** Offset from its rest position (face units). */
  x: number;
  y: number;
  /** Size, as a scale of the resting eye. */
  sx: number;
  sy: number;
  /** Tilt (deg). */
  rot: number;
  /** Top lid: how far it covers (0..1) and its slant (deg; + = inner corner down). */
  lid: number;
  slant: number;
  /** Bottom lid: how far the round lid rises (0..1): a smile. */
  smile: number;
}

export interface Pose {
  l: Eye;
  r: Eye;
  ms: number;
  hold: number;
}

export type Overlay = 'hearts' | 'stars' | 'zzz' | 'sweat' | 'question' | 'exclaim' | 'confetti' | 'tear' | 'vein' | 'spark';

export interface Behavior {
  id: string;
  label: string;
  poses: Pose[];
  led: string;
  glow: number;
  posture: { tilt: number; y: number; scale: number; shake?: boolean; bounce?: boolean };
  overlay?: Overlay;
}

// ── Eye helpers ──
const E: Eye = { x: 0, y: 0, sx: 1, sy: 1, rot: 0, lid: 0, slant: 0, smile: 0 };
const eye = (o: Partial<Eye> = {}): Eye => ({ ...E, ...o });
const both = (o: Partial<Eye>, ms = 220, hold = 400): Pose => ({ l: eye(o), r: eye(o), ms, hold });
/** Mirrored: slant and tilt flip on the right eye so a frown or a tilt reads naturally. */
const mirror = (o: Partial<Eye>, ms = 220, hold = 400): Pose => ({ l: eye(o), r: eye({ ...o, slant: -(o.slant ?? 0), rot: -(o.rot ?? 0), x: o.x ?? 0 }), ms, hold });
const pair = (l: Partial<Eye>, r: Partial<Eye>, ms = 220, hold = 400): Pose => ({ l: eye(l), r: eye(r), ms, hold });
export const REST: Pose = both({}, 260, 0);
const blink = (ms = 70): Pose[] => [both({ sy: 0.08 }, ms, 50), both({}, ms + 30, 0)];

const LED = {
  warm: '#FFC85C',
  joy: '#5CF2B0',
  gold: '#FFD84A',
  love: '#FF7AB8',
  cool: '#7AA7FF',
  blue: '#5B8CFF',
  violet: '#A58BFF',
  calm: '#4FD3E6',
  dim: '#2E8FA8',
  hot: '#FF8A4C',
  amber: '#FFB14A',
  grey: '#8A97AD',
} as const;


type Raw = Behavior & { core?: string; lift?: number; chirp?: string };
const B = (b: Raw): Behavior => b;

export const ACTS: Record<string, Behavior> = {
  happy: B({ id: 'happy', core: 'pleasant', label: 'Happy', led: LED.joy, glow: 0.75, lift: 5, chirp: 'happy', posture: { tilt: 0, y: -3, scale: 1.01 },
    poses: [both({ smile: 0.48 }, 220, 1100), both({ smile: 0.3 }, 260, 200)] }),
  delighted: B({ id: 'delighted', core: 'pleasant', label: 'Delighted', led: LED.joy, glow: 0.85, lift: 6, chirp: 'delight', overlay: 'spark', posture: { tilt: 0, y: -4, scale: 1.02, bounce: true },
    poses: [both({ smile: 0.6, sy: 0.9 }, 180, 900), both({ smile: 0.45 }, 260, 300)] }),
  loving: B({ id: 'loving', core: 'pleasant', label: 'Loving', led: LED.love, glow: 0.9, lift: 6, chirp: 'love', overlay: 'hearts', posture: { tilt: 4, y: -3, scale: 1.02 },
    poses: [both({ smile: 0.5, sx: 1.05, sy: 0.92, rot: 4 }, 260, 1300), both({ smile: 0.3 }, 280, 200)] }),
  // ── Unpleasant ──
  excited: B({ id: 'excited', core: 'pleasant-active', label: 'Excited', led: LED.warm, glow: 0.95, lift: 8, chirp: 'excited', overlay: 'spark', posture: { tilt: 0, y: -5, scale: 1.02, bounce: true },
    poses: [both({ sx: 1.08, sy: 1.12, y: -5 }, 140, 200), both({ sx: 1.08, sy: 1.0, y: 0 }, 140, 160), both({ sx: 1.08, sy: 1.12, y: -5 }, 140, 200), both({ sx: 1.05, sy: 1.05 }, 200, 500)] }),
  curious: B({ id: 'curious', core: 'active', label: 'Curious', led: LED.calm, glow: 0.85, lift: 4, chirp: 'curious', overlay: 'question', posture: { tilt: 6, y: -2, scale: 1.01 },
    poses: [pair({ rot: 10, sx: 0.92, sy: 0.92, x: 6 }, { rot: 10, sx: 1.12, sy: 1.12, x: 6 }, 260, 1000), both({}, 260, 200)] }),
  // ── Pleasant inactive ──
  spinning: B({ id: 'spinning', core: 'active', label: 'Thinking', led: LED.calm, glow: 0.8, lift: 0, chirp: 'whirr', posture: { tilt: 0, y: 0, scale: 1 },
    poses: [both({ x: 0, y: -10, sx: 0.8, sy: 0.8 }, 180, 60), both({ x: 10, y: 0, sx: 0.8, sy: 0.8 }, 180, 60), both({ x: 0, y: 10, sx: 0.8, sy: 0.8 }, 180, 60), both({ x: -10, y: 0, sx: 0.8, sy: 0.8 }, 180, 60), both({ x: 0, y: -10, sx: 0.8, sy: 0.8 }, 180, 60), both({}, 220, 100)] }),
  sleepy: B({ id: 'sleepy', core: 'inactive', label: 'Sleepy', led: LED.dim, glow: 0.3, lift: -4, chirp: 'yawn', overlay: 'zzz', posture: { tilt: -5, y: 6, scale: 0.98 },
    poses: [both({ lid: 0.65, y: 4 }, 800, 900), both({ lid: 0.85, y: 6 }, 900, 700), both({ lid: 0.5, y: 3 }, 300, 400), both({ lid: 0.6, y: 4 }, 700, 300)] }),
  proud: B({ id: 'proud', core: 'pleasant-active', label: 'Proud', led: LED.gold, glow: 0.9, lift: 8, chirp: 'proud', overlay: 'stars', posture: { tilt: -3, y: -6, scale: 1.03 },
    poses: [both({ lid: 0.22, slant: -6, smile: 0.35, y: -3 }, 240, 1100), both({ smile: 0.3 }, 240, 300)] }),
  // ── Unpleasant active ──
  grumpy: B({ id: 'grumpy', core: 'unpleasant-inactive', label: 'Grumpy', led: LED.blue, glow: 0.55, lift: -3, chirp: 'grumble', posture: { tilt: 0, y: 2, scale: 0.99 },
    poses: [mirror({ lid: 0.42, slant: 16, y: 3 }, 260, 1100), mirror({ lid: 0.4, slant: 14, x: -5 }, 300, 400), mirror({ lid: 0.25, slant: 8 }, 300, 200)] }),
  celebratory: B({ id: 'celebratory', core: 'pleasant-active', label: 'Celebratory', led: LED.joy, glow: 1, lift: 14, chirp: 'excited', overlay: 'confetti', posture: { tilt: 0, y: -8, scale: 1.04, bounce: true },
    poses: [both({ smile: 0.55, sy: 0.9, y: -3 }, 160, 260), mirror({ smile: 0.6, rot: -8, x: -4 }, 180, 220), mirror({ smile: 0.6, rot: 8, x: 4 }, 180, 220), both({ smile: 0.55 }, 200, 600)] }),
  amazed: B({ id: 'amazed', core: 'pleasant-active', label: 'Amazed', led: LED.gold, glow: 1, lift: 10, chirp: 'amazed', overlay: 'stars', posture: { tilt: 0, y: -6, scale: 1.03 },
    poses: [both({ sx: 1.18, sy: 1.22, y: -4 }, 160, 900), ...blink(), both({ sx: 1.1, sy: 1.1 }, 260, 500)] }),
  glad: B({ id: 'glad', core: 'pleasant-inactive', label: 'Glad', led: LED.joy, glow: 0.6, lift: 3, chirp: 'glad', posture: { tilt: 0, y: -2, scale: 1.01 },
    poses: [both({ smile: 0.35, lid: 0.12 }, 320, 1100), both({ smile: 0.15 }, 320, 200)] }),
  // ── Unpleasant inactive ──
  content: B({ id: 'content', core: 'pleasant-inactive', label: 'Content', led: LED.calm, glow: 0.5, lift: 2, chirp: 'content', posture: { tilt: 0, y: 0, scale: 1 },
    poses: [both({ lid: 0.3, smile: 0.25, sy: 0.92 }, 600, 1600), both({ lid: 0.2, smile: 0.15 }, 500, 200)] }),
  startled: B({ id: 'startled', core: 'unpleasant-active', label: 'Startled', led: LED.cool, glow: 1, lift: 6, chirp: 'startle', overlay: 'exclaim', posture: { tilt: 0, y: -10, scale: 1.05 },
    poses: [both({ sx: 1.25, sy: 1.25, y: -6 }, 70, 500), ...blink(60), both({ sx: 1.05, sy: 1.05 }, 260, 300)] }),
  // ── Active ──
  purring: B({ id: 'purring', core: 'pleasant-inactive', label: 'Purring', led: LED.love, glow: 0.8, lift: 4, chirp: 'purr', overlay: 'hearts', posture: { tilt: 0, y: -2, scale: 1.02 },
    poses: [both({ smile: 0.55, lid: 0.2, sy: 0.92 }, 260, 400), mirror({ smile: 0.6, lid: 0.26, rot: -5, x: -2 }, 520, 420), mirror({ smile: 0.6, lid: 0.26, rot: 5, x: 2 }, 520, 420), both({ smile: 0.55, lid: 0.2 }, 420, 600)] }),
  giggling: B({ id: 'giggling', core: 'pleasant-active', label: 'Giggling', led: LED.joy, glow: 1, lift: 6, chirp: 'giggle', overlay: 'spark', posture: { tilt: 0, y: -3, scale: 1.02, bounce: true },
    poses: [both({ smile: 0.66, sy: 0.82 }, 90, 80), both({ smile: 0.66, sy: 0.76, y: -4 }, 80, 70), both({ smile: 0.66, sy: 0.82 }, 80, 70), both({ smile: 0.66, sy: 0.76, y: -4 }, 80, 70), both({ smile: 0.6, sy: 0.84 }, 90, 260), both({ smile: 0.35 }, 220, 200)] }),
  squished: B({ id: 'squished', core: 'unpleasant-active', label: 'Squished', led: LED.cool, glow: 0.9, lift: -4, chirp: 'squeak', posture: { tilt: 0, y: 4, scale: 0.94 },
    // Squeezed tight (two slanted slits, "\ /"), then a boing back open.
    poses: [pair({ sx: 1.12, sy: 0.26, rot: 18, y: 3 }, { sx: 1.12, sy: 0.26, rot: -18, y: 3 }, 70, 560), both({ sx: 0.86, sy: 1.3, y: -5 }, 110, 120), both({ sx: 1.05, sy: 0.95 }, 140, 80), both({}, 200, 100)] }),
  welcome: B({ id: 'welcome', core: 'pleasant-active', label: 'Welcome back', led: LED.joy, glow: 1, lift: 8, chirp: 'welcome', overlay: 'spark', posture: { tilt: 0, y: -6, scale: 1.03, bounce: true },
    poses: [both({ sx: 1.16, sy: 1.2, y: -4 }, 110, 380), both({ smile: 0.58, sy: 0.88 }, 180, 700), both({ smile: 0.3 }, 260, 200)] }),
  dancing: B({ id: 'dancing', core: 'pleasant-active', label: 'Dancing', led: LED.gold, glow: 1, lift: 14, chirp: 'dance', overlay: 'confetti', posture: { tilt: 0, y: -6, scale: 1.04, bounce: true },
    poses: [mirror({ smile: 0.5, rot: -10, x: -6, y: -3 }, 150, 110), mirror({ smile: 0.5, rot: 10, x: 6, y: 2 }, 150, 110), mirror({ smile: 0.5, rot: -10, x: -6, y: -3 }, 150, 110), mirror({ smile: 0.5, rot: 10, x: 6, y: 2 }, 150, 110), both({ smile: 0.6, sy: 0.85, y: -6 }, 160, 400), both({ smile: 0.4 }, 240, 200)] }),
  peekaboo: B({ id: 'peekaboo', core: 'pleasant-active', label: 'Peekaboo', led: LED.warm, glow: 0.9, lift: 6, chirp: 'peekaboo', posture: { tilt: 0, y: -4, scale: 1.03 },
    poses: [both({ lid: 0.96 }, 120, 700), both({ sx: 1.22, sy: 1.26, y: -4 }, 90, 380), both({ smile: 0.6, sy: 0.88 }, 180, 600), both({}, 240, 100)] }),
  waking: B({ id: 'waking', core: 'inactive', label: 'Waking up', led: LED.dim, glow: 0.45, lift: 0, chirp: 'yawn', posture: { tilt: -3, y: 3, scale: 0.99 },
    poses: [both({ lid: 0.85, y: 6 }, 300, 400), both({ lid: 0.55, y: 4 }, 500, 300), ...blink(110), both({ lid: 0.6, y: 3 }, 300, 260), ...blink(90), both({}, 300, 100)] }),
};

export const lengthOf = (b: Behavior) => b.poses.reduce((s, p) => s + p.ms + p.hold, 0);
