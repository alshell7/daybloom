// Live check of generative UI with real AI services, only when asked:
// ALEF_LIVE=1 npx vitest run src/lib/ai/genui/genui.live.test.ts
// Keys come from .env (never printed). Prints each answer's words and UI to judge by eye.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answer } from '../../addons/alef/conversation';
import { alefFile, migrateAlef } from '../../addons/alef/alef.svelte';
import type { ProviderId } from '../../addons/alef/llm';
import { aiFile } from '../hub.svelte';
import { atMinutes } from '../../engine/time';
import { platform } from '../../platform';
import { clock } from '../../stores/clock.svelte';
import { DEFAULT_SETTINGS, settings } from '../../stores/settings.svelte';
import { taskFile, tasks } from '../../stores/tasks.svelte';
import { timerFile } from '../../stores/timer.svelte';
import { view } from '../../stores/view.svelte';
import { checkUi } from './prompt';

const TODAY = '2026-10-19';
const NOW = atMinutes(TODAY, 13 * 60 + 5);

describe.runIf(process.env.ALEF_LIVE === '1')('genui: live answers', () => {
  let env: Record<string, string> = {};
  beforeEach(async () => {
    const fs = await import('node:fs');
    env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
    Object.assign(globalThis, { innerWidth: 1200, innerHeight: 800 });
    settings.value = { ...structuredClone(DEFAULT_SETTINGS), clock: '24', addons: { alef: true } };
    timerFile.value.active = null;
    clock.setOffset(NOW - Date.now());
    view.date = view.today;
    view.calendarEvents = [];
    taskFile.value.tasks = [];
    tasks.create({ title: 'Team standup', date: TODAY, start: 14 * 60, duration: 30, category: 'social', icon: 'video' });
    tasks.create({ title: 'Write the report', date: TODAY, start: 11 * 60, duration: 60, category: 'focus', icon: 'pen' });
    tasks.create({ title: 'Reply to emails', date: null, start: null, duration: 30, list: 'next' });
    tasks.create({ title: 'Book the dentist', date: null, start: null, duration: 15, list: 'next' });
    vi.spyOn(platform, 'fetch').mockImplementation((u, i) => fetch(u, i));
  });
  afterEach(() => vi.restoreAllMocks());

  const cases: { provider: ProviderId; model: string; key: () => string }[] = [
    { provider: 'openai', model: 'gpt-5-mini', key: () => env.OPEN_AI_API_KEY },
    { provider: 'openrouter', model: 'anthropic/claude-haiku-5.5', key: () => env.OPENROUTER_API_KEY },
  ];
  const asks = ['Plan my afternoon, please.', "I can't get started on the report.", 'How much free time do I have left today?'];
  for (const c of cases) {
    for (const q of asks) {
      it(`${c.provider}: ${q}`, async () => {
        alefFile.value = migrateAlef(null);
        aiFile.value.services = { [c.provider]: { model: c.model, consent: Date.now() } };
        aiFile.value.use.alef.think = { via: c.provider };
        vi.spyOn(platform.secrets, 'get').mockResolvedValue(c.key());
        const a = await answer(q, { history: [], aiReady: true });
        console.log(`\n── ${c.provider} · ${q}\n${a.feeling} · ${JSON.stringify(a.tools)}\n${a.text}\n${a.ui ?? '(no UI)'}${a.note ? `\nnote: ${a.note}` : ''}`);
        expect(a.via).toBe('ai');
        expect(a.text).not.toMatch(/```|root\s*=/);
        if (a.ui) expect(checkUi(a.ui)).toBe(a.ui);
      }, 120_000);
    }
  }
});
