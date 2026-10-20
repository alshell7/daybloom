// Alef's optional AI brain: any OpenAI-compatible chat endpoint. Presets for OpenAI,
// Anthropic, Gemini, OpenRouter and Cloudflare Workers AI (which needs an account id), or a
// custom endpoint with its own headers. Models are listed from the provider where it can say,
// with a few good suggestions. Tool calls run Daybloom's own tools (the MCP addon's), so Alef
// can read and change your day the same careful way, with Undo. `fetchFn` is injected.

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'cloudflare' | 'custom';

export interface LlmConfig {
  provider: ProviderId;
  model: string;
  /** Cloudflare's account id. */
  accountId?: string;
  /** Custom: the base URL (…/v1). */
  baseUrl?: string;
  /** Custom: extra headers (e.g. an organisation id). */
  headers?: Record<string, string>;
}

export interface Provider {
  id: ProviderId;
  name: string;
  /** Where to get a key. */
  keyUrl: string;
  keyHint: string;
  suggested: string[];
  needsAccount?: boolean;
}

export const PROVIDERS: Provider[] = [
  { id: 'openai', name: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'sk-…', suggested: ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.5'] },
  { id: 'anthropic', name: 'Anthropic', keyUrl: 'https://console.anthropic.com/settings/keys', keyHint: 'sk-ant-…', suggested: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] },
  { id: 'gemini', name: 'Gemini', keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'AIza…', suggested: ['gemini-3.8-flash', 'gemini-3.7-flash'] },
  { id: 'openrouter', name: 'OpenRouter', keyUrl: 'https://openrouter.ai/keys', keyHint: 'sk-or-…', suggested: ['anthropic/claude-haiku-5.5', 'google/gemini-3.8-flash', 'openai/gpt-5-mini'] },
  { id: 'cloudflare', name: 'Cloudflare', keyUrl: 'https://dash.cloudflare.com/profile/api-tokens', keyHint: 'API token with Workers AI', suggested: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/openai/gpt-oss-120b', '@cf/qwen/qwen3-30b-a3b-fp8'], needsAccount: true },
  { id: 'custom', name: 'Custom', keyUrl: '', keyHint: 'Your key (if it needs one)', suggested: [] },
];

export const providerOf = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!;

/** The OpenAI-compatible base URL (…/v1) for a config, or null when it's incomplete. */
export function baseUrl(c: LlmConfig): string | null {
  switch (c.provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta/openai';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'cloudflare': {
      const a = c.accountId?.trim();
      return a && /^[a-f0-9]{16,64}$/i.test(a) ? `https://api.cloudflare.com/client/v4/accounts/${a}/ai/v1` : null;
    }
    case 'custom': {
      const u = c.baseUrl?.trim().replace(/\/+$/, '');
      return u && /^https?:\/\//i.test(u) ? u : null;
    }
  }
}

function headersFor(c: LlmConfig, key: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) h.Authorization = `Bearer ${key}`;
  if (c.provider === 'anthropic' && key) {
    h['x-api-key'] = key;
    h['anthropic-version'] = '2023-06-01';
  }
  if (c.provider === 'openrouter') {
    h['HTTP-Referer'] = 'https://github.com/alshell7/daybloom';
    h['X-Title'] = 'Daybloom';
  }
  if (c.provider === 'custom') for (const [k, v] of Object.entries(c.headers ?? {})) if (k.trim() && /^[\w-]+$/.test(k.trim())) h[k.trim()] = String(v);
  return h;
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Models the provider offers, newest-looking first; falls back to suggestions. */
export async function listModels(c: LlmConfig, key: string, fetchFn: FetchFn): Promise<string[]> {
  const base = baseUrl(c);
  if (!base) return providerOf(c.provider).suggested;
  try {
    let url = `${base}/models`;
    if (c.provider === 'cloudflare') url = base.replace(/\/ai\/v1$/, '/ai/models/search?task=Text%20Generation&per_page=100');
    const r = await fetchFn(url, { headers: headersFor(c, key) });
    if (!r.ok) return providerOf(c.provider).suggested;
    const j: any = await r.json();
    const raw: string[] = (j.data ?? j.result ?? j.models ?? []).map((m: any) => String(m.id ?? m.name ?? '').replace(/^models\//, '')).filter(Boolean);
    // Chat models only: leave out embeddings, audio, image and moderation models.
    const chat = raw.filter((m) => !/(embed|whisper|tts|audio|transcribe|dall-e|image|moderation|realtime|search|vision-preview|guard|lora|clip|rerank)/i.test(m));
    const unique = [...new Set(chat)];
    const sugg = providerOf(c.provider).suggested.filter((m) => unique.includes(m));
    return [...sugg, ...unique.filter((m) => !sugg.includes(m)).sort()];
  } catch {
    return providerOf(c.provider).suggested;
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

/** Reasoning models need their own token setting and work best with little thinking. */
function tokenFields(c: LlmConfig, n: number): Record<string, unknown> {
  const m = c.model.toLowerCase();
  if (c.provider === 'openai' && /^(gpt-5|o\d)/.test(m)) return { max_completion_tokens: n * 4, reasoning_effort: 'minimal' };
  return { max_tokens: n };
}

/** One chat round. Returns the reply text and any tool calls. */
export async function chatOnce(c: LlmConfig, key: string, messages: ChatMessage[], tools: ToolSpec[] | null, fetchFn: FetchFn, maxTokens = 500): Promise<{ content: string; toolCalls: NonNullable<ChatMessage['tool_calls']> }> {
  const base = baseUrl(c);
  if (!base) throw new LlmError('This provider needs a little more setup (an account id or an address).');
  if (!c.model.trim()) throw new LlmError('Pick a model first.');
  const body: Record<string, unknown> = { model: c.model.trim(), messages, ...tokenFields(c, maxTokens) };
  if (tools?.length) {
    body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    body.tool_choice = 'auto';
  }
  let r: Response;
  try {
    r = await fetchFn(`${base}/chat/completions`, { method: 'POST', headers: headersFor(c, key), body: JSON.stringify(body) });
  } catch (e) {
    throw new LlmError(`Couldn't reach ${providerOf(c.provider).name}. Are you online?`);
  }
  const text = await r.text();
  let j: any = null;
  try {
    j = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!r.ok) {
    const msg = j?.error?.message ?? j?.errors?.[0]?.message ?? j?.message ?? text.slice(0, 200);
    if (r.status === 401 || r.status === 403) throw new LlmError(`${providerOf(c.provider).name} didn't accept the key.`, r.status);
    if (r.status === 404) throw new LlmError(`${providerOf(c.provider).name} doesn't know the model “${c.model}”.`, r.status);
    if (r.status === 429) throw new LlmError(`${providerOf(c.provider).name} says: too many requests right now.`, r.status);
    throw new LlmError(`${providerOf(c.provider).name}: ${String(msg).slice(0, 200)}`, r.status);
  }
  const m = j?.choices?.[0]?.message ?? j?.result?.choices?.[0]?.message ?? {};
  const content = typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((x: any) => x?.text ?? '').join('') : (j?.result?.response ?? '');
  const toolCalls = (m.tool_calls ?? []).filter((t: any) => t?.function?.name).map((t: any, i: number) => ({ id: String(t.id ?? `call_${i}`), type: 'function' as const, function: { name: t.function.name, arguments: typeof t.function.arguments === 'string' ? t.function.arguments : JSON.stringify(t.function.arguments ?? {}) } }));
  return { content: String(content ?? ''), toolCalls };
}

/**
 * A conversation turn with tools: ask, run the tools it calls (up to `maxRounds`), ask
 * again with their results, and return the final words. If the endpoint refuses tools, it
 * asks once more without them.
 */
export async function converse(o: {
  config: LlmConfig;
  key: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  runTool: (name: string, args: unknown) => Promise<string> | string;
  fetchFn: FetchFn;
  maxRounds?: number;
}): Promise<{ text: string; toolsUsed: string[] }> {
  const msgs = [...o.messages];
  const used: string[] = [];
  let tools: ToolSpec[] | null = o.tools.length ? o.tools : null;
  for (let round = 0; round <= (o.maxRounds ?? 4); round++) {
    let res;
    try {
      res = await chatOnce(o.config, o.key, msgs, round < (o.maxRounds ?? 4) ? tools : null, o.fetchFn);
    } catch (e) {
      // Some models can't take tools: try once more with words only.
      if (tools && e instanceof LlmError && e.status === 400) {
        tools = null;
        res = await chatOnce(o.config, o.key, msgs, null, o.fetchFn);
      } else throw e;
    }
    if (!res.toolCalls.length) return { text: res.content.trim(), toolsUsed: used };
    // Some endpoints (Cloudflare) want text here, never null.
    msgs.push({ role: 'assistant', content: res.content || '', tool_calls: res.toolCalls });
    for (const call of res.toolCalls) {
      let args: unknown = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }
      used.push(call.function.name);
      const out = await o.runTool(call.function.name, args);
      msgs.push({ role: 'tool', tool_call_id: call.id, content: out.slice(0, 6000) });
    }
  }
  return { text: 'I did what I could; have a look at your day.', toolsUsed: used };
}

/** "[happy] Sure!" → { feeling: 'happy', text: 'Sure!' } (the tag tells Alef's face how to look). */
export function splitFeeling(reply: string, known: string[]): { feeling: string | null; text: string } {
  const m = /^\s*\[([a-z-]+)\]\s*/i.exec(reply);
  if (m && known.includes(m[1].toLowerCase())) return { feeling: m[1].toLowerCase(), text: reply.slice(m[0].length).trim() };
  return { feeling: null, text: reply.trim() };
}
