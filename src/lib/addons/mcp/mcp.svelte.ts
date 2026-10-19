// MCP, the live side: runs the local server while the addon is on, answers each request from
// an AI app with the tools in tools.ts, and keeps a short list of what they did. Every change
// comes with an Undo toast that names the app.

import { platform, type McpRequest, type McpStatus } from '../../platform';
import { clock } from '../../stores/clock.svelte';
import { persisted } from '../../stores/persisted.svelte';
import { view } from '../../stores/view.svelte';
import { availableTools, callTool, MCP_TOOLS, wireTool } from './tools';

export interface Activity {
  id: string;
  at: number;
  /** The AI app, as it named itself. */
  client: string;
  tool: string;
  /** What happened, in a few words. */
  text: string;
  write: boolean;
  ok: boolean;
}

export interface McpFile {
  version: 1;
  /** AI apps may change plans (not only read them). */
  write: boolean;
  log: Activity[];
}

const LOG_MAX = 60;

export function migrateMcp(raw: any): McpFile {
  const log: Activity[] = Array.isArray(raw?.log)
    ? raw.log
        .filter((a: any) => a && typeof a.tool === 'string' && Number.isFinite(a.at))
        .map((a: any) => ({ id: String(a.id ?? a.at), at: a.at, client: String(a.client ?? ''), tool: a.tool, text: String(a.text ?? ''), write: !!a.write, ok: a.ok !== false }))
        .slice(-LOG_MAX)
    : [];
  return { version: 1, write: raw?.write !== false, log };
}

export const mcpFile = persisted<McpFile>('addon-mcp', migrateMcp(null), migrateMcp);

const KNOWN: [RegExp, string][] = [
  [/claude[-\s]?code/i, 'Claude Code'],
  [/^claude/i, 'Claude'],
  [/codex/i, 'Codex'],
  [/cursor/i, 'Cursor'],
  [/visual studio code|vscode|copilot/i, 'VS Code'],
  [/windsurf/i, 'Windsurf'],
  [/zed/i, 'Zed'],
  [/gemini/i, 'Gemini'],
  [/goose/i, 'Goose'],
  [/inspector/i, 'MCP Inspector'],
];

/** "claude-code" → "Claude Code"; unknown names are tidied; none → "An AI app". */
export function clientLabel(name: string): string {
  const n = name.trim();
  if (!n) return 'An AI app';
  for (const [re, label] of KNOWN) if (re.test(n)) return label;
  return n.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40);
}

class Mcp {
  status = $state<McpStatus | null>(null);
  error = $state('');
  /** Bumped on every request: the panel's bridge sends a bead across. */
  pulse = $state(0);
  lastWrite = $state(false);
  /** Apps that said hello since the server started. */
  clients = $state<string[]>([]);

  get write() {
    return mcpFile.value.write;
  }
  set write(v: boolean) {
    mcpFile.value.write = v;
  }
  get log() {
    return mcpFile.value.log;
  }

  note(a: Omit<Activity, 'id'>) {
    const log = mcpFile.value.log;
    const last = log.at(-1);
    // The same read again within a minute (apps often ask in bursts): one line, kept fresh.
    if (last && !a.write && !last.write && last.client === a.client && last.tool === a.tool && last.ok === a.ok && a.at - last.at < 60_000) {
      mcpFile.value.log = [...log.slice(0, -1), { ...last, at: a.at }];
      return;
    }
    mcpFile.value.log = [...log, { ...a, id: `${a.at}-${Math.random().toString(36).slice(2, 6)}` }].slice(-LOG_MAX);
  }
  clearLog() {
    mcpFile.value.log = [];
  }

  /** A new key: setups that carry the old one stop working. */
  async rotate() {
    try {
      this.status = await platform.mcp.set(true, true);
      this.error = '';
    } catch (e) {
      this.error = String(e);
    }
  }
}

export const mcp = new Mcp();

/** Answer one request (also used by tests). */
export function answer(req: Pick<McpRequest, 'method' | 'params' | 'client'>, now = clock.now): { result: unknown } | { error: string } {
  const tools = availableTools(mcp.write);
  if (req.method === 'tools/list') return { result: { tools: tools.map(wireTool) } };
  if (req.method !== 'tools/call') return { error: `Unknown method ${req.method}` };
  const name = String(req.params?.name ?? '');
  const who = clientLabel(req.client);
  let did = '';
  const result = callTool(tools, name, req.params?.arguments, {
    now,
    changed(text, undo) {
      did = text;
      view.say(`${who} ${text}`, { label: 'Undo', run: undo }, 7000);
    },
  });
  const tool = MCP_TOOLS.find((t) => t.name === name);
  mcp.pulse++;
  mcp.lastWrite = !!tool?.writes;
  mcp.note({
    at: Date.now(),
    client: req.client,
    tool: name,
    text: result.isError ? result.content[0]?.text.slice(0, 140) ?? 'failed' : did || tool?.did || name,
    write: !!tool?.writes,
    ok: !result.isError,
  });
  return { result };
}

/** Main window, while the addon is on. */
export function startMcp(): () => void {
  let stopped = false;
  const off = platform.mcp.listen(
    (req) => {
      let out: { result: unknown } | { error: string };
      try {
        out = answer(req);
      } catch (e) {
        out = { error: String(e) };
      }
      void platform.mcp.reply(req.id, out);
    },
    (name) => {
      const label = clientLabel(name);
      if (!mcp.clients.includes(label)) mcp.clients = [...mcp.clients, label];
    },
  );
  void platform.mcp
    .set(true)
    .then((s) => {
      if (stopped) return;
      mcp.status = s;
      mcp.error = '';
    })
    .catch((e) => (mcp.error = String(e)));
  return () => {
    stopped = true;
    off();
    mcp.clients = [];
    void platform.mcp.set(false).then((s) => (mcp.status = s)).catch(() => {});
  };
}
