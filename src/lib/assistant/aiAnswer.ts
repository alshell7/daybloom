// Ask Daybloom with an AI service (Settings › AI › Ask Daybloom): the words go to the chosen
// service with Daybloom's tools (the MCP addon's careful ones) and the day in plain lines, and
// the answer comes back as a card like any other — the day when it changed something (with one
// Undo for all of it), the free time when it looked for some, or a short note. The service may
// also draw a small generative UI under its words (lib/ai/genui/); the entry keeps it as `ui`.

import { agenda } from '../ai/agenda';
import { splitUi } from '../ai/genui/fence';
import { ai } from '../ai/hub.svelte';
import { converse, type ChatMessage } from '../ai/providers';
import { activeTimeZone, formatTime, fromISODate, isoOf } from '../engine/time';
import { platform } from '../platform';
import { view } from '../stores/view.svelte';
import { availableTools, callTool } from '../addons/mcp/tools';
import type { Entry } from './session.svelte';
import type { ToolResult, Undo } from './tools';

const WRITES = /^(create|update|complete|delete|schedule|add|move|start|set|update_settings)/;

function prompt(now: number, ui: string): string {
  const today = isoOf(now);
  let day = '';
  try {
    day = agenda(now);
  } catch {
    day = '';
  }
  return [
    `You are Ask Daybloom, the command bar of Daybloom, a visual day planner. People type or say what they want; you do it with your tools and answer in one or two short, plain sentences (no lists, no markdown).`,
    `Be kind and practical. Never shame or guilt: nothing is "overdue", "missed" or "late"; plans just move. When someone is stuck, offer one tiny first step.`,
    `To fit something into free time, call create_block (or schedule_backlog_item) without a start: Daybloom finds the first free time around meetings, salah and other blocks. Only pick a time yourself when they said one. Ask before deleting.`,
    `It is ${fromISODate(today).toLocaleDateString('en', { weekday: 'long' })} ${today}, ${formatTime(now, view.hour12)} (${activeTimeZone()}). Write times as ${view.hour12 ? '"3:30pm"' : '"15:30"'}.`,
    day ? `The plan:\n${day}` : '',
    ui,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** An answer from the AI service, or null when it isn't chosen or set up. Throws when it can't be reached. */
export async function aiRespond(text: string, history: Entry[], now: number): Promise<(ToolResult & { ui?: string }) | null> {
  const conn = await ai.connection('assistant', 'think');
  if (!conn) return null;
  const tools = availableTools(true);
  const genui = await import('../ai/genui');
  const undos: Undo[] = [];
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt(now, genui.uiPrompt('assistant')) },
    ...history
      .filter((e) => e.result && !e.pending)
      .slice(-6)
      .flatMap((e): ChatMessage[] => [
        { role: 'user', content: e.query },
        { role: 'assistant', content: e.result!.say },
      ]),
    { role: 'user', content: text },
  ];
  const out = await converse({
    config: conn.config,
    key: conn.key,
    messages,
    tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })),
    runTool: (name, args) => callTool(tools, name, args, { now, changed: (_did, undo) => undos.push(undo) }).content.map((c) => c.text).join('\n'),
    fetchFn: (url, init) => platform.fetch(url, init),
  });
  // The words are the answer; the UI (when it parses to something that draws) goes under them.
  const said = splitUi(out.text);
  const ui = genui.checkUi(said.ui);
  const extra = ui ? { ui } : {};
  const say = said.text.replace(/^\s*\[[a-z-]+\]\s*/i, '').trim() || (ui ? 'Here you go.' : 'Done.');
  const wrote = out.toolsUsed.some((t) => WRITES.test(t));
  const undo = undos.length ? () => [...undos].reverse().forEach((u) => u()) : undefined;
  if (wrote) return { say, card: { kind: 'day', date: view.today }, undo, ...extra };
  if (out.toolsUsed.includes('find_free_time')) return { say, card: { kind: 'note', icon: 'circle-dashed' }, ...extra };
  return { say, card: { kind: 'note', icon: 'sparkles' }, ...extra };
}
