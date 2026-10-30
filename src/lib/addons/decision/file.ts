// Decision (addon): what it learned, as stored and synced. Pure, for sync and tests; the model
// and its uses are in decision.svelte.ts.

/** One confirmed answer: the model's vectors for a line, and the option you said was right. */
export interface Example {
  id: string;
  /** The option index (noul: 1 true, 0 false). */
  k: number;
  v: number[];
  z: number[];
  at: number;
}

export interface DecisionFile {
  version: 1;
  /** By question id. */
  examples: Record<string, Example[]>;
  /** Suggestions kept as they were / changed before adding (for the panel). */
  kept: number;
  changed: number;
  /** Ask before adding: always show the suggestion to confirm, or only when it isn't sure. */
  confirm: 'always' | 'unsure';
}

/** Per question, the newest examples kept (each about 2 KB once rounded). */
export const MAX_EXAMPLES = 60;

export function migrateDecision(raw: any): DecisionFile {
  const examples: Record<string, Example[]> = {};
  for (const [q, list] of Object.entries(raw?.examples ?? {})) {
    if (!Array.isArray(list)) continue;
    const ok = list
      .filter((e: any) => e && typeof e.id === 'string' && Number.isInteger(e.k) && Array.isArray(e.v) && Array.isArray(e.z) && e.v.every(Number.isFinite))
      .map((e: any) => ({ id: e.id, k: e.k, v: e.v, z: e.z, at: Number(e.at) || 0 }));
    if (ok.length) examples[q] = ok.slice(-MAX_EXAMPLES);
  }
  return {
    version: 1,
    examples,
    kept: Math.max(0, Number(raw?.kept) || 0),
    changed: Math.max(0, Number(raw?.changed) || 0),
    confirm: raw?.confirm === 'unsure' ? 'unsure' : 'always',
  };
}

/** Two devices' lessons: every example from both (by id), newest kept; counts and choice as is. */
export function mergeDecisionFiles(base: DecisionFile | null, local: DecisionFile, remote: DecisionFile): DecisionFile {
  const examples: Record<string, Example[]> = {};
  for (const q of new Set([...Object.keys(local.examples), ...Object.keys(remote.examples)])) {
    const seen = new Map<string, Example>();
    for (const e of [...(remote.examples[q] ?? []), ...(local.examples[q] ?? [])]) if (!seen.has(e.id)) seen.set(e.id, e);
    // An example forgotten on one side since the base ("Forget what it learned") stays forgotten.
    const gone = new Set((base?.examples[q] ?? []).map((e) => e.id).filter((id) => !local.examples[q]?.some((e) => e.id === id) || !remote.examples[q]?.some((e) => e.id === id)));
    const list = [...seen.values()].filter((e) => !gone.has(e.id)).sort((a, z) => a.at - z.at || (a.id < z.id ? -1 : 1));
    if (list.length) examples[q] = list.slice(-MAX_EXAMPLES);
  }
  const confirm = local.confirm === remote.confirm ? local.confirm : base && local.confirm === base.confirm ? remote.confirm : local.confirm;
  return { version: 1, examples, kept: Math.max(local.kept, remote.kept), changed: Math.max(local.changed, remote.changed), confirm };
}

export const decisionUnused = (f: DecisionFile) => !Object.keys(f.examples).length && !f.kept && !f.changed && f.confirm === 'always';

