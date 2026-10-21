// Live check of Reality check and Make it smaller with a real AI service, only when asked:
// ALEF_LIVE=1 npx vitest run src/lib/addons/reality/practical.live.test.ts
// Keys come from .env (never printed).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { platform } from '../../platform';
import { aiFile, ai, DEFAULT_AI } from '../../ai/hub.svelte';
import { chatOnce } from '../../ai/providers';
import { estimatePrompt, parseEstimate, parseTips, tipsPrompt } from './aiReality';
import { parseSteps, splitPrompt } from '../smaller/aiSplit';
import { parseStep, startPrompt } from '../../starter';
import type { Sample } from './reality';

const s = (title: string, planned: number, actual: number, at: number): Sample => ({ id: `${title}@${at}`, taskId: title, title, category: 'focus', icon: 'pen', planned, actual, source: 'focus', at });
const SAMPLES = [s('Write the grant report', 60, 95, 1), s('Write the grant report', 60, 80, 2), s('Reply to emails', 30, 50, 3), s('Reply to emails', 30, 45, 4), s('Code review', 45, 40, 5)];

describe.runIf(process.env.ALEF_LIVE === '1')('reality and smaller: live', () => {
  let key = '';
  beforeEach(async () => {
    const fs = await import('node:fs');
    const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
    key = env.OPEN_AI_API_KEY;
    aiFile.value = structuredClone(DEFAULT_AI);
    vi.spyOn(platform, 'fetch').mockImplementation((u, i) => fetch(u, i));
    void ai;
  });
  const cfg = { provider: 'openai' as const, model: 'gpt-5-mini' };
  const run = async (p: { system: string; user: string }, n: number) => (await chatOnce(cfg, key, [{ role: 'system', content: p.system }, { role: 'user', content: p.user }], null, (u, i) => fetch(u, i), n)).content;

  it('estimates a realistic length', async () => {
    const out = parseEstimate(await run(estimatePrompt({ title: 'Write the grant report', notes: 'Budget section and summary', minutes: 60, category: 'focus', samples: SAMPLES }), 300));
    console.log('estimate', JSON.stringify(out));
    expect(out?.minutes).toBeGreaterThan(60);
  }, 90_000);

  it('gives practical tips with real actions', async () => {
    const today = [{ key: 'task:mail@2026-10-21', title: 'Reply to emails', start: '15:00', planned: 30, usual: 48 }, { key: 'task:grant@2026-10-21', title: 'Write the grant report', start: '16:00', planned: 60, usual: 88 }];
    const raw = await run(tipsPrompt({ samples: SAMPLES, today, freeMin: 20, recurring: ['Reply to emails'] }), 700);
    const out = parseTips(raw, { keys: today.map((t) => t.key), recurring: ['Reply to emails'] });
    console.log('tips', out ? JSON.stringify(out, null, 1) : `unusable: ${raw.slice(0, 1500)}`);
    expect(out?.tips.length).toBeGreaterThan(0);
  }, 90_000);

  it('finds a tiny first step for blocks that have not started', async () => {
    const cases = [
      { title: 'Write the grant report', notes: 'Budget section and summary still missing', category: 'focus' as const, minutes: 60 },
      { title: 'Clean the kitchen', category: 'routine' as const, minutes: 30 },
      { title: 'Call the bank about the card', category: 'social' as const, minutes: 20 },
      { title: 'Prepare slides for Monday', notes: 'Q3 numbers, 8 slides', category: 'focus' as const, minutes: 90 },
    ];
    for (const c of cases) {
      const out = parseStep(await run(startPrompt({ ...c, leftMin: c.minutes - 6, sinceMin: 6 }), 200));
      console.log('first step', c.title, '→', JSON.stringify(out));
      expect(out?.step.length).toBeGreaterThan(5);
    }
  }, 120_000);

  it('makes a task smaller, fitting the time and its notes', async () => {
    const out = parseSteps(await run(splitPrompt({ title: 'Write the grant report', notes: 'Budget section and summary still missing', minutes: 45, until: { minutes: 50, what: 'Team call' }, reality: 'this same task usually takes 145% of what is planned', existing: [{ title: 'Open the template', done: true }] }), 700), 45);
    console.log('steps', JSON.stringify(out, null, 1));
    expect(out?.steps.length).toBeGreaterThanOrEqual(3);
  }, 90_000);
});
