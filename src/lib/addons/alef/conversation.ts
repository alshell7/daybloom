// One turn of talking with Alef. Small talk Alef answers itself. With an AI brain set up (and
// agreed to), the words go to it with Daybloom's tools (the same careful ones AI apps use
// through MCP), and today's plan. Without one, or when it can't be reached, Alef answers on
// this device with the planner's own assistant (Needle when downloaded) and shows its card.

import type { Call, ToolResult } from '../../assistant/tools';
import type { Entry } from '../../assistant/session.svelte';
import { activeTimeZone, formatTime, fromISODate, isoOf } from '../../engine/time';
import { platform } from '../../platform';
import { clock } from '../../stores/clock.svelte';
import { view } from '../../stores/view.svelte';
import { availableTools, callTool, MCP_TOOLS } from '../mcp/tools';
import { alefFile, keyAccount, type Msg } from './alef.svelte';
import type { BehaviorId } from './behaviors';
import { converse, LlmError, providerOf, splitFeeling, type ChatMessage } from './llm';
import { FEELINGS, smallTalk, systemPrompt } from './persona';

export interface Answer {
  text: string;
  feeling: BehaviorId;
  entry?: Entry;
  tools?: string[];
  via: 'ai' | 'device';
  error?: boolean;
  /** Why the AI brain didn't answer this time. */
  note?: string;
  thanks?: boolean;
}

let entrySeq = 0;

/** How a planner answer feels. */
export function feelingOfResult(r: ToolResult): BehaviorId {
  const c = r.card;
  if (c.kind === 'choice') return 'confused';
  if (c.kind === 'help') return 'curious';
  if (c.kind === 'block') return c.verb === 'done' ? 'delighted' : c.verb === 'already' ? 'pleased' : 'happy';
  if (c.kind === 'streaks' || c.kind === 'summary' || c.kind === 'week') return 'proud';
  if (c.kind === 'breathe' || c.kind === 'winddown') return 'content';
  if (c.kind === 'note' && c.icon === 'x') return 'frustrated';
  return 'pleased';
}

async function onDevice(text: string): Promise<Answer> {
  const [{ session }, { respond }] = await Promise.all([import('../../assistant/session.svelte'), import('../../assistant/brain')]);
  session.open();
  const engine = session.engine && session.engine.status === 'ready' ? session.engine : null;
  const r = await respond(text, engine, clock.now);
  // Alef says the line itself; the card shows only what goes with it.
  const entry: Entry = { id: -++entrySeq, query: text, at: clock.now, pending: false, slow: false, result: { ...r.result, say: '' }, route: r.route, undone: false };
  return { text: r.result.say, feeling: feelingOfResult(r.result), entry, via: 'device' };
}

/** Run a call a card offered ("Did you mean…"), on this device. */
export async function runCall(call: Call, label: string): Promise<Answer> {
  const [{ session }, { execute }] = await Promise.all([import('../../assistant/session.svelte'), import('../../assistant/brain')]);
  const engine = session.engine && session.engine.status === 'ready' ? session.engine : null;
  const result = await execute(call, engine, clock.now, label);
  const entry: Entry = { id: -++entrySeq, query: label, at: clock.now, pending: false, slow: false, result: { ...result, say: '' }, route: null, undone: false };
  return { text: result.say, feeling: feelingOfResult(result), entry, via: 'device' };
}

function dayJson(): string | null {
  try {
    const t = MCP_TOOLS.find((x) => x.name === 'get_day');
    const out = t?.run({}, { now: clock.now, changed: () => {} });
    const s = JSON.stringify(out);
    return s.length > 9000 ? s.slice(0, 9000) : s;
  } catch {
    return null;
  }
}

async function withAi(text: string, history: Msg[]): Promise<Answer> {
  const s = alefFile.value.settings;
  if (s.brain === 'local') throw new LlmError('No AI brain chosen.');
  const provider = s.brain;
  const config = { provider, model: '', ...(s.configs[provider] ?? {}) };
  const key = (await platform.secrets.get(keyAccount(provider))) ?? '';
  const today = isoOf(clock.now);
  const tools = availableTools(s.mayChange);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: systemPrompt({
        now: formatTime(clock.now, view.hour12),
        date: today,
        weekday: fromISODate(today).toLocaleDateString('en', { weekday: 'long' }),
        zone: activeTimeZone(),
        hour12: view.hour12,
        mayChange: s.mayChange,
        day: dayJson(),
      }),
    },
    ...history.filter((m) => m.text && !m.error).map((m): ChatMessage => ({ role: m.who === 'you' ? 'user' : 'assistant', content: m.text })),
    { role: 'user', content: text },
  ];
  const out = await converse({
    config,
    key,
    messages,
    tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })),
    runTool: (name, args) => {
      const r = callTool(tools, name, args, {
        now: clock.now,
        changed: (did, undo) => view.say(`Alef ${did}`, { label: 'Undo', run: undo }, 7000),
      });
      return r.content.map((c) => c.text).join('\n');
    },
    fetchFn: (url, init) => platform.fetch(url, init),
  });
  const { feeling, text: words } = splitFeeling(out.text, FEELINGS);
  return {
    text: words || 'Done.',
    feeling: (feeling as BehaviorId | null) ?? (out.toolsUsed.length ? 'happy' : 'pleased'),
    tools: out.toolsUsed,
    via: 'ai',
  };
}

export async function answer(text: string, o: { history: Msg[]; aiReady: boolean }): Promise<Answer> {
  const hour = new Date(clock.now).getHours();
  const st = smallTalk(text, { hour, seed: Math.floor(clock.now / 1000) });
  if (st) return { text: st.say, feeling: st.feeling, via: 'device', thanks: st.thanks };
  if (o.aiReady) {
    try {
      return await withAi(text, o.history);
    } catch (e) {
      const why = e instanceof LlmError ? e.message : `Couldn't reach ${providerOf(alefFile.value.settings.brain as never)?.name ?? 'the AI'}.`;
      const local = await onDevice(text);
      return { ...local, note: `${why} I answered on this device instead.` };
    }
  }
  return onDevice(text);
}
