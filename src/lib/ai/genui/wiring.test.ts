import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answer } from '../../addons/alef/conversation';
import { alefFile, migrateAlef } from '../../addons/alef/alef.svelte';
import { aiRespond } from '../../assistant/aiAnswer';
import { atMinutes } from '../../engine/time';
import { platform } from '../../platform';
import { clock } from '../../stores/clock.svelte';
import { DEFAULT_SETTINGS, settings } from '../../stores/settings.svelte';
import { taskFile } from '../../stores/tasks.svelte';
import { view } from '../../stores/view.svelte';
import { aiFile } from '../hub.svelte';

const NOW = atMinutes('2026-10-19', 13 * 60);
const UI = 'root = Stack([c])\nc = Choices(["Make it lighter", "Add a break"])';
const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('genui: AI answers carry their UI apart from the words', () => {
  let says = '';
  let sent: { messages: { role: string; content: string }[] } | null = null;
  beforeEach(() => {
    settings.value = { ...structuredClone(DEFAULT_SETTINGS), addons: { alef: true } };
    clock.setOffset(NOW - Date.now());
    view.date = view.today;
    taskFile.value.tasks = [];
    alefFile.value = migrateAlef(null);
    aiFile.value.services = { openai: { model: 'gpt-5-mini', consent: Date.now() } };
    aiFile.value.use.alef.think = { via: 'openai' };
    aiFile.value.use.assistant.think = { via: 'openai' };
    vi.spyOn(platform.secrets, 'get').mockResolvedValue('k');
    vi.spyOn(platform, 'fetch').mockImplementation(async (_u, init) => {
      sent = JSON.parse(String(init?.body));
      return reply(says);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('Alef speaks the words and keeps the UI', async () => {
    says = `[happy] Two ideas for your afternoon.\n\n\`\`\`openui\n${UI}\n\`\`\``;
    const a = await answer('Plan my afternoon', { history: [], aiReady: true });
    expect(a).toMatchObject({ via: 'ai', feeling: 'happy', text: 'Two ideas for your afternoon.', ui: UI });
    // The model was taught the components and how to write them.
    expect(sent!.messages[0].content).toContain('PlanProposal(items: PlanItem[]');
    expect(sent!.messages[0].content).toContain('feeling tag');
  });

  it('Alef drops UI that would draw nothing and keeps only the words', async () => {
    says = '[curious] Hmm, let me think.\n```openui\nroot = Stack([Nope("x")])\n```';
    const a = await answer('Plan my afternoon', { history: [], aiReady: true });
    expect(a.text).toBe('Hmm, let me think.');
    expect(a.ui).toBeUndefined();
  });

  it('Ask Daybloom answers with words, a note card and the UI', async () => {
    says = `Here are two ideas.\n\`\`\`openui\n${UI}\n\`\`\``;
    const r = await aiRespond('Plan my afternoon', [], clock.now);
    expect(r).toMatchObject({ say: 'Here are two ideas.', card: { kind: 'note' }, ui: UI });
    expect(sent!.messages[0].content).toContain('Ask Daybloom');
    expect(sent!.messages[0].content).not.toContain('feeling tag');
  });
});
