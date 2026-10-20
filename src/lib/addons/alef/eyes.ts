// Alef's eyes, the way a character animator would build them: each eye is a few numbers
// (where it is, its size, corner roundness, an upper lid with a slant and a curve, a lower lid
// that curves up into a happy crescent). Every number moves on its own spring, so motion
// overshoots a touch and settles, the eyes squash when they move fast, the eye on the side
// you look toward grows (perspective), and the right eye follows the left a beat later.
// Drawn on a canvas only while something moves; at rest nothing runs. Pure (no DOM state).

import type { Eye } from './behaviors';

/** One eye, in face units (the eyes area is 200 × 110; eyes rest at x = ±36 from centre). */
export interface EyeP {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  /** Corner radius, as a fraction of the smaller side. */
  r: number;
  /** Upper lid: how far it covers (0..1), its slant (deg; + = inner corner down), its curve (+ droops). */
  upY: number;
  upA: number;
  upB: number;
  /** Lower lid: how far it rises (0..1) and its curve (1 = a round crescent). */
  loY: number;
  loB: number;
}

export const KEYS: (keyof EyeP)[] = ['x', 'y', 'w', 'h', 'rot', 'r', 'upY', 'upA', 'upB', 'loY', 'loB'];

export const EYE_W = 50;
export const EYE_H = 56;
export const EYE_GAP = 36;

/** A behaviour's pose (behaviors.ts) as eye parameters. `side` −1 left, +1 right. */
export function eyeOf(e: Eye, side: -1 | 1): EyeP {
  const sad = e.slant < 0 ? Math.min(1, -e.slant / 20) : 0;
  return {
    x: side * EYE_GAP + e.x,
    y: e.y,
    w: EYE_W * e.sx,
    h: EYE_H * e.sy,
    rot: e.rot,
    r: 0.3,
    upY: e.lid,
    upA: e.slant,
    // A sad brow droops in a soft curve; a cross one stays straight and sharp.
    upB: e.lid > 0 ? 0.12 + sad * 0.3 : 0,
    loY: Math.min(0.9, e.smile * 1.05),
    loB: e.smile > 0 ? 1 : 0,
  };
}

/** Where you look (gx, gy in −1..1): both eyes move, the near one grows, the far one shrinks. */
export function withGaze(p: EyeP, side: -1 | 1, gx: number, gy: number): EyeP {
  const near = 1 + side * gx * 0.11;
  return {
    ...p,
    x: p.x + gx * 15 - side * Math.abs(gx) * 2.5,
    y: p.y + gy * 10,
    w: p.w * near,
    h: p.h * near * (1 - Math.abs(gy) * 0.06),
  };
}

// ── Springs ─────────────────────────────────────────────────────────────────

export interface Spring {
  v: number;
  vel: number;
  to: number;
  /** Angular frequency (rad/s) and damping ratio. */
  w: number;
  z: number;
}

/** Spring settings for a move meant to take about `ms`; quick moves overshoot a little. */
export function tuning(ms: number): { w: number; z: number } {
  const t = Math.max(0.04, ms / 1000);
  const z = ms <= 160 ? 0.5 : ms <= 300 ? 0.62 : 0.78;
  return { w: 4.6 / (z * t * 1.25), z };
}

/** Advance a spring by dt seconds (semi-implicit Euler, sub-stepped for stiff springs). */
export function step(s: Spring, dt: number): void {
  const n = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = -s.w * s.w * (s.v - s.to) - 2 * s.z * s.w * s.vel;
    s.vel += a * h;
    s.v += s.vel * h;
  }
}

export const settled = (s: Spring, eps = 0.01) => Math.abs(s.v - s.to) < eps && Math.abs(s.vel) < eps * 10;

// ── Drawing ─────────────────────────────────────────────────────────────────

/** Squash and stretch from vertical speed: fast up or down, the eye gets taller and thinner. */
export function stretchOf(velY: number): number {
  return Math.max(-0.16, Math.min(0.16, Math.abs(velY) * 0.0016));
}

function lidPath(ctx: CanvasRenderingContext2D, p: EyeP, upper: boolean) {
  const big = Math.max(p.w, p.h) * 1.6;
  if (upper) {
    // The lid's edge: a line across the eye at `upY`, slanted, with a soft curve inside the eye.
    const yl = -p.h / 2 + p.upY * p.h;
    ctx.save();
    ctx.translate(0, yl);
    ctx.rotate((p.upA * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(-big, 0);
    ctx.lineTo(-p.w * 0.62, 0);
    ctx.quadraticCurveTo(0, p.upB * p.h * 0.6, p.w * 0.62, 0);
    ctx.lineTo(big, 0);
    ctx.lineTo(big, -big * 2);
    ctx.lineTo(-big, -big * 2);
    ctx.closePath();
    ctx.restore();
  } else {
    // The lower lid rises as a round cheek (an ellipse the eye's width), cutting a "∩" arch.
    const yl = p.h / 2 - p.loY * p.h;
    const ry = Math.max(0.001, p.loB * p.h * 0.55);
    const rx = p.loB > 0 ? p.w * 0.6 : big;
    ctx.beginPath();
    ctx.ellipse(0, yl + ry, rx, ry, 0, 0, Math.PI * 2);
    ctx.rect(-big, yl + ry, big * 2, big * 2);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Draw both eyes. `scale` maps face units to canvas pixels; the eyes area is centred. The
 * lids are cut out of each eye (so the glow follows the shape you see), then the eye is laid
 * down twice: a soft bloom, then crisp.
 */
export function drawEyes(ctx: CanvasRenderingContext2D, eyes: [EyeP, EyeP], o: { scale: number; color: string; glow: number; scratch: HTMLCanvasElement | OffscreenCanvas; shadow?: string | null }) {
  const { scale, color } = o;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  const sc = o.scratch;
  if (sc.width !== W || sc.height !== H) {
    sc.width = W;
    sc.height = H;
  }
  const s = sc.getContext('2d') as CanvasRenderingContext2D | null;
  if (!s) return;
  s.clearRect(0, 0, W, H);
  for (const p of eyes) {
    if (p.h < 0.4 || p.w < 0.4) continue;
    s.save();
    s.translate(W / 2 + p.x * scale, H / 2 + p.y * scale);
    s.rotate((p.rot * Math.PI) / 180);
    s.scale(scale, scale);
    s.globalCompositeOperation = 'source-over';
    s.fillStyle = color;
    roundRect(s, -p.w / 2, -p.h / 2, p.w, p.h, Math.min(p.w, p.h) * p.r);
    s.fill();
    s.globalCompositeOperation = 'destination-out';
    s.fillStyle = '#000';
    if (p.upY > 0.001) {
      lidPath(s, p, true);
      s.fill();
    }
    if (p.loY > 0.001) {
      lidPath(s, p, false);
      s.fill();
    }
    s.restore();
  }
  // Glowing eyes bloom; inked eyes (on a light screen) sit on a soft shadow instead.
  if (o.glow > 0.01) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, o.glow));
    ctx.shadowColor = color;
    ctx.shadowBlur = 9 * scale;
    ctx.drawImage(sc as CanvasImageSource, 0, 0);
    ctx.restore();
  } else if (o.shadow) {
    ctx.save();
    ctx.shadowColor = o.shadow;
    ctx.shadowBlur = 4 * scale;
    ctx.shadowOffsetY = 1.6 * scale;
    ctx.drawImage(sc as CanvasImageSource, 0, 0);
    ctx.restore();
  }
  ctx.drawImage(sc as CanvasImageSource, 0, 0);
}
