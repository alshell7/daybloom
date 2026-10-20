// Live check of Alef's conversation with real AI services and Daybloom's tools, only when
// asked: ALEF_LIVE=1 npx vitest run src/lib/addons/alef/conversation.live.test.ts
// Keys come from .env (never printed).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atMinutes } from '../../engine/time';
import { platform } from '../../platform';
import { clock } from '../../stores/clock.svelte';
import { DEFAULT_SETTINGS, settings } from '../../stores/settings.svelte';
import { taskFile } from '../../stores/tasks.svelte';
import { timerFile } from '../../stores/timer.svelte';
import { view } from '../../stores/view.svelte';
import { alefFile, migrateAlef } from './alef.svelte';
import { answer } from './conversation';
import type { ProviderId } from './llm';

const TODAY = '2026-10-19';
const NOW = atMinutes(TODAY, 10 * 60 + 40);

describe.runIf(process.env.ALEF_LIVE === '1')('alef: live conversation', () => {
  let env: Record<string, string> = {};
  beforeEach(async () => {
    const fs = await import('node:fs');
    env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
    Object.assign(globalThis, { innerWidth: 1200, innerHeight: 800 });
    settings.value = { ...structuredClone(DEFAULT_SETTINGS), clock: '12', addons: { alef: true } };
    timerFile.value.active = null;
    clock.setOffset(NOW - Date.now());
    view.date = view.today;
    view.calendarEvents = [];
    taskFile.value.tasks = [];
    vi.spyOn(platform, 'fetch').mockImplementation((u, i) => fetch(u, i));
  });
  afterEach(() => vi.restoreAllMocks());

  const cases: { provider: ProviderId; model: string; key: () => string; accountId?: () => string }[] = [
    { provider: 'openai', model: 'gpt-5-mini', key: () => env.OPEN_AI_API_KEY },
    { provider: 'openrouter', model: 'anthropic/claude-haiku-5.5', key: () => env.OPENROUTER_API_KEY },
    { provider: 'cloudflare', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', key: () => env.CLOUDFLARE_API_KEY, accountId: () => env.CLOUDFLRE_ACCOUNT_ID },
  ];
  for (const c of cases) {
    it(`plans with ${c.provider}`, async () => {
      alefFile.value = migrateAlef(null);
      alefFile.value.settings.brain = c.provider;
      alefFile.value.settings.configs = { [c.provider]: { model: c.model, ...(c.accountId ? { accountId: c.accountId() } : {}) } };
      alefFile.value.settings.consent = { [c.provider]: Date.now() };
      vi.spyOn(platform.secrets, 'get').mockResolvedValue(c.key());
      const a = await answer('Add a 30 minute walk at 4pm today, please.', { history: [], aiReady: true });
      const walk = taskFile.value.tasks.find((t) => /walk/i.test(t.title));
      console.log(c.provider, a.via, a.feeling, JSON.stringify(a.tools), JSON.stringify(a.text.slice(0, 120)), walk ? `${walk.title} @${walk.start}+${walk.duration}` : 'no block', a.note ?? '');
      expect(a.via).toBe('ai');
      expect(walk?.start).toBe(16 * 60);
    }, 90_000);
  }
});
