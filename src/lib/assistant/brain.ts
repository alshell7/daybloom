// The assistant's brain: text → one validated tool call → a result card.
//
// Routing, cheapest and surest first:
// 1. Triggers. Regexes on each tool (the same ones Needle gets natively) catch unambiguous
//    phrasings instantly, with or without the model. Precedence is catalogue order; a few
//    triggers carry guards ("I'm in Tokyo" only routes if Tokyo resolves to a zone).
// 2. Needle. When the model is on this device, it picks a tool and arguments (~0.4 s).
//    Calls at confidence ≥ 0.25 are taken.
// 3. Embeddings. Empty or low-confidence calls fall back to the nearest tool by Needle
//    embeddings (example phrasings per tool, z-scored so the model's cosine scale doesn't
//    matter). Two weak signals that agree (Needle's low call, nearest tool, keywords) are enough.
// 4. Keywords. Without the model, a small keyword/example scorer.
// Anything still unsure becomes a "Did you mean…" card instead of an action.
//
// A few refinements fix known confusions whatever the source (a clock time means
// create_block, not start_timer; "free" means find_free_time, not plan_my_day).
//
// Arguments are then normalised with the app's own quick-add parser (parseQuick): times,
// days, durations and repeats are read from what the user actually said, and the model's
// arguments only fill what the words didn't say.

import { parseCaptureLine } from '../backlog';
import { blocksInRange } from '../engine/blocks';
import { addDays, isoOf, minutesOfDay, startOfDayMs } from '../engine/time';
import type { ISODate, Recurrence } from '../engine/types';
import type { PresetId } from '../presets';
import { parseQuick } from '../quickadd';
import { clock } from '../stores/clock.svelte';
import { taskFile } from '../stores/tasks.svelte';
import { THEMES } from '../themes';
import { cosine, embedText, fuzzyScore, stem, tokens, type Embedder } from './match';
import { resolveZone, runTool, toolByName, TOOLS, type Args, type Call, type Ctx, type Option, type ToolResult } from './tools';
import type { NeedleEngine, NeedleResult, ToolSchema } from './types';

/** Below this, a call is a guess: offer choices instead of acting. */
export const LOW_CONFIDENCE = 0.25;

export type Source = 'trigger' | 'needle' | 'embed' | 'keywords' | 'none';

export interface Route {
  /** The call to make, or null when unsure. */
  call: Call | null;
  confidence: number;
  source: Source;
  /** Candidate tools when unsure. */
  options: Call[];
  ms: number;
  raw?: unknown;
}

export interface Reply {
  route: Route;
  result: ToolResult;
}

const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const nowMinutes = (now: number) => Math.floor(minutesOfDay(now));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Cleaning the input ────────────────────────────────────────────────────────

const NUMW: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, ninety: 90,
};
const NUM_WORD = Object.keys(NUMW).join('|');
const NUM_COMPOUND = new RegExp(String.raw`\b(twenty|thirty|forty|fifty)[- ](one|two|three|four|five|six|seven|eight|nine)\b`, 'gi');
const NUM_BEFORE_UNIT = new RegExp(
  String.raw`\b(${NUM_WORD})\b(?=\s*-?\s*(?:more\s+)?(?:m|min|mins|minutes?|h|hrs?|hours?|am|pm|a\.m\.|p\.m\.|o'?clock|rounds?|cycles?|pomodoros?|sprints?)\b)`,
  'gi',
);
const NUM_AFTER_PREP = new RegExp(String.raw`\b(at|until|till|by|around|from)\s+(${NUM_WORD})\b`, 'gi');

/** "twenty five minutes" → "25 minutes", "at four o'clock" → "at 4", "a few more minutes" → "10 more minutes". */
export function digits(s: string): string {
  return s
    .replace(/\b(?:at\s+)?(?:around|about|roughly|circa)\s+(?=(?:\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?!\s*(?:m|min|mins|minutes?|h|hrs?|hours?)\b))/gi, 'at ')
    .replace(NUM_COMPOUND, (_m, a: string, b: string) => String(NUMW[a.toLowerCase()] + NUMW[b.toLowerCase()]))
    .replace(/\ba few\b(?=\s+(?:more\s+)?(?:m|min|mins|minutes)\b)/gi, '10')
    .replace(/\ba couple(?: of)?\b(?=\s+(?:more\s+)?(?:m|min|mins|minutes|hours?)\b)/gi, '2')
    .replace(NUM_BEFORE_UNIT, (m) => String(NUMW[m.toLowerCase()]))
    .replace(NUM_AFTER_PREP, (_m, p: string, w: string) => `${p} ${NUMW[w.toLowerCase()]}`)
    .replace(/(\d)\s*o'?clock\b/gi, '$1');
}

const FILLER =
  /^(?:hey|hi|hello|ok(?:ay)?|so|um+|uh+|daybloom|please|pls|plz|can you|could you|would you|will you|i want to|i'd like to|i would like to|i wanna|let's|lets|quickly)\b[\s,!.:]*/i;
const TAIL = /[\s,]*(?:please|pls|thanks|thank you|for me)?[\s.!?]*$/i;

export interface Prepped {
  /** Cleaned, case kept (for titles). */
  text: string;
  /** Lowercased with common contractions straightened (for routing). */
  low: string;
}

export function prep(input: string): Prepped {
  let t = (input ?? '').replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4; i++) {
    const n = t.replace(FILLER, '');
    if (n === t) break;
    t = n;
  }
  t = digits(t.replace(TAIL, '').trim());
  const low = t
    .toLowerCase()
    .replace(/\bwhats\b/g, 'what is')
    .replace(/\bwhens\b/g, 'when is')
    .replace(/\bhows\b/g, 'how is')
    .replace(/\bwheres\b/g, 'where is')
    .replace(/\b(how|what|when|where|who)'s\b/g, '$1 is')
    .replace(/\bim\b/g, "i'm")
    .replace(/\bive\b/g, "i've")
    .replace(/\bdont\b/g, "don't")
    .replace(/\bcant\b/g, "can't")
    .replace(/\bisnt\b/g, "isn't");
  return { text: t, low };
}

// ── Triggers ──────────────────────────────────────────────────────────────────

const TRIGGERS: { tool: string; res: RegExp[] }[] = TOOLS.map((t) => ({
  tool: t.schema.name,
  res: (t.schema.triggers ?? []).map((s) => new RegExp(s, 'i')),
}));

const QUESTION = /^(?:what|when|how|where|why|who|which|is|are|do|does|did|can|could|should|will|would|am)\b/;
const CREATE_VERB = /^(?:add|schedule|put|book|block|create|set up|pencil|plan in|slot|insert|new|pop|stick|squeeze)\b/;

/** Extra conditions a trigger match must meet. */
const FREE_TIME = /\bfree\b|\bwhen (?:can|could|do) i (?:fit|squeeze|have)\b|\b(?:gaps?|availab)/;

const GUARDS: Record<string, (p: Prepped, now: number) => boolean> = {
  when_is: (p) => !FREE_TIME.test(p.low) && !/^what time is it\b/.test(p.low),
  set_timezone: (p) => resolveZone(cityOf(p.text)) !== undefined,
  create_block: (p, now) => !QUESTION.test(p.low) && (CREATE_VERB.test(p.low) || !!createArgs({}, p.text, now).title),
};

/** The first tool whose trigger matches (and whose guard agrees). */
export function triggerTool(p: Prepped, now = clock.now): string | null {
  for (const { tool, res } of TRIGGERS) {
    if (!res.some((re) => re.test(p.low))) continue;
    const guard = GUARDS[tool];
    if (guard && !guard(p, now)) continue;
    return tool;
  }
  return null;
}

const CLOCK_TIME = /\b(?:at|@)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/i;

/** Known confusions, fixed whatever picked the tool. */
export function refine(tool: string, p: Prepped, now: number, source: Source): string {
  if (tool === 'add_to_backlog' && /^(?:remember|remind me|don't forget)\b/.test(p.low)) {
    const a = createArgs({}, p.text, now);
    if (a.time != null && !a.later) return 'create_block';
  }
  if (tool === 'create_block') {
    const a = createArgs({}, p.text, now);
    if (a.later && a.time == null) return 'add_to_backlog';
    const said = a.time != null || a.repeat || a.anytime || hasDateToken(stripLead(p.text, CREATE_LEAD), now);
    if (!said && /^(?:i need to|i have to|i gotta|gotta|remind me)\b/.test(p.low)) return 'add_to_backlog';
  }
  if (tool === 'start_timer' && source !== 'trigger' && CLOCK_TIME.test(p.low)) return 'create_block';
  if (['plan_my_day', 'show_day', 'whats_now', 'when_is'].includes(tool) && /\b(?:free|gaps?|available|availability)\b/.test(p.low)) return 'find_free_time';
  return tool;
}

// ── Keywords (the model-free fallback) ────────────────────────────────────────

/** Keyword hits (and example overlap) per tool, best first. `hits` counts keywords only. */
export function keywordScores(p: Prepped): { tool: string; score: number; hits: number }[] {
  const toks = new Set(tokens(p.low));
  const out: { tool: string; score: number; hits: number }[] = [];
  for (const t of TOOLS) {
    let s = 0;
    let hits = 0;
    for (const k of t.keywords) {
      if (k.includes(' ')) {
        if (p.low.includes(k)) {
          s += 1.5;
          hits++;
        }
      } else if (toks.has(stem(k))) {
        s += 1;
        hits++;
      }
    }
    let ex = 0;
    for (const e of t.examples) {
      const et = new Set(tokens(e));
      let inter = 0;
      for (const w of toks) if (et.has(w)) inter++;
      const union = new Set([...toks, ...et]).size;
      if (union) ex = Math.max(ex, inter / union);
    }
    s += 2 * ex;
    if (s > 0) out.push({ tool: t.schema.name, score: s, hits });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ── Needle ────────────────────────────────────────────────────────────────────

/**
 * Kept stable on purpose (no date, no clock): any change makes the engine re-apply the tools,
 * which costs ~6 ms per token. Days and times are read from the user's words by parseQuick.
 */
export const SYSTEM = 'Daybloom is a visual day planner. Pick the one tool that fits; fill arguments with the user\'s words.';

/**
 * What Needle sees: the tools where language varies most, with terse descriptions and no
 * triggers (triggers already ran client-side, so sending them would only cost init time).
 * Everything else is reached by triggers, keywords and embeddings.
 */
const NEEDLE_BRIEF: Record<string, string> = {
  whats_now: "What's happening now and next.",
  show_day: 'Show the plan for a day.',
  summarize_today: 'What got done today.',
  create_block: 'Add an activity at a clock time, day or repeat.',
  add_to_backlog: 'Save a task for later, no time.',
  show_backlog: 'List tasks saved for later.',
  search_tasks: 'Find tasks by name or topic.',
  complete_block: 'Mark a block done.',
  move_block: 'Move a block to another time or day.',
  extend_block: 'Give the current block more minutes.',
  delete_block: 'Remove a block.',
  start_timer: 'Start a countdown timer now.',
  plan_my_day: 'Fit saved tasks into free time.',
  find_free_time: 'Find free time on a day.',
  when_is: 'When a named block starts.',
  week_review: 'How the past week went.',
};
const KEEP_PARAM_DESC: Record<string, string> = { time: 'clock time', minutes: 'length' };
const KEEP_ENUM = new Set(['priority', 'part', 'span']);

export const NEEDLE_TOOLS: ToolSchema[] = Object.entries(NEEDLE_BRIEF).map(([name, description]) => {
  const s = toolByName(name)!.schema;
  const properties = Object.fromEntries(
    Object.entries(s.parameters.properties).map(([k, v]) => [k, { type: v.type, ...(KEEP_PARAM_DESC[k] ? { description: KEEP_PARAM_DESC[k] } : {}), ...(v.enum && KEEP_ENUM.has(k) ? { enum: v.enum } : {}) }]),
  );
  return { name, description, parameters: { type: 'object', properties } };
});

const ready = (e: NeedleEngine | null): e is NeedleEngine => !!e && e.status === 'ready';

export function embedderOf(engine: NeedleEngine | null): Embedder | null {
  return ready(engine) ? (t: string) => engine.embed(t) : null;
}

async function askNeedle(engine: NeedleEngine, text: string): Promise<NeedleResult | null> {
  try {
    await engine.configure(NEEDLE_TOOLS, SYSTEM);
    return await engine.complete(text, 128);
  } catch {
    return null;
  }
}

/**
 * Tools by embedding similarity to `text`. Each tool is its example phrasings; vectors are
 * mean-centred against all examples (Needle's raw cosines are compressed), a tool scores its
 * best example, and scores become z-scores across tools (scale-free).
 */
export async function nearestTools(text: string, embed: Embedder): Promise<{ tool: string; cos: number; z: number }[]> {
  const q = await embedText(text, embed);
  if (!q) return [];
  const ex: { tool: string; v: Float32Array }[] = [];
  for (const t of TOOLS) {
    for (const e of t.examples) {
      const v = await embedText(e, embed);
      if (v) ex.push({ tool: t.schema.name, v });
    }
  }
  if (ex.length < 10) return [];
  const dim = q.length;
  const mean = new Float64Array(dim);
  for (const { v } of ex) for (let i = 0; i < dim; i++) mean[i] += v[i] / ex.length;
  const centre = (v: Float32Array) => {
    const o = new Float64Array(dim);
    for (let i = 0; i < dim; i++) o[i] = v[i] - mean[i];
    return o;
  };
  const qc = centre(q);
  const best = new Map<string, number>();
  for (const { tool, v } of ex) {
    const c = cosine(qc, centre(v));
    if (!best.has(tool) || c > best.get(tool)!) best.set(tool, c);
  }
  const rows = [...best].map(([tool, cos]) => ({ tool, cos, z: 0 }));
  const m = rows.reduce((s, r) => s + r.cos, 0) / rows.length;
  const sd = Math.sqrt(rows.reduce((s, r) => s + (r.cos - m) ** 2, 0) / rows.length);
  if (!(sd > 1e-9)) return []; // no signal at all
  for (const r of rows) r.z = (r.cos - m) / sd;
  return rows.sort((a, b) => b.cos - a.cos);
}

/**
 * Background warm-up when the panel opens and the weights are here: apply the catalogue,
 * load the model (≈4.5 s after an idle unload), then embed every example phrasing (≈2 s) so
 * the semantic fallback is instant. Yields to the user between embeddings.
 */
export async function warmUp(engine: NeedleEngine, idle: () => boolean = () => true): Promise<void> {
  if (!ready(engine)) return;
  const embed = (t: string) => engine.embed(t);
  try {
    await engine.configure(NEEDLE_TOOLS, SYSTEM);
    await engine.ensureReady();
    for (const t of TOOLS) {
      for (const e of t.examples) {
        while (!idle()) await new Promise((r) => setTimeout(r, 400));
        if (!ready(engine)) return;
        await embedText(e, embed);
      }
    }
  } catch {
    /* warming is best-effort */
  }
}

/** Embed some extra texts (e.g. today's block titles) in the background. */
export async function warmTexts(engine: NeedleEngine, texts: string[], idle: () => boolean = () => true): Promise<void> {
  if (!ready(engine)) return;
  const embed = (t: string) => engine.embed(t);
  for (const t of texts) {
    if (!t.trim()) continue;
    while (!idle()) await new Promise((r) => setTimeout(r, 400));
    if (!ready(engine)) return;
    await embedText(t, embed);
  }
}

// ── Routing ───────────────────────────────────────────────────────────────────

export async function route(input: string, engine: NeedleEngine | null, now = clock.now, p: Prepped = prep(input)): Promise<Route> {
  const t0 = perfNow();
  const done = (r: Omit<Route, 'ms'>): Route => ({ ...r, ms: Math.round(perfNow() - t0) });
  if (!p.low) return done({ call: null, confidence: 0, source: 'none', options: [] });

  const trig = triggerTool(p, now);
  if (trig) return done({ call: { tool: refine(trig, p, now, 'trigger'), args: {} }, confidence: 0.95, source: 'trigger', options: [] });

  const kw = keywordScores(p);
  let lowCall: Call | null = null;
  let near: { tool: string; cos: number; z: number }[] = [];

  if (ready(engine)) {
    const r = await askNeedle(engine, p.text);
    const c = r?.calls.find((x) => toolByName(x.name));
    if (r && c && r.confidence >= LOW_CONFIDENCE) {
      const tool = refine(c.name, p, now, 'needle');
      return done({ call: { tool, args: tool === c.name ? (c.arguments as Args) : {} }, confidence: r.confidence, source: 'needle', options: [], raw: r.raw });
    }
    if (c && r!.confidence >= 0.1) lowCall = { tool: c.name, args: c.arguments as Args };
    near = (await nearestTools(p.text, (t) => engine.embed(t))).filter((n) => n.z >= 1.8);
    const [n1, n2] = near;
    const k = kw.find((x) => x.hits)?.tool ?? null;
    // Embeddings alone are noisy for intent: act only on a clear outlier no other signal disputes.
    if (n1 && n1.z >= 3 && (!n2 || n1.z - n2.z >= 1.2) && (!k || k === n1.tool) && (!lowCall || lowCall.tool === n1.tool)) {
      const tool = refine(n1.tool, p, now, 'embed');
      return done({ call: { tool, args: lowCall?.tool === tool ? lowCall.args : {} }, confidence: Math.min(0.6, 0.3 + 0.08 * (n1.z - 3)), source: 'embed', options: [] });
    }
    // Two weak signals that agree are enough to act on.
    const votes = [lowCall?.tool, n1?.tool, k ?? undefined].filter((x): x is string => !!x);
    const agreed = votes.find((v, i) => votes.indexOf(v) !== i);
    if (agreed) {
      const tool = refine(agreed, p, now, 'embed');
      return done({ call: { tool, args: lowCall?.tool === tool ? lowCall.args : {} }, confidence: 0.35, source: 'embed', options: [] });
    }
  }

  const [k1, k2] = kw;
  if (k1 && k1.hits && k1.score >= 1.5 && (!k2 || k1.score - k2.score >= 0.75)) {
    return done({ call: { tool: refine(k1.tool, p, now, 'keywords'), args: {} }, confidence: 0.45, source: 'keywords', options: [] });
  }

  const pool = [lowCall?.tool, near[0]?.tool, near[1]?.tool, ...kw.filter((x) => x.hits && x.score >= 0.8).map((x) => x.tool)];
  const options = [...new Set(pool.filter((x): x is string => !!x))].slice(0, 3).map((tool) => ({ tool, args: lowCall?.tool === tool ? lowCall.args : {} }));
  return done({ call: null, confidence: lowCall ? Math.min(0.24, 0.1) : Math.min(0.24, (k1?.score ?? 0) * 0.1), source: 'none', options });
}

// ── Replying ──────────────────────────────────────────────────────────────────

/** Route, normalise, run — or ask "Did you mean…" when unsure. */
export async function respond(input: string, engine: NeedleEngine | null, now = clock.now): Promise<Reply> {
  const t0 = perfNow();
  const p = prep(input);
  const rt = await route(input, engine, now, p);
  const ctx: Ctx = { text: p.text, now, embed: embedderOf(engine) };
  let result: ToolResult;
  if (rt.call && rt.confidence >= LOW_CONFIDENCE) {
    result = await runTool({ tool: rt.call.tool, args: normalize(rt.call.tool, rt.call.args, p.text, now) }, ctx);
  } else result = choices(rt, p, now);
  rt.ms = Math.round(perfNow() - t0);
  return { route: rt, result };
}

/** Run a call built by a card or a chip. */
export async function execute(call: Call, engine: NeedleEngine | null, now = clock.now, text = ''): Promise<ToolResult> {
  const args = call.args.norm ? call.args : normalize(call.tool, call.args, text, now);
  return runTool({ tool: call.tool, args }, { text, now, embed: embedderOf(engine) });
}

function option(tool: string, raw: Args, text: string, now: number): Option | null {
  const def = toolByName(tool);
  if (!def) return null;
  const args = normalize(tool, raw, text, now);
  return { label: def.label(args), icon: def.icon, call: { tool, args } };
}

/**
 * The "Did you mean…" card: the weak candidates first, then what a bare phrase usually is
 * (add it, save it, find it). A phrase that names a block today offers actions on that block.
 */
function choices(rt: Route, p: Prepped, now: number): ToolResult {
  if (!/[a-z0-9]/i.test(p.text)) return { say: "Here's what I can do.", card: { kind: 'help' } };
  const today = isoOf(now);
  const named = blocksInRange(taskFile.value.tasks, [], startOfDayMs(today), startOfDayMs(addDays(today, 1)))
    .map((b) => ({ b, s: fuzzyScore(p.text, b.title) }))
    .sort((x, y) => y.s - x.s)[0];
  let opts: (Option | null)[];
  if (!rt.options.length && named && named.s >= 0.8) {
    const t = named.b.title;
    opts = [
      option('when_is', { title: t, key: named.b.key, norm: true }, t, now),
      option('complete_block', { title: t, key: named.b.key, norm: true }, t, now),
      option('move_block', { title: t, key: named.b.key, norm: true }, t, now),
    ];
  } else {
    const hint = (rt.options[0]?.args ?? {}) as Record<string, unknown>;
    const said = str(hint.title) ?? str(hint.query);
    const title = cap(said && p.text.toLowerCase().includes(said.toLowerCase()) ? said : p.text.replace(/[?!.]+$/, ''));
    opts = rt.options.map((c) => option(c.tool, c.args, p.text, now));
    const fill: [string, Args][] = [
      ['create_block', { ...normalize('create_block', { title }, p.text, now), title }],
      ['add_to_backlog', { title, norm: true }],
      ['search_tasks', { query: said ?? p.text, norm: true }],
    ];
    for (const [tool, args] of fill) {
      if (opts.length >= 3) break;
      if (!rt.options.some((o) => o.tool === tool)) opts.push(option(tool, args, p.text, now));
    }
  }
  const list = opts.filter((o): o is Option => !!o);
  return { say: rt.options.length ? 'Did you mean one of these?' : "I'm not sure what you meant. Is it one of these?", card: { kind: 'choice', options: list } };
}

// ── Argument normalisation ────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);

/** Minutes of length: 45, "45", "45 minutes", "an hour", "1h30". */
export function toMinutes(v: unknown, now = clock.now): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v);
  const s = str(v);
  if (!s) return null;
  if (/^\d+(?:\.\d+)?$/.test(s)) return Math.round(Number(s));
  return parseQuick(`for ${digits(s)}`, now, nowMinutes(now)).duration;
}

/** Minutes after midnight: "5pm", "17:00", "5" (→ 17:00), "noon", 17 (hours) or 1020 (minutes). */
export function toTime(v: unknown, now = clock.now): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v >= 0 && v <= 24) return Math.round(v * 60) % 1440;
    if (v > 24 && v < 1440) return Math.round(v);
    return null;
  }
  const s = str(v);
  if (!s) return null;
  const t = digits(s);
  const q = parseQuick(/^(?:at|@)\b/i.test(t) ? t : `at ${t}`, now, nowMinutes(now));
  return q.hasTime ? q.start : null;
}

/** A day: "today", "tomorrow", "friday", "next mon", "yesterday" or YYYY-MM-DD. */
export function toDay(v: unknown, now = clock.now): ISODate | null {
  const s = str(v);
  return s ? dayIn(s, now) : null;
}

/** A repeat: "daily", "weekdays", "every monday", "monday" or a Recurrence object. */
export function toRepeat(v: unknown, now = clock.now): Recurrence | null {
  if (v && typeof v === 'object' && 'freq' in v) {
    const r = v as Recurrence;
    if (['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq)) return { ...r, interval: Math.max(1, r.interval || 1) };
    return null;
  }
  const s = str(v);
  if (!s) return null;
  const nm = nowMinutes(now);
  return parseQuick(s, now, nm).recurrence ?? parseQuick(`every ${s}`, now, nm).recurrence;
}

function toPriority(v: unknown): 1 | 2 | 3 | null {
  const s = (str(v) ?? '').toLowerCase();
  if (/^(?:1|p1|must|high|urgent|important)$/.test(s)) return 1;
  if (/^(?:2|p2|should|medium|normal)$/.test(s)) return 2;
  if (/^(?:3|p3|could|low)$/.test(s)) return 3;
  return null;
}

function hasDateToken(text: string, now: number): boolean {
  return parseQuick(text, now, nowMinutes(now)).tokens.some((t) => t[2] === 'date');
}

/** The day named in `text`, if any. */
export function dayIn(text: string, now = clock.now): ISODate | null {
  const today = isoOf(now);
  if (/\byesterday\b/i.test(text)) return addDays(today, -1);
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  if (iso) return iso[1];
  if (/\bday after tomorrow\b/i.test(text)) return addDays(today, 2);
  const q = parseQuick(digits(text), now, nowMinutes(now));
  if (q.date && q.tokens.some((t) => t[2] === 'date')) return q.date;
  if (/\b(?:tonight|this (?:morning|afternoon|evening))\b/i.test(text)) return today;
  // A bare weekday ("friday") that parseQuick leaves alone at the start of a phrase.
  const wd = /\b(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i.exec(text);
  if (wd) {
    const r = parseQuick(`on ${wd[0]}`, now, nowMinutes(now));
    if (r.date) return r.date;
  }
  return null;
}

const CREATE_LEAD =
  /^(?:add|schedule|put|book|block(?:\s+(?:out|off))?|create|make|set\s+up|pencil(?:\s+in)?|plan\s+in|slot(?:\s+in)?|insert|new(?:\s+block)?|pop|stick|squeeze(?:\s+in)?|remind\s+me\s+(?:to|about)|remind\s+me|remember\s+to|i\s+have\s+to|i\s+have|i've\s+got\s+to|i've\s+got|i\s+need\s+to|i\s+gotta|gotta)\s+(?:(?:a|an)\s+)?/i;
const CREATE_TAIL = /\s+(?:to|on|in|into)\s+(?:my|the)\s+(?:day|dial|calendar|schedule|plan)$|\s+(?:to|on)\s+(?:today|tomorrow)$/i;
const BACKLOG_LEAD =
  /^(?:i\s+need\s+to|i\s+have\s+to|i\s+gotta|gotta|i\s+should|need\s+to|remember\s+to|remember|don'?t\s+forget\s+(?:to|about)|don'?t\s+forget|do\s+not\s+forget(?:\s+to)?|remind\s+me\s+(?:to|about)|remind\s+me|add|put|capture|note|jot(?:\s+down)?|save|park|todo|to-?do|later)\s*:?\s*/i;
const BACKLOG_TAIL = /\s+(?:to|in|into|on|onto)\s+(?:my\s+|the\s+)?(?:backlog|inbox|someday(?:\s+list)?|later\s+list|to-?do(?:\s+list)?|list)\b/i;
const COMPLETE_LEAD =
  /^(?:i\s+)?(?:just\s+|already\s+|have\s+|'ve\s+)?(?:finished|completed|did|done\s+with|am\s+done\s+with|ticked\s+off|checked\s+off|wrapped\s+up|ate|had|took|knocked\s+out|mark(?:ed)?|tick(?:ed)?(?:\s+off)?|check(?:ed)?(?:\s+off)?|done(?:\s+with)?)\s*/i;
const MOVE_LEAD = /^(?:(?:can|could)\s+(?:i|we|you)\s+)?(?:move|push(?:\s+back)?|shift|reschedule|postpone|bump|slide|delay|put\s+off|bring(?:\s+forward)?)\s+/i;
const EXTEND_LEAD = /^(?:extend|lengthen|prolong|give\s+me|i\s+need|i'd\s+like|can\s+i\s+have|add|another)\s+/i;
const DELETE_LEAD = /^(?:delete|remove|cancel|erase|scrap|trash|bin|drop|get\s+rid\s+of|unschedule|skip)\s+/i;
const WHEN_LEAD = /^(?:when(?:'s|\s+is|\s+does|\s+do|\s+will)?|what\s+time\s+(?:is|does|do|will)|how\s+(?:long|much\s+time|many\s+minutes|many\s+hours)\s+(?:is\s+it\s+)?(?:until|till|til|before))\s+/i;
const SEARCH_LEAD =
  /^(?:find|search(?:\s+for)?|look\s+(?:for|up)|lookup|locate|where(?:'s|\s+is|\s+are|\s+did\s+i\s+put)|do\s+i\s+have\s+(?:anything|something|a\s+task|a\s+block|any\s+tasks?)\s+(?:about|for|with|called|named|on))\s+/i;

const EDGE_HEAD = /^(?:the|my|a|an|this|that|to|for|with|on|at|by|from|until|till|in|of|and|please|now|back|forward|as|up|about)\b\s*/i;
const EDGE_TAIL = /\s*\b(?:the|my|a|an|to|for|with|on|at|by|from|until|till|in|of|and|please|now|as|done|finished|complete|completed|off|is|are|was|yet|block|task|start|starts|begin|happen|today)$/i;

function stripLead(text: string, lead: RegExp): string {
  return text.replace(lead, '').trim();
}

/** Strip connector words off both ends ("the walk to" → "walk"). */
function edges(s: string): string {
  let t = s.replace(/[?!.,;:]+$/g, '').trim();
  for (let i = 0; i < 8; i++) {
    const n = t.replace(EDGE_HEAD, '').replace(EDGE_TAIL, '').trim();
    if (n === t) break;
    t = n;
  }
  return t;
}

/** What block a sentence is about, with time/day words removed. Null for "it"/"this"/nothing. */
function targetQuery(body: string, now: number): string | null {
  const q = parseQuick(body, now, nowMinutes(now));
  const t = edges(q.title.replace(/'s\b/gi, ''));
  if (!t || /^(?:it|this|that|this one|that one|one|current|current block|block|now)$/i.test(t)) return null;
  return t;
}

/** Prefer the model's title only when it is words the user actually said. */
function pickTitle(fromText: string | null, raw: unknown, text: string): string | null {
  const m = str(raw);
  if (m && text.toLowerCase().includes(m.toLowerCase()) && (!fromText || m.length < fromText.length)) return m;
  return fromText || m;
}

function createArgs(raw: Args | Record<string, unknown>, text: string, now: number): Args {
  const r = raw as Record<string, unknown>;
  const body = stripLead(text, CREATE_LEAD).replace(CREATE_TAIL, '');
  const q = parseQuick(body, now, nowMinutes(now));
  const explicitDay = q.tokens.some((t) => t[2] === 'date');
  const later = q.date === null;
  const fromText = q.title.replace(/^(?:the|a|an|my)\s+/i, '').replace(/\s+(?:into|onto|to|at|on|for|by)$/i, '').trim();
  const title = pickTitle(fromText || null, r.title, text);
  const tidy = title ? cap(parseQuick(title, now, nowMinutes(now)).title || title) : '';
  return {
    title: tidy,
    time: q.hasTime ? q.start : toTime(r.time, now),
    day: explicitDay ? q.date : (toDay(r.day, now) ?? (q.recurrence?.byWeekday ? q.date : null)),
    minutes: q.duration ?? toMinutes(r.minutes, now),
    repeat: q.recurrence ?? toRepeat(r.repeat, now),
    later,
    anytime: q.anytime,
    norm: true,
  };
}

const SHIFT_A = /\b(?:by\s+)?(\d+\s*(?:m|min|mins|minutes?|h|hrs?|hours?)|an?\s+hour|half\s+an\s+hour)\s+(later|earlier|back|forward|sooner)\b/i;
const SHIFT_B = /\b(later|earlier|back|forward|sooner)\s+(?:by\s+)?(\d+\s*(?:m|min|mins|minutes?|h|hrs?|hours?)|an?\s+hour|half\s+an\s+hour)\b/i;

/** Normalise raw arguments (from a trigger, Needle or a chip) for `tool`, reading `text` first. */
export function normalize(tool: string, raw: Args | Record<string, unknown> = {}, text = '', now = clock.now): Args {
  const r = raw as Record<string, unknown>;
  if (r.norm) return raw as Args;
  const t = digits(text.trim());
  const low = t.toLowerCase();
  const nm = nowMinutes(now);
  switch (tool) {
    case 'create_block':
      return createArgs(raw, t, now);

    case 'add_to_backlog': {
      const body = stripLead(t, BACKLOG_LEAD).replace(BACKLOG_TAIL, '').trim();
      const item = body ? parseCaptureLine(body, now, nm) : null;
      const explicit = body ? parseQuick(body, now, nm).duration : null;
      return {
        title: pickTitle(item?.title ?? null, r.title, t),
        minutes: explicit ?? toMinutes(r.minutes, now),
        due: item?.due ?? toDay(r.due, now),
        priority: item?.priority ?? toPriority(r.priority),
        list: /\bsome ?day\b/i.test(t) ? 'someday' : (item?.list ?? null),
        norm: true,
      };
    }

    case 'complete_block': {
      let body = stripLead(t, COMPLETE_LEAD);
      body = body.replace(/\s*\b(?:is|are|was|'s)?\s*(?:as\s+)?(?:done|finished|complete(?:d)?|off)$/i, '');
      return { title: pickTitle(targetQuery(body, now), r.title, t), norm: true };
    }

    case 'move_block': {
      let body = stripLead(t, MOVE_LEAD);
      let shift: number | null = null;
      const m = SHIFT_A.exec(body) ?? SHIFT_B.exec(body);
      if (m) {
        const [amount, dir] = SHIFT_A.test(body) ? [m[1], m[2]] : [m[2], m[1]];
        const mins = toMinutes(amount, now) ?? 0;
        shift = /earlier|forward|sooner/i.test(dir) ? -mins : mins;
        body = body.replace(m[0], ' ').trim();
      }
      const q = parseQuick(body, now, nm);
      const explicitDay = q.tokens.some((k) => k[2] === 'date');
      return {
        title: pickTitle(targetQuery(body, now), r.title, t),
        time: q.hasTime ? q.start : toTime(r.time, now),
        day: explicitDay ? q.date : toDay(r.day, now),
        shift,
        later: q.date === null,
        norm: true,
      };
    }

    case 'extend_block': {
      let body = stripLead(t, EXTEND_LEAD)
        .replace(/\b(\d+)\s+more\s+/gi, '$1 ')
        .replace(/\b(?:more|extra)\s+time\b/gi, ' ')
        .replace(/\b(?:i'?m|i am|am|is|isn'?t|it'?s)?\s*not\s+(?:done|finished)(?:\s+yet)?\b/gi, ' ')
        .replace(/\bstill\s+(?:going|working on it|at it)\b/gi, ' ')
        .replace(/\b(?:is\s+)?(?:running|run|going)\s+(?:long|over)\b/gi, ' ')
        .replace(/\b(?:more|extra|another)\b/gi, ' ')
        .trim();
      const minutes = parseQuick(body, now, nm).duration ?? toMinutes(r.minutes, now);
      body = body.replace(/\b(?:give me|i need|i'd like|can i have)\b/gi, ' ');
      return { title: pickTitle(targetQuery(body, now), r.title, t), minutes, norm: true };
    }

    case 'delete_block': {
      const body = stripLead(t, DELETE_LEAD);
      const all = /\b(?:all|every|series|always|for good|every day)\b/i.test(body);
      const clean = body.replace(/\b(?:all(?:\s+of)?|every(?:\s+one)?|the\s+series|for\s+good|always)\b/gi, ' ');
      return { title: pickTitle(targetQuery(clean, now), r.title, t), day: dayIn(body, now) ?? toDay(r.day, now), all, norm: true };
    }

    case 'when_is': {
      const body = stripLead(t, WHEN_LEAD);
      return { title: pickTitle(targetQuery(body, now), r.title, t), norm: true };
    }

    case 'search_tasks': {
      const body = edges(stripLead(t, SEARCH_LEAD));
      return { query: body || str(r.query) || str(r.title), norm: true };
    }

    case 'show_day':
    case 'plan_my_day':
      return { day: dayIn(t, now) ?? toDay(r.day, now), norm: true };

    case 'find_free_time': {
      const part = /\bmorning\b/i.test(t) ? 'morning' : /\bafternoon\b/i.test(t) ? 'afternoon' : /\b(?:evening|tonight|night)\b/i.test(t) ? 'evening' : null;
      const pr = str(r.part)?.toLowerCase();
      return {
        day: dayIn(t, now) ?? toDay(r.day, now),
        minutes: parseQuick(t, now, nm).duration ?? toMinutes(r.minutes, now),
        part: part ?? (pr === 'morning' || pr === 'afternoon' || pr === 'evening' ? pr : null),
        norm: true,
      };
    }

    case 'start_timer': {
      const q = parseQuick(t, now, nm);
      const isBreak = /\b(?:break|rest|breather)\b/i.test(t);
      const left = edges(
        q.title.replace(/\b(?:start|begin|set|run|a|an|the|my|timer|countdown|for|of|on|minutes?|mins?|focus session|take|need|have|want|i|short|quick|little|small|shall|we|do|some|let'?s|time to|get|go)\b/gi, ' ').replace(/\s+/g, ' '),
      );
      const label = isBreak ? 'Break' : !left || /^(?:focus|work|deep work)$/i.test(left) ? (str(r.label) ?? null) : cap(left);
      return { minutes: q.duration ?? toMinutes(r.minutes, now), label: label && /^focus$/i.test(label) ? null : label, norm: true };
    }

    case 'start_focus_cycles': {
      const m = /(\d+)\s*(?:focus\s+|work\s+)?(?:cycles?|rounds?|pomodoros?|sprints?)/i.exec(t);
      const len = /(?:of|×|x)\s*(\d+)\s*(?:m|min|mins|minutes?)\b/i.exec(t);
      return {
        rounds: m ? Number(m[1]) : toMinutes(r.rounds, now),
        minutes: len ? Number(len[1]) : toMinutes(r.minutes, now),
        norm: true,
      };
    }

    case 'week_review':
      return { span: /\b(?:month|monthly|4 weeks|four weeks|28 days)\b/i.test(t) || /month/i.test(str(r.span) ?? '') ? 28 : 7, norm: true };

    case 'show_backlog': {
      const list = /\binbox\b/i.test(t) ? 'inbox' : /\bnext\b/i.test(t) ? 'next' : /\bsome ?day\b/i.test(t) ? 'someday' : /\b(?:done|finished)\b/i.test(t) ? 'done' : null;
      const rl = str(r.list)?.toLowerCase();
      return { list: list ?? (rl === 'inbox' || rl === 'next' || rl === 'someday' || rl === 'done' ? rl : 'all'), norm: true };
    }

    case 'set_theme': {
      const named = THEMES.find((th) => new RegExp(`\\b${th.id}\\b`, 'i').test(low))?.id;
      const theme = /\btoo bright\b/.test(low)
        ? 'dark'
        : /\btoo dark\b/.test(low)
          ? 'light'
          : (named ?? (/\b(?:dark|night)\b/.test(low) ? 'dark' : /\b(?:light|day mode|bright)\b/.test(low) ? 'light' : /\b(?:system|auto(?:matic)?)\b/.test(low) ? 'system' : null));
      return { theme: theme ?? str(r.theme)?.toLowerCase() ?? null, norm: true };
    }

    case 'set_dial': {
      const pick = (s: string): PresetId | null =>
        /\b(?:24|twenty[- ]four|gmt|24h|gmt24)\b/i.test(s)
          ? 'gmt24'
          : /\b(?:12|twelve|12h|field12)\b/i.test(s)
            ? 'field12'
            : /\b(?:cycles?|pomodoro|rounds?|focus|chrono)\b/i.test(s)
              ? 'chrono'
              : /\b(?:hour|timer|60|timer60)\b/i.test(s)
                ? 'timer60'
                : null;
      return { preset: pick(low) ?? pick(str(r.preset) ?? ''), norm: true };
    }

    case 'set_timezone': {
      const city = cityOf(t) ?? str(r.city);
      return { city, zone: resolveZone(city), norm: true };
    }

    case 'toggle_widget': {
      const state = /\b(?:hide|close|off|remove|get rid)\b/i.test(low) ? 'hide' : /\b(?:show|open|on|bring|display)\b/i.test(low) ? 'show' : 'toggle';
      const rs = str(r.state);
      return { state: state === 'toggle' && (rs === 'show' || rs === 'hide') ? rs : state, norm: true };
    }

    default:
      return { norm: true };
  }
}

/** The place in "I'm in Tokyo", "switch to London time", "back to local time". */
export function cityOf(text: string): string | null {
  const s = text
    .trim()
    .replace(/[?!.]+$/, '')
    .replace(/^(?:i'?m|i am|we'?re|we are)(?:\s+now|\s+currently)?\s+(?:in|at|visiting)\s+/i, '')
    .replace(/^(?:switch|change|go|set|show|use|put)(?:\s+me|\s+it|\s+my\s+day|\s+the\s+day|\s+everything)?(?:\s+back)?\s+(?:to|in|on)\s+/i, '')
    .replace(/^(?:go\s+)?back\s+(?:to|on)\s+/i, '')
    .replace(/^(?:use|show)\s+/i, '')
    .replace(/^(?:set\s+)?(?:my\s+|the\s+)?time\s?zones?(?:\s+(?:to|is|for))?\s*/i, '')
    .replace(/\s+time(?:\s?zone)?$/i, '')
    .replace(/^(?:the|my)\s+/i, '')
    .trim();
  return s || null;
}
