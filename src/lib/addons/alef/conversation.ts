// One turn of talking with Alef. Small talk Alef answers itself. With an AI service chosen for
// Alef in Settings › AI (set up and agreed to), the words go to it with Daybloom's tools (the
// same careful ones AI apps use through MCP) and the day in plain lines (lib/ai/agenda.ts).
// Without one, or when it can't be reached, Alef answers on this device with the planner's own
// assistant (Needle when downloaded) and shows its card. An AI answer may end with a small
// generative UI (lib/ai/genui/): the words are what Alef says, the UI is drawn under them.

import type { Call, ToolResult } from '../../assistant/tools';
import type { Entry } from '../../assistant/session.svelte';
import { activeTimeZone, formatTime, fromISODate, isoOf } from '../../engine/time';
import { agenda } from '../../ai/agenda';
import { splitUi } from '../../ai/genui/fence';
import { ai } from '../../ai/hub.svelte';
import { platform } from '../../platform';
import { clock } from '../../stores/clock.svelte';
import { view } from '../../stores/view.svelte';
import { availableTools, callTool } from '../mcp/tools';
import { alefFile, type Msg } from './alef.svelte';
import type { BehaviorId } from './behaviors';
import type { Offer } from './coach';
import { beatsOf, converse, LlmError, providerOf, type ChatMessage } from './llm';
import { FEELINGS, smallTalk, systemPrompt } from './persona';

export interface Answer {
  text: string;
  feeling: BehaviorId;
  /** Later feelings as the words go on (0..1 of the text). */
  beats?: { at: number; feeling: BehaviorId }[];
  /** Buttons under the answer (Alef's helping hand). */
  offers?: Offer[];
  entry?: Entry;
  tools?: string[];
  via: 'ai' | 'device';
  error?: boolean;
  /** Why the AI brain didn't answer this time. */
  note?: string;
  thanks?: boolean;
  /** The AI's generative UI (OpenUI Lang), drawn under the words. */
  ui?: string;
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

/** What a tool is doing, in a few words, while Alef waits for it. */
export const TOOL_WORDS: Record<string, string> = {
  get_day: 'Looking at your day…',
  list_blocks: 'Looking through your blocks…',
  find_free_time: 'Finding free time…',
  list_backlog: 'Peeking at your backlog…',
  create_block: 'Adding it…',
  update_block: 'Moving things around…',
  complete_block: 'Ticking it off…',
  delete_block: 'Tidying up…',
  schedule_backlog_item: 'Finding it a spot…',
  add_to_backlog: 'Saving it for later…',
  get_insights: 'Thinking about your week…',
};

async function withAi(text: string, history: Msg[], onTool?: (name: string) => void): Promise<Answer> {
  const conn = await ai.connection('alef', 'think');
  if (!conn) throw new LlmError('No AI brain chosen.');
  const s = alefFile.value.settings;
  const today = isoOf(clock.now);
  const tools = availableTools(s.mayChange);
  const genui = await import('../../ai/genui');
  let day: string | null = null;
  try {
    day = agenda(clock.now);
  } catch {
    day = null;
  }
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
        day,
        you: s.you,
        bond: { days: alefFile.value.bond.days.length, chats: alefFile.value.bond.chats },
        ui: genui.uiPrompt('alef'),
      }),
    },
    ...history.filter((m) => m.text && !m.error).map((m): ChatMessage => ({ role: m.who === 'you' ? 'user' : 'assistant', content: m.text })),
    { role: 'user', content: text },
  ];
  const out = await converse({
    config: conn.config,
    key: conn.key,
    messages,
    tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })),
    runTool: (name, args) => {
      const r = callTool(tools, name, args, {
        now: clock.now,
        changed: (did, undo) => view.say(`Alef ${did}`, { label: 'Undo', run: undo }, 7000),
      });
      return r.content.map((c) => c.text).join('\n');
    },
    onTool: (name) => onTool?.(name),
    fetchFn: (url, init) => platform.fetch(url, init),
  });
  // The words are spoken; the UI (when it parses to something that draws) goes under them.
  const said = splitUi(out.text);
  const ui = genui.checkUi(said.ui);
  const { text: words, beats } = beatsOf(said.text, FEELINGS);
  const first = (beats[0]?.feeling as BehaviorId | undefined) ?? (out.toolsUsed.length ? 'happy' : 'pleased');
  return {
    text: words || (ui ? 'Here you go.' : 'Done.'),
    feeling: first,
    beats: beats.slice(1).map((b) => ({ at: b.at, feeling: b.feeling as BehaviorId })),
    tools: out.toolsUsed,
    via: 'ai',
    ...(ui ? { ui } : {}),
  };
}

export async function answer(text: string, o: { history: Msg[]; aiReady: boolean; onTool?: (name: string) => void }): Promise<Answer> {
  const hour = new Date(clock.now).getHours();
  const st = smallTalk(text, { hour, seed: Math.floor(clock.now / 1000), name: alefFile.value.settings.you.name });
  // Small talk Alef answers itself, except feeling stuck, which a thinking brain can meet better.
  if (st && !(st.stuck && o.aiReady)) return { text: st.say, feeling: st.feeling, via: 'device', thanks: st.thanks, ...(st.stuck ? { offers: stuckOffers() } : {}) };
  if (o.aiReady) {
    try {
      return await withAi(text, o.history, o.onTool);
    } catch (e) {
      const via = ai.route('alef', 'think').via;
      const name = via === 'device' ? 'the AI' : providerOf(via).name;
      const why = e instanceof LlmError ? e.message : `Couldn't reach ${name}.`;
      const local = await onDevice(text);
      return { ...local, note: `${why} I answered on this device instead.` };
    }
  }
  return onDevice(text);
}

/** "I'm stuck": start two minutes on what's now (or next), or make it smaller. */
function stuckOffers(): Offer[] {
  const b = view.now.current?.kind === 'task' ? view.now.current : view.now.next?.kind === 'task' ? view.now.next : null;
  if (!b) return [{ id: 'breathe', label: 'Breathe first', icon: 'wind' }];
  return [
    { id: 'start2', label: 'Start with 2 minutes', icon: 'play', key: b.key },
    { id: 'smaller', label: 'Make it smaller', icon: 'layers', key: b.key },
  ];
}
