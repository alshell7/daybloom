// Alef's 32 behaviours, grouped into 8 core states (the affect circumplex: pleasant or not,
// active or not). Each is a short performance: eye poses over time, the LED's colour, the
// dial's posture, whether the blocks rise or sink, a chirp, and sometimes a little overlay
// (hearts, stars, zzz…). Pure data; the face (AlefFace.svelte) plays it.

export type CoreState =
  | 'pleasant-active'
  | 'unpleasant-active'
  | 'active'
  | 'pleasant-inactive'
  | 'unpleasant-inactive'
  | 'inactive'
  | 'pleasant'
  | 'unpleasant';

export const CORE_LABEL: Record<CoreState, string> = {
  'pleasant-active': 'Pleasant active',
  'unpleasant-active': 'Unpleasant active',
  active: 'Active',
  'pleasant-inactive': 'Pleasant inactive',
  'unpleasant-inactive': 'Unpleasant inactive',
  inactive: 'Inactive',
  pleasant: 'Pleasant',
  unpleasant: 'Unpleasant',
};

export type BehaviorId =
  | 'amazed' | 'celebratory' | 'excited' | 'victorious' | 'proud'
  | 'afraid' | 'angry' | 'disgusted' | 'startled'
  | 'racing' | 'spinning' | 'pacing' | 'curious'
  | 'contemplating' | 'content' | 'glad'
  | 'bored' | 'glaring' | 'grumpy' | 'sad'
  | 'blinking' | 'looking' | 'sleepy' | 'sleeping'
  | 'delighted' | 'happy' | 'pleased' | 'loving'
  | 'confused' | 'disappointed' | 'frustrated' | 'miserable';

/**
 * One eye's pose. The eye is a rounded rectangle (46 × 56 in face units) on a black screen;
 * lids are drawn in the screen's black, so they cut shapes: a top lid that slants (angry,
 * sad), and a round bottom lid that rises into a happy crescent.
 */
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
  /** ms to move into this pose. */
  ms: number;
  /** ms to hold it before the next. */
  hold: number;
}

export type Overlay = 'hearts' | 'stars' | 'zzz' | 'sweat' | 'question' | 'exclaim' | 'confetti' | 'tear' | 'vein' | 'spark';

export interface Behavior {
  id: ActId;
  core: CoreState;
  label: string;
  poses: Pose[];
  /** The LED's hue for this feeling. */
  led: string;
  /** How bright the LED glows (0..1). */
  glow: number;
  /** Dial posture: tilt (deg), lift (px, up is −), scale; `shake` wobbles side to side. */
  posture: { tilt: number; y: number; scale: number; shake?: boolean; bounce?: boolean };
  /** Blocks around the ring: + rise, − sink (dial units). */
  lift: number;
  chirp: ChirpId;
  overlay?: Overlay;
}

export type ChirpId =
  | 'happy' | 'excited' | 'fanfare' | 'proud' | 'amazed'
  | 'afraid' | 'angry' | 'disgust' | 'startle'
  | 'hurry' | 'whirr' | 'hmm' | 'curious'
  | 'content' | 'glad' | 'sigh' | 'grumble' | 'sad'
  | 'blink' | 'peek' | 'yawn' | 'snore'
  | 'delight' | 'pleased' | 'love'
  | 'confused' | 'aww' | 'frustrated' | 'whimper'
  | 'purr' | 'giggle' | 'squeak' | 'hiccup' | 'sneeze' | 'stretch' | 'hum' | 'dance' | 'welcome' | 'peekaboo'
  | 'none';

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

const B = (b: Behavior) => b;

export const BEHAVIORS: Record<BehaviorId, Behavior> = {
  // ── Pleasant active ──
  amazed: B({ id: 'amazed', core: 'pleasant-active', label: 'Amazed', led: LED.gold, glow: 1, lift: 10, chirp: 'amazed', overlay: 'stars', posture: { tilt: 0, y: -6, scale: 1.03 },
    poses: [both({ sx: 1.18, sy: 1.22, y: -4 }, 160, 900), ...blink(), both({ sx: 1.1, sy: 1.1 }, 260, 500)] }),
  celebratory: B({ id: 'celebratory', core: 'pleasant-active', label: 'Celebratory', led: LED.joy, glow: 1, lift: 14, chirp: 'excited', overlay: 'confetti', posture: { tilt: 0, y: -8, scale: 1.04, bounce: true },
    poses: [both({ smile: 0.55, sy: 0.9, y: -3 }, 160, 260), mirror({ smile: 0.6, rot: -8, x: -4 }, 180, 220), mirror({ smile: 0.6, rot: 8, x: 4 }, 180, 220), both({ smile: 0.55 }, 200, 600)] }),
  excited: B({ id: 'excited', core: 'pleasant-active', label: 'Excited', led: LED.warm, glow: 0.95, lift: 8, chirp: 'excited', overlay: 'spark', posture: { tilt: 0, y: -5, scale: 1.02, bounce: true },
    poses: [both({ sx: 1.08, sy: 1.12, y: -5 }, 140, 200), both({ sx: 1.08, sy: 1.0, y: 0 }, 140, 160), both({ sx: 1.08, sy: 1.12, y: -5 }, 140, 200), both({ sx: 1.05, sy: 1.05 }, 200, 500)] }),
  victorious: B({ id: 'victorious', core: 'pleasant-active', label: 'Victorious', led: LED.gold, glow: 1, lift: 18, chirp: 'fanfare', overlay: 'confetti', posture: { tilt: 0, y: -10, scale: 1.06, bounce: true },
    poses: [both({ smile: 0.6, sy: 0.85, y: -6 }, 180, 500), both({ smile: 0.7, sy: 0.8, y: -8, sx: 1.08 }, 220, 900), both({ smile: 0.5 }, 260, 400)] }),
  proud: B({ id: 'proud', core: 'pleasant-active', label: 'Proud', led: LED.gold, glow: 0.9, lift: 8, chirp: 'proud', overlay: 'stars', posture: { tilt: -3, y: -6, scale: 1.03 },
    poses: [both({ lid: 0.22, slant: -6, smile: 0.35, y: -3 }, 240, 1100), both({ smile: 0.3 }, 240, 300)] }),
  // ── Unpleasant active ──
  afraid: B({ id: 'afraid', core: 'unpleasant-active', label: 'Afraid', led: LED.violet, glow: 0.8, lift: -6, chirp: 'afraid', overlay: 'sweat', posture: { tilt: 0, y: 4, scale: 0.97, shake: true },
    poses: [mirror({ sx: 0.82, sy: 1.14, lid: 0.12, slant: -14, y: 4 }, 120, 260), mirror({ sx: 0.82, sy: 1.14, lid: 0.12, slant: -14, x: -3 }, 90, 120), mirror({ sx: 0.82, sy: 1.14, lid: 0.12, slant: -14, x: 3 }, 90, 120), mirror({ sx: 0.86, sy: 1.08, lid: 0.1, slant: -10 }, 200, 500)] }),
  angry: B({ id: 'angry', core: 'unpleasant-active', label: 'Angry (cute)', led: LED.hot, glow: 1, lift: 4, chirp: 'angry', overlay: 'vein', posture: { tilt: 0, y: 0, scale: 1.02, shake: true },
    poses: [mirror({ lid: 0.45, slant: 22, sy: 0.92 }, 120, 700), mirror({ lid: 0.5, slant: 26, sy: 0.88, sx: 1.06 }, 120, 500), mirror({ lid: 0.3, slant: 16 }, 240, 300)] }),
  disgusted: B({ id: 'disgusted', core: 'unpleasant-active', label: 'Disgusted', led: LED.amber, glow: 0.7, lift: -3, chirp: 'disgust', posture: { tilt: 4, y: 0, scale: 0.98 },
    poses: [pair({ lid: 0.5, slant: 6, smile: 0.3, x: 4 }, { lid: 0.25, slant: -4, sy: 0.85, x: 4 }, 200, 900), both({ lid: 0.15 }, 240, 300)] }),
  startled: B({ id: 'startled', core: 'unpleasant-active', label: 'Startled', led: LED.cool, glow: 1, lift: 6, chirp: 'startle', overlay: 'exclaim', posture: { tilt: 0, y: -10, scale: 1.05 },
    poses: [both({ sx: 1.25, sy: 1.25, y: -6 }, 70, 500), ...blink(60), both({ sx: 1.05, sy: 1.05 }, 260, 300)] }),
  // ── Active ──
  racing: B({ id: 'racing', core: 'active', label: 'Racing', led: LED.hot, glow: 0.9, lift: 6, chirp: 'hurry', posture: { tilt: 0, y: -3, scale: 1.01, shake: true },
    poses: [both({ x: -10, sy: 0.9 }, 90, 90), both({ x: 10, sy: 0.9 }, 90, 90), both({ x: -10, sy: 0.9 }, 90, 90), both({ x: 10, sy: 0.9 }, 90, 90), both({}, 160, 200)] }),
  spinning: B({ id: 'spinning', core: 'active', label: 'Thinking', led: LED.calm, glow: 0.8, lift: 0, chirp: 'whirr', posture: { tilt: 0, y: 0, scale: 1 },
    poses: [both({ x: 0, y: -10, sx: 0.8, sy: 0.8 }, 180, 60), both({ x: 10, y: 0, sx: 0.8, sy: 0.8 }, 180, 60), both({ x: 0, y: 10, sx: 0.8, sy: 0.8 }, 180, 60), both({ x: -10, y: 0, sx: 0.8, sy: 0.8 }, 180, 60), both({ x: 0, y: -10, sx: 0.8, sy: 0.8 }, 180, 60), both({}, 220, 100)] }),
  pacing: B({ id: 'pacing', core: 'active', label: 'Pacing', led: LED.amber, glow: 0.8, lift: 3, chirp: 'hmm', posture: { tilt: 2, y: 0, scale: 1 },
    poses: [both({ x: -12, lid: 0.15 }, 360, 300), both({ x: 12, lid: 0.15 }, 520, 300), both({ x: -12, lid: 0.15 }, 520, 300), both({ lid: 0.1 }, 300, 200)] }),
  curious: B({ id: 'curious', core: 'active', label: 'Curious', led: LED.calm, glow: 0.85, lift: 4, chirp: 'curious', overlay: 'question', posture: { tilt: 6, y: -2, scale: 1.01 },
    poses: [pair({ rot: 10, sx: 0.92, sy: 0.92, x: 6 }, { rot: 10, sx: 1.12, sy: 1.12, x: 6 }, 260, 1000), both({}, 260, 200)] }),
  // ── Pleasant inactive ──
  contemplating: B({ id: 'contemplating', core: 'pleasant-inactive', label: 'Contemplating', led: LED.dim, glow: 0.55, lift: 0, chirp: 'hmm', posture: { tilt: -4, y: 0, scale: 1 },
    poses: [both({ x: 8, y: -8, lid: 0.25, slant: -4 }, 600, 1400), both({ x: 6, y: -6, lid: 0.3 }, 500, 800), both({ lid: 0.15 }, 500, 200)] }),
  content: B({ id: 'content', core: 'pleasant-inactive', label: 'Content', led: LED.calm, glow: 0.5, lift: 2, chirp: 'content', posture: { tilt: 0, y: 0, scale: 1 },
    poses: [both({ lid: 0.3, smile: 0.25, sy: 0.92 }, 600, 1600), both({ lid: 0.2, smile: 0.15 }, 500, 200)] }),
  glad: B({ id: 'glad', core: 'pleasant-inactive', label: 'Glad', led: LED.joy, glow: 0.6, lift: 3, chirp: 'glad', posture: { tilt: 0, y: -2, scale: 1.01 },
    poses: [both({ smile: 0.35, lid: 0.12 }, 320, 1100), both({ smile: 0.15 }, 320, 200)] }),
  // ── Unpleasant inactive ──
  bored: B({ id: 'bored', core: 'unpleasant-inactive', label: 'Bored', led: LED.grey, glow: 0.35, lift: -2, chirp: 'sigh', posture: { tilt: -3, y: 3, scale: 0.99 },
    poses: [both({ lid: 0.5, y: 4, sx: 1.04 }, 700, 900), both({ lid: 0.5, x: -10, y: 4 }, 900, 700), both({ lid: 0.45, x: 6, y: 4 }, 900, 500), both({ lid: 0.4 }, 500, 200)] }),
  glaring: B({ id: 'glaring', core: 'unpleasant-inactive', label: 'Glaring', led: LED.blue, glow: 0.6, lift: -2, chirp: 'grumble', posture: { tilt: 0, y: 0, scale: 1 },
    poses: [both({ lid: 0.55, slant: 4, x: 14, sy: 0.9 }, 260, 1200), both({ lid: 0.5, x: 14 }, 200, 400), both({ lid: 0.2 }, 300, 200)] }),
  grumpy: B({ id: 'grumpy', core: 'unpleasant-inactive', label: 'Grumpy', led: LED.blue, glow: 0.55, lift: -3, chirp: 'grumble', posture: { tilt: 0, y: 2, scale: 0.99 },
    poses: [mirror({ lid: 0.42, slant: 16, y: 3 }, 260, 1100), mirror({ lid: 0.4, slant: 14, x: -5 }, 300, 400), mirror({ lid: 0.25, slant: 8 }, 300, 200)] }),
  sad: B({ id: 'sad', core: 'unpleasant-inactive', label: 'Sad', led: LED.blue, glow: 0.4, lift: -8, chirp: 'sad', overlay: 'tear', posture: { tilt: 0, y: 6, scale: 0.97 },
    poses: [mirror({ lid: 0.35, slant: -18, y: 6, sy: 0.9 }, 600, 1500), mirror({ lid: 0.3, slant: -14, y: 5 }, 600, 300)] }),
  // ── Inactive ──
  blinking: B({ id: 'blinking', core: 'inactive', label: 'Blinking', led: LED.calm, glow: 0.45, lift: 0, chirp: 'blink', posture: { tilt: 0, y: 0, scale: 1 },
    poses: [...blink(), both({}, 120, 260), ...blink(60)] }),
  looking: B({ id: 'looking', core: 'inactive', label: 'Looking around', led: LED.calm, glow: 0.45, lift: 0, chirp: 'peek', posture: { tilt: 0, y: 0, scale: 1 },
    poses: [both({ x: -14, y: -2 }, 260, 700), both({ x: 14, y: 2 }, 340, 700), both({}, 280, 200)] }),
  sleepy: B({ id: 'sleepy', core: 'inactive', label: 'Sleepy', led: LED.dim, glow: 0.3, lift: -4, chirp: 'yawn', overlay: 'zzz', posture: { tilt: -5, y: 6, scale: 0.98 },
    poses: [both({ lid: 0.65, y: 4 }, 800, 900), both({ lid: 0.85, y: 6 }, 900, 700), both({ lid: 0.5, y: 3 }, 300, 400), both({ lid: 0.6, y: 4 }, 700, 300)] }),
  sleeping: B({ id: 'sleeping', core: 'inactive', label: 'Sleeping', led: LED.dim, glow: 0.18, lift: -6, chirp: 'snore', overlay: 'zzz', posture: { tilt: -6, y: 8, scale: 0.97 },
    // Closed: two thin, dim lines, low and still.
    poses: [both({ lid: 0.3, sy: 0.24, y: 10 }, 900, 400), both({ sy: 0.1, y: 12, sx: 1.04 }, 1100, 2000)] }),
  // ── Pleasant ──
  delighted: B({ id: 'delighted', core: 'pleasant', label: 'Delighted', led: LED.joy, glow: 0.85, lift: 6, chirp: 'delight', overlay: 'spark', posture: { tilt: 0, y: -4, scale: 1.02, bounce: true },
    poses: [both({ smile: 0.6, sy: 0.9 }, 180, 900), both({ smile: 0.45 }, 260, 300)] }),
  happy: B({ id: 'happy', core: 'pleasant', label: 'Happy', led: LED.joy, glow: 0.75, lift: 5, chirp: 'happy', posture: { tilt: 0, y: -3, scale: 1.01 },
    poses: [both({ smile: 0.48 }, 220, 1100), both({ smile: 0.3 }, 260, 200)] }),
  pleased: B({ id: 'pleased', core: 'pleasant', label: 'Pleased', led: LED.joy, glow: 0.6, lift: 3, chirp: 'pleased', posture: { tilt: 2, y: -1, scale: 1 },
    poses: [both({ smile: 0.32, lid: 0.08 }, 240, 900), both({ smile: 0.15 }, 260, 200)] }),
  loving: B({ id: 'loving', core: 'pleasant', label: 'Loving', led: LED.love, glow: 0.9, lift: 6, chirp: 'love', overlay: 'hearts', posture: { tilt: 4, y: -3, scale: 1.02 },
    poses: [both({ smile: 0.5, sx: 1.05, sy: 0.92, rot: 4 }, 260, 1300), both({ smile: 0.3 }, 280, 200)] }),
  // ── Unpleasant ──
  confused: B({ id: 'confused', core: 'unpleasant', label: 'Confused', led: LED.violet, glow: 0.6, lift: 0, chirp: 'confused', overlay: 'question', posture: { tilt: 8, y: 0, scale: 1 },
    poses: [pair({ sy: 1.12, y: -4, rot: 6 }, { sy: 0.7, lid: 0.3, slant: 10, rot: 6 }, 240, 900), pair({ sy: 0.7, lid: 0.3, slant: -10, rot: -6 }, { sy: 1.12, y: -4, rot: -6 }, 260, 700), both({}, 260, 200)] }),
  disappointed: B({ id: 'disappointed', core: 'unpleasant', label: 'Disappointed', led: LED.blue, glow: 0.5, lift: -5, chirp: 'aww', posture: { tilt: 0, y: 4, scale: 0.98 },
    poses: [mirror({ lid: 0.3, slant: -10, y: 6, x: 0 }, 500, 1100), mirror({ lid: 0.25, slant: -8, y: 4 }, 400, 200)] }),
  frustrated: B({ id: 'frustrated', core: 'unpleasant', label: 'Frustrated', led: LED.amber, glow: 0.7, lift: -2, chirp: 'frustrated', overlay: 'sweat', posture: { tilt: 0, y: 2, scale: 0.99, shake: true },
    poses: [mirror({ lid: 0.4, slant: 12, sy: 0.85 }, 160, 400), mirror({ lid: 0.55, slant: 8, sy: 0.75, x: -3 }, 140, 300), mirror({ lid: 0.3, slant: 10 }, 260, 300)] }),
  miserable: B({ id: 'miserable', core: 'unpleasant', label: 'Miserable', led: LED.blue, glow: 0.35, lift: -10, chirp: 'whimper', overlay: 'tear', posture: { tilt: 0, y: 8, scale: 0.96 },
    poses: [mirror({ lid: 0.45, slant: -22, y: 8, sy: 0.85, sx: 0.92 }, 700, 1700), mirror({ lid: 0.4, slant: -18, y: 6 }, 600, 300)] }),
};

export const BEHAVIOR_IDS = Object.keys(BEHAVIORS) as BehaviorId[];

// ── Tricks: what a pet does (petting, tickles, a sneeze…), on top of the 32 feelings ──

export type TrickId = 'purring' | 'giggling' | 'squished' | 'hiccup' | 'sneeze' | 'stretching' | 'daydreaming' | 'dancing' | 'welcome' | 'peekaboo' | 'waking';
export type ActId = BehaviorId | TrickId;

export const TRICKS: Record<TrickId, Behavior> = {
  purring: B({ id: 'purring', core: 'pleasant-inactive', label: 'Purring', led: LED.love, glow: 0.8, lift: 4, chirp: 'purr', overlay: 'hearts', posture: { tilt: 0, y: -2, scale: 1.02 },
    poses: [both({ smile: 0.55, lid: 0.2, sy: 0.92 }, 260, 400), mirror({ smile: 0.6, lid: 0.26, rot: -5, x: -2 }, 520, 420), mirror({ smile: 0.6, lid: 0.26, rot: 5, x: 2 }, 520, 420), both({ smile: 0.55, lid: 0.2 }, 420, 600)] }),
  giggling: B({ id: 'giggling', core: 'pleasant-active', label: 'Giggling', led: LED.joy, glow: 1, lift: 6, chirp: 'giggle', overlay: 'spark', posture: { tilt: 0, y: -3, scale: 1.02, bounce: true },
    poses: [both({ smile: 0.66, sy: 0.82 }, 90, 80), both({ smile: 0.66, sy: 0.76, y: -4 }, 80, 70), both({ smile: 0.66, sy: 0.82 }, 80, 70), both({ smile: 0.66, sy: 0.76, y: -4 }, 80, 70), both({ smile: 0.6, sy: 0.84 }, 90, 260), both({ smile: 0.35 }, 220, 200)] }),
  squished: B({ id: 'squished', core: 'unpleasant-active', label: 'Squished', led: LED.cool, glow: 0.9, lift: -4, chirp: 'squeak', posture: { tilt: 0, y: 4, scale: 0.94 },
    // Squeezed tight (two slanted slits, "\ /"), then a boing back open.
    poses: [pair({ sx: 1.12, sy: 0.26, rot: 18, y: 3 }, { sx: 1.12, sy: 0.26, rot: -18, y: 3 }, 70, 560), both({ sx: 0.86, sy: 1.3, y: -5 }, 110, 120), both({ sx: 1.05, sy: 0.95 }, 140, 80), both({}, 200, 100)] }),
  hiccup: B({ id: 'hiccup', core: 'active', label: 'Hiccup', led: LED.cool, glow: 0.8, lift: 3, chirp: 'hiccup', posture: { tilt: 0, y: -5, scale: 1.02, bounce: true },
    poses: [both({}, 80, 300), both({ y: -9, sy: 1.16, sx: 0.94 }, 55, 70), both({ y: 1, sy: 0.92 }, 120, 60), both({}, 160, 300), both({ x: -6 }, 200, 200), both({}, 200, 100)] }),
  sneeze: B({ id: 'sneeze', core: 'active', label: 'Sneeze', led: LED.warm, glow: 0.9, lift: 6, chirp: 'sneeze', overlay: 'sweat', posture: { tilt: 0, y: 0, scale: 1, shake: true },
    poses: [both({ lid: 0.3, y: -3 }, 220, 160), both({ lid: 0.5, y: -5, sy: 1.04 }, 240, 160), both({ lid: 0.62, y: -7, sy: 1.08 }, 200, 120), both({ sy: 0.14, y: 6, sx: 1.12 }, 60, 260), ...blink(80), both({}, 200, 100)] }),
  stretching: B({ id: 'stretching', core: 'active', label: 'Stretching', led: LED.calm, glow: 0.8, lift: 8, chirp: 'stretch', posture: { tilt: -6, y: -6, scale: 1.04 },
    poses: [both({ y: -10, lid: 0.15 }, 360, 300), both({ y: -10, rot: -9, x: -6, lid: 0.3 }, 520, 380), both({ y: -10, rot: 9, x: 6, lid: 0.3 }, 620, 380), both({ smile: 0.35, lid: 0.35 }, 380, 400), both({}, 300, 100)] }),
  daydreaming: B({ id: 'daydreaming', core: 'pleasant-inactive', label: 'Daydreaming', led: LED.violet, glow: 0.6, lift: 2, chirp: 'hum', overlay: 'stars', posture: { tilt: -4, y: -2, scale: 1 },
    poses: [both({ x: 10, y: -9, lid: 0.2, sx: 0.95 }, 900, 1800), both({ x: 12, y: -10, lid: 0.25, smile: 0.2 }, 600, 900), ...blink(), both({}, 500, 100)] }),
  dancing: B({ id: 'dancing', core: 'pleasant-active', label: 'Dancing', led: LED.gold, glow: 1, lift: 14, chirp: 'dance', overlay: 'confetti', posture: { tilt: 0, y: -6, scale: 1.04, bounce: true },
    poses: [mirror({ smile: 0.5, rot: -10, x: -6, y: -3 }, 150, 110), mirror({ smile: 0.5, rot: 10, x: 6, y: 2 }, 150, 110), mirror({ smile: 0.5, rot: -10, x: -6, y: -3 }, 150, 110), mirror({ smile: 0.5, rot: 10, x: 6, y: 2 }, 150, 110), both({ smile: 0.6, sy: 0.85, y: -6 }, 160, 400), both({ smile: 0.4 }, 240, 200)] }),
  welcome: B({ id: 'welcome', core: 'pleasant-active', label: 'Welcome back', led: LED.joy, glow: 1, lift: 8, chirp: 'welcome', overlay: 'spark', posture: { tilt: 0, y: -6, scale: 1.03, bounce: true },
    poses: [both({ sx: 1.16, sy: 1.2, y: -4 }, 110, 380), both({ smile: 0.58, sy: 0.88 }, 180, 700), both({ smile: 0.3 }, 260, 200)] }),
  peekaboo: B({ id: 'peekaboo', core: 'pleasant-active', label: 'Peekaboo', led: LED.warm, glow: 0.9, lift: 6, chirp: 'peekaboo', posture: { tilt: 0, y: -4, scale: 1.03 },
    poses: [both({ lid: 0.96 }, 120, 700), both({ sx: 1.22, sy: 1.26, y: -4 }, 90, 380), both({ smile: 0.6, sy: 0.88 }, 180, 600), both({}, 240, 100)] }),
  waking: B({ id: 'waking', core: 'inactive', label: 'Waking up', led: LED.dim, glow: 0.45, lift: 0, chirp: 'yawn', posture: { tilt: -3, y: 3, scale: 0.99 },
    poses: [both({ lid: 0.85, y: 6 }, 300, 400), both({ lid: 0.55, y: 4 }, 500, 300), ...blink(110), both({ lid: 0.6, y: 3 }, 300, 260), ...blink(90), both({}, 300, 100)] }),
};

export const TRICK_IDS = Object.keys(TRICKS) as TrickId[];

/** Every performance, feelings and tricks. */
export const ACTS: Record<ActId, Behavior> = { ...BEHAVIORS, ...TRICKS };

export const BY_CORE: Record<CoreState, BehaviorId[]> = BEHAVIOR_IDS.reduce(
  (m, id) => {
    (m[BEHAVIORS[id].core] ??= []).push(id);
    return m;
  },
  {} as Record<CoreState, BehaviorId[]>,
);

/** Total time a behaviour takes to play (ms). */
export function lengthOf(b: Behavior): number {
  return b.poses.reduce((s, p) => s + p.ms + p.hold, 0);
}
