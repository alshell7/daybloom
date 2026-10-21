// Every app theme and dial finish, old and new, must stay readable: WCAG contrast for text and
// marks, and OKLab distance (also under simulated protanopia, deuteranopia and tritanopia) for
// colours that only need to stand apart. `PALETTE_REPORT=1 npx vitest run palettes` prints the numbers.

import { describe, expect, it } from 'vitest';
import { screenPalette } from './addons/alef/palette';
import { CATEGORIES, contrast, luminance, mix } from './engine/categories';
import { FINISH_ORDER, FINISHES, finishesOf, type Finish } from './presets';
import { THEME_BY_ID, THEMES, themeCss } from './themes';

// --- colour science -------------------------------------------------------

type M3 = number[][];
/** Machado et al. (2009), severity 1, applied in linear RGB. */
const VISION: Record<string, M3 | null> = {
  normal: null,
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function oklab(hex: string, m: M3 | null): number[] {
  const n = parseInt(hex.slice(1, 7), 16);
  let c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  if (m) c = m.map((r) => Math.min(1, Math.max(0, r[0] * c[0] + r[1] * c[1] + r[2] * c[2])));
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const md = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  return [0.2104542553 * l + 0.793617785 * md - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * md + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * md - 0.808675766 * s];
}
/** OKLab distance (a just-noticeable difference is about 0.02). */
function dE(a: string, b: string, m: M3 | null = null) {
  const p = oklab(a, m);
  const q = oklab(b, m);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
/** The smallest distance across normal vision and the three simulated colour-vision types. */
const seen = (a: string, b: string) => Math.min(...Object.values(VISION).map((m) => dE(a, b, m)));
/** `fg` at `alpha` over an opaque `bg`. */
const over = (fg: string, bg: string, alpha: number) => mix(bg, fg, alpha);
const catsFor = (dark: boolean) => CATEGORIES.map((c) => (dark ? c.dark : c.light));
const min = (xs: number[]) => Math.min(...xs);

// --- thresholds -----------------------------------------------------------

/** WCAG AA body text. */
const TEXT = 4.5;
/** WCAG AA large text and non-text marks (hands, rings, focus). */
const MARK = 3;
/** Colours that only need to read as different things: about four just-noticeable differences. */
const APART = 0.08;

/**
 * Light ink at 72% on a done arc of a dark finish lands at 2.1–2.9:1 on every dark finish, old
 * and new, because DialArc fades the fill only 42% into the face. A floor, not a target.
 */
const DONE_DARK = 2;

const FINISH_LIST = Object.values(FINISHES);

// --- report ---------------------------------------------------------------

if (process.env.PALETTE_REPORT) {
  const f2 = (x: number) => x.toFixed(2);
  const f3 = (x: number) => x.toFixed(3);
  console.table(
    FINISH_LIST.map((f) => {
      const cats = catsFor(f.dark);
      return {
        finish: f.id,
        ink: f2(contrast(f.ink, f.face)),
        sub: f2(contrast(over(f.ink, f.face, 0.66), f.face)),
        track: f2(contrast(f.track, f.face)),
        handFace: f2(contrast(f.signal, f.face)),
        handBezel: f2(contrast(f.signal, f.bezel)),
        handLume: f3(seen(f.signal, f.lume)),
        catBezel: f3(min(cats.map((c) => seen(c, f.bezel)))),
        ring: f3(min(cats.map((c) => seen(over(c, f.face, f.dark ? 0.85 : 0.78), f.face)))),
        lumeRim: f3(seen(f.lume, f.bezel)),
        doneLabel: f2(min(cats.map((c) => { const d = mix(c, f.face, f.dark ? 0.42 : 0.5); return contrast(over(f.ink, d, 0.72), d); }))),
        alefEye: f2(contrast(screenPalette(f, 'dial', 'dial').eye, screenPalette(f, 'dial', 'dial').well)),
      };
    }),
  );
  console.table(
    THEMES.map((t) => {
      const v = t.vars;
      const desk = [v.ground, v.surface, v.raised, v.sunken];
      return {
        theme: t.id,
        ink: f2(min(desk.map((b) => contrast(v.ink, b)))),
        ink2: f2(min(desk.map((b) => contrast(v.ink2, b)))),
        ink3: f2(min(desk.map((b) => contrast(v.ink3, b)))),
        signal: f2(min([v.surface, v.raised].map((b) => contrast(v.signal, b)))),
        focus: f2(min([v.ground, v.surface, v.raised].map((b) => contrast(v.focus, b)))),
        lume: f2(min([v.surface, v.raised].map((b) => contrast(v.lume, b)))),
        nowDone: f3(seen(v.signal, v.lume)),
        capsule: f3(min(catsFor(FINISHES[t.finish].dark).map((c) => seen(c, v.surface)))),
      };
    }),
  );
}

// --- the tests ------------------------------------------------------------

describe('theme and finish tables', () => {
  it('has unique ids and names, and every theme is in the CSS', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(THEMES.length);
    expect(new Set(FINISH_LIST.map((f) => f.name)).size).toBe(FINISH_LIST.length);
    for (const [id, f] of Object.entries(FINISHES)) expect(f.id).toBe(id);
    const css = themeCss();
    for (const t of THEMES) {
      expect(THEME_BY_ID[t.id]).toBe(t);
      expect(css).toContain(`[data-palette='${t.id}']`);
    }
  });

  it('lists every finish once in picker order, light before dark', () => {
    expect([...FINISH_ORDER].sort()).toEqual(Object.keys(FINISHES).sort());
    expect([...finishesOf(false), ...finishesOf(true)].map((f) => f.id)).toEqual(FINISH_ORDER);
  });

  it('pairs every theme with a finish of its own mode, so the rail and the dial use one category set', () => {
    for (const t of THEMES) {
      expect(FINISHES[t.finish], t.id).toBeDefined();
      expect(FINISHES[t.finish].dark, t.id).toBe(t.mode === 'dark');
    }
  });

  it('offers a real choice in both modes', () => {
    expect(THEMES.filter((t) => t.mode === 'light').length).toBeGreaterThanOrEqual(8);
    expect(THEMES.filter((t) => t.mode === 'dark').length).toBeGreaterThanOrEqual(8);
    expect(FINISH_LIST.filter((f) => !f.dark).length).toBeGreaterThanOrEqual(8);
    expect(FINISH_LIST.filter((f) => f.dark).length).toBeGreaterThanOrEqual(8);
  });

  it('every token is a #rrggbb colour (the helpers parse only that)', () => {
    const hex = /^#[0-9a-f]{6}$/i;
    for (const t of THEMES) for (const [k, v] of Object.entries(t.vars)) if (!k.startsWith('line')) expect(v, `${t.id}.${k}`).toMatch(hex);
    for (const f of FINISH_LIST) for (const k of ['face', 'bezel', 'ink', 'track', 'signal', 'lume', 'rim'] as const) expect(f[k], `${f.id}.${k}`).toMatch(hex);
  });
});

describe.each(THEMES)('theme $name', (t) => {
  const v = t.vars;
  const desk = { ground: v.ground, surface: v.surface, raised: v.raised, sunken: v.sunken };

  it('text reads on every desk tone', () => {
    for (const [name, bg] of Object.entries(desk)) {
      expect(contrast(v.ink, bg), `ink on ${name}`).toBeGreaterThanOrEqual(7);
      expect(contrast(v.ink2, bg), `ink-2 on ${name}`).toBeGreaterThanOrEqual(TEXT);
      expect(contrast(v.ink3, bg), `ink-3 on ${name}`).toBeGreaterThanOrEqual(TEXT);
    }
  });

  it('now, focus and done read on the desk, and now is never mistaken for done', () => {
    for (const bg of [v.surface, v.raised]) {
      expect(contrast(v.signal, bg), 'signal').toBeGreaterThanOrEqual(MARK);
      expect(contrast(v.focus, bg), 'focus ring').toBeGreaterThanOrEqual(MARK);
      // The lume ring on a done capsule always comes with a check and a strike-through.
      expect(contrast(v.lume, bg), 'lume').toBeGreaterThanOrEqual(2.5);
    }
    expect(contrast(v.focus, v.ground), 'focus ring on ground').toBeGreaterThanOrEqual(MARK);
    expect(seen(v.signal, v.lume), 'signal vs lume').toBeGreaterThanOrEqual(APART);
  });

  it('desk tones step up in order: ground, surface, raised; sunken stays its own tone', () => {
    expect(luminance(v.surface)).toBeGreaterThanOrEqual(luminance(v.ground));
    expect(luminance(v.raised)).toBeGreaterThanOrEqual(luminance(v.surface));
    expect(dE(v.sunken, v.surface)).toBeGreaterThanOrEqual(0.015);
    expect(dE(v.raised, v.ground)).toBeGreaterThanOrEqual(0.015);
  });

  it('category capsules stand out on the rail', () => {
    for (const c of catsFor(FINISHES[t.finish].dark)) {
      expect(seen(c, v.surface), c).toBeGreaterThanOrEqual(APART);
      expect(seen(c, v.raised), c).toBeGreaterThanOrEqual(APART);
    }
  });
});

describe.each(FINISH_LIST)('finish $name', (f: Finish) => {
  const cats = catsFor(f.dark);

  it('numerals and the readout read on the face', () => {
    expect(contrast(f.ink, f.face), 'ink').toBeGreaterThanOrEqual(7);
    // The readout's quietest line is ink at 66%; the big number at 86% on free time.
    expect(contrast(over(f.ink, f.face, 0.66), f.face), 'sub line').toBeGreaterThanOrEqual(TEXT);
    expect(contrast(over(f.ink, f.face, 0.86), f.face), 'big numerals').toBeGreaterThanOrEqual(MARK);
  });

  it('the minute track is visible but quieter than the numerals', () => {
    expect(contrast(f.track, f.face)).toBeGreaterThanOrEqual(2.5);
    expect(contrast(f.track, f.face)).toBeLessThan(contrast(f.ink, f.face));
  });

  it('the now hand reads on the face and the bezel, apart from ink and lume', () => {
    expect(contrast(f.signal, f.face), 'on face').toBeGreaterThanOrEqual(MARK);
    expect(contrast(f.signal, f.bezel), 'on bezel').toBeGreaterThanOrEqual(2.5);
    expect(seen(f.signal, f.ink), 'vs ink').toBeGreaterThanOrEqual(APART);
    expect(seen(f.signal, f.lume), 'vs lume').toBeGreaterThanOrEqual(APART);
  });

  it('block arcs, the time-left ring and done rims stand apart from the dial', () => {
    for (const c of cats) {
      expect(seen(c, f.bezel), `${c} on bezel`).toBeGreaterThanOrEqual(APART);
      expect(seen(over(c, f.face, f.dark ? 0.85 : 0.78), f.face), `${c} ring on face`).toBeGreaterThanOrEqual(APART);
      // A done arc's label: finish ink at 72% over the fill faded into the face. On dark faces the
      // faded fill stays bright, so how DialArc mixes it (not the finish) decides; see DONE_DARK.
      const done = mix(c, f.face, f.dark ? 0.42 : 0.5);
      expect(contrast(over(f.ink, done, 0.72), done), `${c} done label`).toBeGreaterThanOrEqual(f.dark ? DONE_DARK : MARK);
    }
    expect(seen(f.lume, f.bezel), 'lume rim').toBeGreaterThanOrEqual(0.15);
    expect(dE(f.face, f.bezel), 'bezel ring').toBeGreaterThanOrEqual(0.03);
  });

  it("gives Alef's screen readable text and eyes", () => {
    const sp = screenPalette(f, 'dial', 'dial');
    expect(contrast(sp.ink, sp.well), 'text').toBeGreaterThanOrEqual(TEXT);
    expect(contrast(sp.eye, sp.well), 'eyes').toBeGreaterThanOrEqual(MARK);
  });
});

describe('category palette', () => {
  // Colour is never the only signal (every block has an icon and a label); this guards the
  // spacing the palette has. The tightest pair is Focus/Rest under protanopia.
  it.each([['light'], ['dark']] as const)('keeps the %s set apart', (set) => {
    const cs = CATEGORIES.map((c) => c[set]);
    for (const [vision, m] of Object.entries(VISION))
      for (let i = 0; i < cs.length; i++)
        for (let j = i + 1; j < cs.length; j++) {
          const d = dE(cs[i], cs[j], m);
          const floor = vision === 'normal' ? APART : vision === 'tritan' ? 0.015 : 0.025;
          expect(d, `${CATEGORIES[i].id}/${CATEGORIES[j].id} ${vision}`).toBeGreaterThanOrEqual(floor);
        }
  });
});
