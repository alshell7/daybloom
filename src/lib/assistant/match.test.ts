import { beforeEach, describe, expect, it } from 'vitest';
import { clearEmbeddings, corpusSize, decide, dice, embedText, fuzzyScore, hits, MIN_CORPUS, rank, semanticZ, stem, tokens, type Candidate } from './match';

/**
 * Embeddings shaped like Needle's: one big shared direction plus small concept and word
 * components, so raw cosines are compressed (everything ≈ 0.9+). Only centring + z-scores
 * can tell related from unrelated.
 */
const CONCEPTS: [RegExp, number][] = [
  [/\b(?:food|lunch|eat|meal|hungry|dinner)\b/, 1],
  [/\b(?:exercise|gym|workout|run|walk)\b/, 2],
  [/\b(?:money|bills|bank|budget|taxes)\b/, 3],
  [/\b(?:tooth|teeth|molar|dentist)\b/, 4],
];
function vec(raw: string): Float32Array {
  const text = raw.toLowerCase();
  const v = new Float32Array(64);
  v[0] = 7;
  for (const [re, i] of CONCEPTS) if (re.test(text)) v[i] = 2.2;
  for (const w of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let h = 7;
    for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[8 + (h % 56)] += 0.3;
  }
  let s = 0;
  for (const x of v) s += x * x;
  return v.map((x) => x / Math.sqrt(s));
}
let calls = 0;
const embed = async (t: string) => {
  calls++;
  return vec(t);
};

const FILLER = [
  'read a chapter', 'water the plants', 'reply to messages', 'call a friend', 'deep work', 'wind down', 'laundry', 'tidy the desk',
  'practice guitar', 'plan tomorrow', 'take out the bins', 'stretch', 'journal', 'feed the cat', 'pick up the kids', 'study spanish',
  'clean the kitchen', 'write the report',
];

type B = { id: string; title: string; icon?: string };
const cands = (xs: B[]): Candidate<B>[] => xs.map((b) => ({ item: b, text: b.title, icon: b.icon }));

const DAY: B[] = [
  { id: 'meds', title: 'Morning meds', icon: 'pill' },
  { id: 'deep', title: 'Deep work', icon: 'laptop' },
  { id: 'lunch', title: 'Lunch & water', icon: 'utensils' },
  { id: 'walk', title: 'Walk outside', icon: 'footprints' },
  { id: 'reply', title: 'Reply to messages', icon: 'mail' },
  { id: 'call', title: 'Call a friend', icon: 'phone' },
  { id: 'bank', title: 'Pay the bills', icon: 'wallet' },
  { id: 'dent', title: 'Book dentist', icon: 'stethoscope' },
  { id: 'gym', title: 'Gym', icon: 'dumbbell' },
];

beforeEach(() => {
  clearEmbeddings();
  calls = 0;
});

describe('fuzzy', () => {
  it('normalises and stems', () => {
    expect(tokens('Lunch & water')).toEqual(['lunch', 'water']);
    expect(tokens("the dog's walking")).toEqual(['dog', 'walk']);
    expect(stem('meds')).toBe('med');
    expect(dice('lunch', 'lunch')).toBe(1);
  });

  it('names part of a title', () => {
    expect(fuzzyScore('lunch', 'Lunch & water')).toBeGreaterThan(0.85);
    expect(fuzzyScore('the walk', 'Walk outside')).toBeGreaterThan(0.85);
    expect(fuzzyScore('meds', 'Morning meds')).toBeGreaterThan(0.85);
    expect(fuzzyScore('deep work', 'Deep work')).toBe(1);
    expect(fuzzyScore('lunch', 'Reply to messages')).toBeLessThan(0.3);
  });

  it('forgives a typo', () => {
    expect(fuzzyScore('lnuch', 'Lunch & water')).toBeGreaterThan(0.3);
    expect(fuzzyScore('walkin', 'Walk outside')).toBeGreaterThan(0.5);
  });
});

describe('ranking and deciding', () => {
  it('picks the one block a word names', async () => {
    const d = decide(await rank('lunch', cands(DAY)));
    expect(d.pick?.item.id).toBe('lunch');
  });

  it('reads meaning from the kind of block, without a model', async () => {
    // "pills" never appears in "Morning meds", but both are the pill icon.
    expect(decide(await rank('pills', cands(DAY))).pick?.item.id).toBe('meds');
    expect(decide(await rank('food', cands(DAY))).pick?.item.id).toBe('lunch');
    expect(decide(await rank('chat with my mate', cands(DAY))).pick?.item.id).toBe('call');
    // Two movement blocks: ask, don't guess.
    const ex = decide(await rank('exercise', cands(DAY)));
    expect(ex.pick).toBeNull();
    expect(ex.options.map((o) => o.item.id).sort()).toEqual(['gym', 'walk']);
  });

  it('does not match words that merely rhyme', async () => {
    expect(fuzzyScore('sleep', 'Deep work')).toBeLessThan(0.3);
    expect(fuzzyScore('workout', 'Deep work')).toBeLessThan(0.5);
  });

  it('two close calls become a choice, not a guess', async () => {
    const d = decide(await rank('call', cands([{ id: 'a', title: 'Call mum' }, { id: 'b', title: 'Call dad' }])));
    expect(d.pick).toBeNull();
    expect(d.options.map((o) => o.item.id).sort()).toEqual(['a', 'b']);
  });

  it('a boost settles a tie toward the block you are in', async () => {
    const xs: Candidate<B>[] = [
      { item: { id: 'a', title: 'Focus' }, text: 'Focus', boost: 0.12 },
      { item: { id: 'b', title: 'Focus' }, text: 'Focus' },
    ];
    expect(decide(await rank('focus', xs)).pick?.item.id).toBe('a');
  });

  it('nothing close → nothing', async () => {
    const d = decide(await rank('spaceship', cands(DAY)));
    expect(d.pick).toBeNull();
    expect(d.options).toEqual([]);
  });

  it('notes and steps count, more weakly than the title', async () => {
    const r = await rank('passport', [
      { item: { id: 'trip', title: 'Pack for the trip' }, text: 'Pack for the trip', extra: 'passport, chargers, socks' },
      { item: { id: 'x', title: 'Laundry' }, text: 'Laundry' },
    ]);
    expect(hits(r).map((h) => h.item.id)).toEqual(['trip']);
  });
});

describe('embeddings (compressed like Needle)', () => {
  it('raw cosines really are compressed', async () => {
    const a = vec('food');
    const b = vec('Lunch & water');
    const c = vec('Reply to messages');
    const cos = (x: Float32Array, y: Float32Array) => x.reduce((s, v, i) => s + v * y[i], 0);
    expect(cos(a, b)).toBeGreaterThan(0.85);
    expect(cos(a, c)).toBeGreaterThan(0.85);
  });

  it('caches by text', async () => {
    await embedText('Lunch', embed);
    await embedText('  lunch ', embed);
    expect(calls).toBe(1);
  });

  it('stays off until the corpus is big enough to judge against', async () => {
    const qv = (await embedText('food', embed))!;
    expect(semanticZ(qv, [vec('Lunch & water')])).toBeNull();
    for (const t of FILLER) await embedText(t, embed);
    expect(corpusSize()).toBeGreaterThanOrEqual(MIN_CORPUS);
    const z = semanticZ(qv, [vec('Lunch & water'), vec('Reply to messages')])!;
    expect(z[0]).toBeGreaterThan(2);
    expect(z[0]).toBeGreaterThan(z[1] + 1.5);
  });

  it('finds a block by meaning once the corpus is warm (a clear outlier only)', async () => {
    for (const t of FILLER) await embedText(t, embed);
    // No word overlap and no concept table entry: only the embedding knows teeth ↔ dentist.
    expect(decide(await rank('teeth', cands(DAY))).pick).toBeNull();
    const r = await rank('teeth', cands(DAY), embed);
    expect(decide(r).pick?.item.id).toBe('dent');
    // Everything else gets no semantic credit at all.
    expect(r.filter((x) => x.semantic !== null).map((x) => x.item.id)).toEqual(['dent']);
  });

  it('only embeds up to maxEmbed candidates', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i), title: `Thing ${i}` }));
    await rank('thing', cands(many), embed, { maxEmbed: 5 });
    expect(calls).toBe(6); // the query + 5
  });

  it('an embedder that fails is treated as absent', async () => {
    const bad = async () => {
      throw new Error('engine unloaded');
    };
    const r = await rank('lunch', cands(DAY), bad);
    expect(r[0].item.id).toBe('lunch');
    expect(r[0].semantic).toBeNull();
  });
});
