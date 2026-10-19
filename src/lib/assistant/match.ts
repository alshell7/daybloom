// Title matching and semantic search for the assistant.
//
// Two signals, blended:
// - Fuzzy (always on, deterministic): tokens, light stemming, prefixes and bigram overlap, so
//   "lunch" finds "Lunch & water" and "the walk" finds "Walk outside". A tiny meaning proxy
//   rides along: words that the app's own keyword hints map to the same icon ("pills" →
//   "Morning meds") count as related.
// - Semantic (when Needle is on this device): cosine similarity of Needle embeddings, cached
//   by text, so "food" finds "Lunch & water" and "exercise" finds "Gym".
//
// `rank` scores candidates; `decide` turns a ranking into one pick, a short list to choose
// from ("Did you mean…"), or nothing.

import { suggest } from '../actions';

export type Embedder = (text: string) => Promise<Float32Array>;

const STOP = new Set([
  'the', 'a', 'an', 'my', 'to', 'with', 'and', 'of', 'for', 'on', 'in', 'at', 'it', 'this', 'that',
  'block', 'task', 'please', 'some', 'our', 'your', 'me', 'i', 'is', 'up', 'from',
]);

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Lowercase, `&` → "and", punctuation → spaces. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** A small, forgiving stemmer: walking → walk, meds → med, tidied → tidi(ed). */
export function stem(w: string): string {
  let s = w;
  if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  return s;
}

/** Meaningful stemmed tokens. */
export function tokens(s: string): string[] {
  return norm(s)
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .map(stem);
}

function bigrams(s: string): string[] {
  const t = s.replace(/\s+/g, ' ');
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice coefficient over character bigrams. */
export function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const pool = new Map<string, number>();
  for (const g of B) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of A) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (A.length + B.length);
}

/** Optimal-string-alignment distance (edits + adjacent swaps), capped at 2. */
function osa(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function tokenSim(a: string, b: string): number {
  if (a === b) return 1;
  // A prefix counts when it is most of the word ("lunc" → "lunch"), not a different compound ("work" ≠ "workout").
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 3 && long.startsWith(short) && short.length / long.length >= 0.7) return 0.9;
  // One slip in a longer word ("lnuch"), but not a different short word ("bill" ≠ "pill").
  if (Math.min(a.length, b.length) >= 5 && a[0] === b[0] && osa(a, b) <= 1) return 0.7;
  // Partial overlap only counts for words that start alike ("sleep" is not "deep").
  const d = a[0] === b[0] ? dice(a, b) : 0;
  return d >= 0.6 ? d * 0.85 : 0;
}

/** How well `query` names `title`, 0..1. */
export function fuzzyScore(query: string, title: string): number {
  const q = norm(query);
  const t = norm(title);
  if (!q || !t) return 0;
  if (q === t) return 1;
  const qt = tokens(q);
  const tt = tokens(t);
  let s = 0;
  if (qt.length && tt.length) {
    let sum = 0;
    let named = 0;
    for (const a of qt) {
      let best = 0;
      for (const b of tt) best = Math.max(best, tokenSim(a, b));
      sum += best;
    }
    for (const b of tt) if (qt.some((a) => tokenSim(a, b) >= 0.8)) named++;
    const qCover = sum / qt.length; // how much of the query is explained
    const tCover = named / tt.length; // how much of the title it names
    s = qCover * (0.82 + 0.18 * tCover);
  }
  if (q.length >= 3 && t.includes(q)) s = Math.max(s, 0.8 + 0.2 * (q.length / t.length));
  const whole = dice(q, t);
  if (whole >= 0.55) s = Math.max(s, whole * 0.9);
  return clamp01(s);
}

// ── Meaning without a model ───────────────────────────────────────────────────
//
// Words that name a kind of activity map to the icons the app gives that kind of block, so
// "food" finds the utensils block and "exercise" offers every movement block.

const CONCEPTS: [RegExp, string[]][] = [
  [/\b(?:food|meals?|eat|eating|hungry|lunch|dinner|breakfast|brunch|snacks?|cook(?:ing)?)\b/, ['utensils', 'chef', 'apple']],
  [/\b(?:drinks?|hydrate|coffee|tea)\b/, ['droplet', 'coffee']],
  [/\b(?:exercise|workout|work out|training|sports?|fitness|movement|cardio|running|run|jog|walk|gym|yoga|swim|bike|cycling)\b/, ['dumbbell', 'footprints', 'activity', 'bike', 'waves', 'mountain']],
  [/\b(?:meds?|medicine|medication|pills?|tablets?|vitamins?|dose)\b/, ['pill']],
  [/\b(?:doctor|gp|clinic|appointment|therapy|therapist|check-?up|nurse|hospital)\b/, ['stethoscope']],
  [/\b(?:friends?|mates?|buddy|mum|mom|dad|family|chat|phone|catch up|ring)\b/, ['phone', 'users']],
  [/\b(?:e-?mails?|mail|inbox|messages?|texts?|replies|slack|dms?)\b/, ['mail', 'message']],
  [/\b(?:sleep|bed|nap|rest|relax|unwind)\b/, ['bed', 'moon', 'bed-rest']],
  [/\b(?:chores?|cleaning|clean|tidy|housework|laundry|dishes)\b/, ['sparkles', 'shirt', 'house']],
  [/\b(?:shopping|shop|groceries|grocery|errands?)\b/, ['cart']],
  [/\b(?:money|bills?|bank|budget|taxes|finances?)\b/, ['wallet']],
  [/\b(?:study|studying|reading|read|learn(?:ing)?|class|homework|course)\b/, ['book-open', 'graduation', 'languages', 'library', 'notebook']],
  [/\b(?:coding|code|programming|writing|essay|report)\b/, ['code', 'pen', 'laptop']],
];

/** Icons that the words of `query` point at (the app's own hint table included). */
export function conceptIcons(query: string): Set<string> {
  const q = query.toLowerCase();
  const out = new Set<string>();
  for (const [re, icons] of CONCEPTS) if (re.test(q)) icons.forEach((i) => out.add(i));
  const hint = suggest(query)?.icon;
  if (hint) out.add(hint);
  return out;
}

// ── Embeddings ────────────────────────────────────────────────────────────────
//
// Needle's vectors share a large common direction, so raw cosines are compressed (unrelated
// ≈ 0.92, related ≈ 0.95). Never trust an absolute threshold: every vector is mean-centred
// against the corpus of texts embedded so far, and a candidate's similarity is read as a
// z-score against the query's similarity to the whole corpus.

const cache = new Map<string, Promise<Float32Array | null>>();
/** Resolved vectors, for the corpus mean and the reference distribution. */
const corpus = new Map<string, Float32Array>();
const CACHE_MAX = 800;
let meanVec: Float64Array | null = null;
let meanOf = -1;

/** Embedding for `text`, cached by its normalised text. Null when the engine can't embed. */
export function embedText(text: string, embed: Embedder): Promise<Float32Array | null> {
  const key = text.trim().toLowerCase();
  let p = cache.get(key);
  if (!p) {
    p = embed(key).then(
      (v) => {
        if (!v || !v.length) return null;
        corpus.set(key, v);
        if (corpus.size > CACHE_MAX) corpus.delete(corpus.keys().next().value as string);
        return v;
      },
      () => {
        cache.delete(key);
        return null;
      },
    );
    cache.set(key, p);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

/** Whether an embedding for `text` is already cached (or on its way). */
export function hasEmbedding(text: string): boolean {
  return cache.has(text.trim().toLowerCase());
}

/** How many vectors the reference corpus holds. */
export function corpusSize(): number {
  return corpus.size;
}

export function clearEmbeddings() {
  cache.clear();
  corpus.clear();
  meanVec = null;
  meanOf = -1;
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function corpusMean(): Float64Array | null {
  if (!corpus.size) return null;
  if (meanVec && meanOf === corpus.size) return meanVec;
  const dim = corpus.values().next().value!.length;
  const m = new Float64Array(dim);
  for (const v of corpus.values()) for (let i = 0; i < dim; i++) m[i] += v[i];
  for (let i = 0; i < dim; i++) m[i] /= corpus.size;
  meanVec = m;
  meanOf = corpus.size;
  return m;
}

function centre(v: Float32Array, m: Float64Array): Float64Array {
  const out = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] - m[i];
  return out;
}

/** Below this many reference vectors, z-scores mean nothing: semantic matching stays off. */
export const MIN_CORPUS = 16;

/**
 * Semantic similarity of `query` to each target, as z-scores against the query's similarity
 * to the whole corpus (mean-centred cosines). Null when the corpus is too small to judge.
 */
export function semanticZ(query: Float32Array, targets: Float32Array[]): number[] | null {
  if (corpus.size < MIN_CORPUS) return null;
  const m = corpusMean();
  if (!m) return null;
  const q = centre(query, m);
  const ref: number[] = [];
  for (const v of corpus.values()) if (v !== query) ref.push(cosine(q, centre(v, m)));
  const mean = ref.reduce((s, x) => s + x, 0) / ref.length;
  const sd = Math.sqrt(ref.reduce((s, x) => s + (x - mean) ** 2, 0) / ref.length);
  if (!(sd > 1e-9)) return null;
  return targets.map((v) => (cosine(q, centre(v, m)) - mean) / sd);
}

/** z-score → 0..1 relatedness: below 2σ nothing, 3.5σ and up the same thing. */
export function relatedness(z: number): number {
  return clamp01((z - 2) / 1.5);
}

// ── Ranking ───────────────────────────────────────────────────────────────────

export interface Candidate<T> {
  item: T;
  /** What the candidate is called (its title). */
  text: string;
  /** Extra words that describe it (notes, subtasks) — weaker evidence than the title. */
  extra?: string;
  icon?: string;
  /** Context nudge, e.g. +0.1 for the block you're in right now. */
  boost?: number;
}

export interface Ranked<T> {
  item: T;
  text: string;
  score: number;
  fuzzy: number;
  semantic: number | null;
}

/**
 * Score every candidate against `query` (fuzzy, hint-icon and, when available, embeddings).
 * Only the first `maxEmbed` candidates are embedded (≈50 ms each the first time; cached after).
 */
export async function rank<T>(query: string, cands: Candidate<T>[], embed?: Embedder | null, { maxEmbed = 40 } = {}): Promise<Ranked<T>[]> {
  const q = query.trim();
  if (!q || !cands.length) return [];
  const icons = conceptIcons(q);

  // Needle's embeddings separate titles only weakly, so they count only for a clear outlier:
  // the one candidate whose similarity stands well above the rest.
  const sem: (number | null)[] = cands.map(() => null);
  if (embed) {
    const qv = await embedText(q, embed);
    if (qv) {
      const vecs: (Float32Array | null)[] = [];
      for (let i = 0; i < cands.length; i++) vecs.push(i < maxEmbed ? await embedText(cands[i].text, embed) : null);
      const have = vecs.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      const zs = semanticZ(qv, have.map((i) => vecs[i]!));
      if (zs && zs.length) {
        const order = zs.map((z, k) => ({ z, i: have[k] })).sort((a, b) => b.z - a.z);
        const [top, second] = order;
        if (top.z >= 2.5 && (!second || top.z - second.z >= 0.75)) sem[top.i] = relatedness(top.z);
      }
    }
  }

  const out: Ranked<T>[] = cands.map((c, i) => {
    let fuzzy = fuzzyScore(q, c.text);
    if (c.extra) fuzzy = Math.max(fuzzy, fuzzyScore(q, c.extra) * 0.7);
    const semantic = sem[i];
    const concept = c.icon && icons.has(c.icon) ? 0.6 : 0;
    const base = Math.max(fuzzy, semantic === null ? 0 : semantic * 0.9, concept);
    return { item: c.item, text: c.text, score: Math.max(0, base + (base > 0.2 ? (c.boost ?? 0) : 0)), fuzzy, semantic };
  });
  return out.sort((a, b) => b.score - a.score);
}

export interface Decision<T> {
  pick: Ranked<T> | null;
  /** Close calls worth offering ("Did you mean…"), best first. */
  options: Ranked<T>[];
}

/** One confident pick, a short list of close calls, or nothing. */
export function decide<T>(ranked: Ranked<T>[], { sure = 0.5, maybe = 0.3, margin = 0.1 } = {}): Decision<T> {
  const [a, b] = ranked;
  if (!a || a.score < maybe) return { pick: null, options: [] };
  const clear = !b || a.score - b.score >= margin || (a.fuzzy >= 0.97 && b.fuzzy < 0.97);
  if (a.score >= sure && clear) return { pick: a, options: [] };
  return { pick: null, options: ranked.filter((r) => r.score >= maybe && r.score >= a.score - 0.25).slice(0, 3) };
}

/** Search: everything that plausibly matches, best first (looser than `decide`). */
export function hits<T>(ranked: Ranked<T>[], { min = 0.42, max = 6 } = {}): Ranked<T>[] {
  return ranked.filter((r) => r.score >= min).slice(0, max);
}
