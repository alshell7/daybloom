import { describe, expect, it, vi } from 'vitest';
import { baseUrl, chatOnce, converse, listModels, LlmError, splitFeeling, type FetchFn } from './llm';

const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('alef: AI providers', () => {
  it('knows each provider’s address', () => {
    expect(baseUrl({ provider: 'openai', model: 'x' })).toBe('https://api.openai.com/v1');
    expect(baseUrl({ provider: 'gemini', model: 'x' })).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    expect(baseUrl({ provider: 'cloudflare', model: 'x', accountId: '0123456789abcdef0123456789abcdef' })).toBe('https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/v1');
    expect(baseUrl({ provider: 'cloudflare', model: 'x' })).toBeNull();
    expect(baseUrl({ provider: 'custom', model: 'x', baseUrl: 'http://localhost:11434/v1/' })).toBe('http://localhost:11434/v1');
    expect(baseUrl({ provider: 'custom', model: 'x', baseUrl: 'ftp://x' })).toBeNull();
  });

  it('lists chat models, suggestions first', async () => {
    const f: FetchFn = vi.fn(async () => res(200, { data: [{ id: 'text-embedding-3' }, { id: 'gpt-5-mini' }, { id: 'gpt-4.1' }, { id: 'whisper-1' }] }));
    expect(await listModels({ provider: 'openai', model: '' }, 'k', f)).toEqual(['gpt-5-mini', 'gpt-4.1']);
    const down: FetchFn = async () => res(500, {});
    expect(await listModels({ provider: 'anthropic', model: '' }, 'k', down)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
  });

  it('asks the right way: reasoning models get their own token field; keys go in the header', async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => res(200, { choices: [{ message: { content: '[happy] Hi!' } }] }));
    const r = await chatOnce({ provider: 'openai', model: 'gpt-5-mini' }, 'secret', [{ role: 'user', content: 'hi' }], null, f);
    expect(r.content).toBe('[happy] Hi!');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(String(init!.body));
    expect(body.max_completion_tokens).toBeGreaterThan(0);
    expect(body.reasoning_effort).toBe('minimal');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });

  it('turns errors into plain words', async () => {
    const bad: FetchFn = async () => res(401, { error: { message: 'Invalid key' } });
    await expect(chatOnce({ provider: 'openrouter', model: 'm' }, 'k', [], null, bad)).rejects.toThrow("OpenRouter didn't accept the key.");
    const missing: FetchFn = async () => res(404, { error: { message: 'no' } });
    await expect(chatOnce({ provider: 'gemini', model: 'nope' }, 'k', [], null, missing)).rejects.toBeInstanceOf(LlmError);
  });

  it('runs tools and answers with their results; drops tools when the model refuses them', async () => {
    let n = 0;
    const f: FetchFn = vi.fn(async (_u, init) => {
      n++;
      const body = JSON.parse(String(init!.body));
      if (n === 1) return res(200, { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'get_day', arguments: '{"date":"today"}' } }] } }] });
      expect(body.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
      return res(200, { choices: [{ message: { content: '[pleased] You have 3 blocks.' } }] });
    });
    const runTool = vi.fn(() => '{"blocks":3}');
    const out = await converse({ config: { provider: 'openai', model: 'gpt-5-mini' }, key: 'k', messages: [{ role: 'user', content: 'my day?' }], tools: [{ name: 'get_day', description: 'd', parameters: { type: 'object' } }], runTool, fetchFn: f });
    expect(out).toEqual({ text: '[pleased] You have 3 blocks.', toolsUsed: ['get_day'] });
    expect(runTool).toHaveBeenCalledWith('get_day', { date: 'today' });

    let m = 0;
    const noTools: FetchFn = async (_u, init) => {
      m++;
      const body = JSON.parse(String(init!.body));
      if (body.tools) return res(400, { error: { message: 'tools not supported' } });
      return res(200, { choices: [{ message: { content: 'Plain answer' } }] });
    };
    expect((await converse({ config: { provider: 'cloudflare', model: '@cf/x', accountId: '0123456789abcdef0123456789abcdef' }, key: 'k', messages: [], tools: [{ name: 't', description: '', parameters: {} }], runTool, fetchFn: noTools })).text).toBe('Plain answer');
    expect(m).toBe(2);
  });

  it('reads the feeling tag', () => {
    expect(splitFeeling('[happy] Sure thing!', ['happy'])).toEqual({ feeling: 'happy', text: 'Sure thing!' });
    expect(splitFeeling('[nope] Hi', ['happy'])).toEqual({ feeling: null, text: '[nope] Hi' });
  });
});

// Live check against real providers, only when asked: ALEF_LIVE=1 npx vitest run src/lib/addons/alef/llm.test.ts
describe.runIf(process.env.ALEF_LIVE === '1')('alef: live providers', () => {
  it('answers through each configured provider', async () => {
    const fs = await import('node:fs');
    const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
    const tries = [
      { config: { provider: 'openai' as const, model: 'gpt-5-mini' }, key: env.OPEN_AI_API_KEY },
      { config: { provider: 'openrouter' as const, model: 'anthropic/claude-haiku-5.5' }, key: env.OPENROUTER_API_KEY },
      { config: { provider: 'cloudflare' as const, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', accountId: env.CLOUDFLRE_ACCOUNT_ID }, key: env.CLOUDFLARE_API_KEY },
    ];
    for (const t of tries) {
      const tool = { name: 'get_day', description: "Read the person's day.", parameters: { type: 'object', properties: {}, additionalProperties: false } };
      const out = await converse({ ...t, messages: [{ role: 'system', content: 'You are Alef. Start with a feeling tag like [happy]. Use get_day to answer.' }, { role: 'user', content: 'How many blocks do I have today?' }], tools: [tool], runTool: () => '{"blocks":[{"title":"Deep work"},{"title":"Lunch"}]}', fetchFn: fetch });
      console.log(t.config.provider, JSON.stringify(out).slice(0, 160));
      expect(out.text.length).toBeGreaterThan(0);
    }
  }, 90_000);
});

describe('alef: feelings as a reply goes', async () => {
  const { beatsOf } = await import('./llm');
  it('finds each feeling and where it starts', () => {
    const r = beatsOf('[curious] Let me look… [happy] Found a free hour at 3pm!', ['curious', 'happy']);
    expect(r.text).toBe('Let me look… Found a free hour at 3pm!');
    expect(r.beats.map((b) => b.feeling)).toEqual(['curious', 'happy']);
    expect(r.beats[0].at).toBe(0);
    expect(r.beats[1].at).toBeGreaterThan(0.25);
    expect(beatsOf('No tags here.', ['happy'])).toEqual({ text: 'No tags here.', beats: [] });
    expect(beatsOf('[happy] Sure [nope] thing', ['happy']).text).toBe('Sure [nope] thing');
  });
});
