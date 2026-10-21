// With an AI brain, Alef can say its own moments in its own words: the morning hello, a block
// starting, a check-in, a win, a fresh start. The built-in line is always ready; the AI is asked
// for a better one with a short deadline, a small daily budget and a quiet spell between asks,
// so it stays cheap and never makes Alef slow to react. The face reacts at once either way.

import { agenda } from '../../ai/agenda';
import { ai } from '../../ai/hub.svelte';
import { formatTime, isoOf } from '../../engine/time';
import { platform } from '../../platform';
import { clock } from '../../stores/clock.svelte';
import { view } from '../../stores/view.svelte';
import { alefFile } from './alef.svelte';
import type { BehaviorId } from './behaviors';
import { UNKIND } from './coach';
import { chatOnce, splitFeeling } from './llm';
import { FEELINGS, momentPrompt } from './persona';

/** Moments worth an AI-written line, in plain words for the prompt. */
export const MUSED: Record<string, string> = {
  greet: 'the first hello of the day',
  welcomeBack: 'they came back to the computer after a while away',
  blockStart: 'one of their blocks is starting now',
  checkIn: 'one of their blocks just ended and is not ticked yet',
  manyMissed: 'several of today\'s blocks ended without a tick; offer a gentle fresh start',
  stuck: 'they seem stuck at the start of a block (no activity for a while)',
  allDone: 'every block today is done',
  bigDone: 'they finished a long block',
  focusEnd: 'a focus session just ended',
  milestone: 'a friendship milestone: days spent together',
  gap: 'a free gap opened and something from the backlog fits',
};

const BUDGET = 16;
const SPELL_MS = 6 * 60_000;
const DEADLINE_MS = 4500;
let spent = { day: '', n: 0, last: 0 };

/** Can Alef ask its brain for this moment now? (Always for the big ones, else within the budget.) */
export function canMuse(moment: string, now = Date.now()): boolean {
  const s = alefFile.value.settings;
  if (!MUSED[moment] || !s.proactive || s.chattiness === 'quiet' || !ai.ready('alef', 'think')) return false;
  const day = isoOf(now);
  if (spent.day !== day) spent = { day, n: 0, last: 0 };
  const big = moment === 'greet' || moment === 'allDone' || moment === 'milestone';
  return spent.n < BUDGET && (big || now - spent.last > SPELL_MS);
}

/** An AI-written line for a moment, or null (not set up, too slow, or not kind enough). */
export async function muse(o: { moment: string; fallback: string; offers: string[]; feeling: BehaviorId }): Promise<{ text: string; feeling: BehaviorId | null } | null> {
  if (!canMuse(o.moment)) return null;
  spent = { ...spent, n: spent.n + 1, last: Date.now() };
  const conn = await ai.connection('alef', 'think');
  if (!conn) return null;
  const s = alefFile.value.settings;
  let day: string | null = null;
  try {
    day = agenda(clock.now, { backlog: 4 });
  } catch {
    day = null;
  }
  const prompt = momentPrompt({
    moment: MUSED[o.moment],
    fallback: o.fallback,
    offers: o.offers,
    agenda: day,
    you: s.you,
    bond: { days: alefFile.value.bond.days.length },
    now: formatTime(clock.now, view.hour12),
    feeling: o.feeling,
  });
  try {
    const r = await Promise.race([
      chatOnce(conn.config, conn.key, [{ role: 'system', content: prompt }, { role: 'user', content: 'Say your line now.' }], null, (u, i) => platform.fetch(u, i), 90),
      new Promise<null>((done) => setTimeout(() => done(null), DEADLINE_MS)),
    ]);
    if (!r) return null;
    const { feeling, text } = splitFeeling(r.content, FEELINGS);
    const line = text.replace(/^["“]|["”]$/g, '').trim();
    if (!line || line.length > 220 || UNKIND.test(line)) return null;
    return { text: line, feeling: (feeling as BehaviorId | null) ?? null };
  } catch {
    return null;
  }
}
