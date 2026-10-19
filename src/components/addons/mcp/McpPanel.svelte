<script lang="ts">
  // The MCP panel: a quiet bridge between your day and your AI apps. A bead crosses it each
  // time an app asks something (out to the app for a read, in to the dial for a change). Below:
  // ready-to-paste setups for each app, what they may do, and what they did.
  import { untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly, slide } from 'svelte/transition';
  import { ago } from '../../../lib/addons/crumbs/crumbs.svelte';
  import { clientLabel, mcp } from '../../../lib/addons/mcp/mcp.svelte';
  import { MCP_TOOLS } from '../../../lib/addons/mcp/tools';
  import { isOn } from '../../../lib/addons/registry';
  import { categoryColor } from '../../../lib/engine/categories';
  import Icon from '../../../lib/Icon.svelte';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import Panel from '../../Panel.svelte';
  import Segmented from '../../Segmented.svelte';

  type AppId = 'claude-code' | 'codex' | 'claude' | 'other';

  const open = $derived(view.sheet?.kind === 'mcp');
  const rm = $derived(view.reducedMotion);
  const st = $derived(mcp.status);
  const on = $derived(!!st?.on);
  const isWin = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || navigator.userAgent);

  let app = $state<AppId>('claude-code');
  let reveal = $state(false);
  let copied = $state('');
  let confirmKey = $state(false);

  const token = $derived(st?.token ?? '');
  const shownToken = $derived(reveal ? token : token ? `${'•'.repeat(10)}${token.slice(-4)}` : '…');
  const url = $derived(st?.url || 'http://127.0.0.1:7451/mcp');
  const exe = $derived(st?.exe || 'daybloom');
  const args = $derived(st?.args?.length ? st.args : ['--mcp']);
  const shellExe = $derived(/\s/.test(exe) || isWin ? `"${exe}"` : exe);
  const command = $derived(`${shellExe} ${args.join(' ')}`);

  /** Each setup as [shown, copied]: the key is hidden on screen, never in what you copy. */
  function setups(t: string): { lead: string; code: string; note?: string; alt?: { lead: string; code: string } } {
    switch (app) {
      case 'claude-code':
        return {
          lead: 'Run this once in a terminal:',
          code: `claude mcp add --transport http --scope user daybloom ${url} --header "Authorization: Bearer ${t}"`,
          note: 'Then ask Claude about your day in any project.',
        };
      case 'codex':
        return {
          lead: 'Run this once in a terminal:',
          code: `codex mcp add daybloom -- ${command}`,
          alt: { lead: `Or add this to ${isWin ? '%USERPROFILE%\\.codex\\config.toml' : '~/.codex/config.toml'}:`, code: `[mcp_servers.daybloom]\ncommand = '${exe}'\nargs = ${JSON.stringify(args)}` },
          note: 'Codex starts Daybloom’s small relay, which finds the key by itself.',
        };
      case 'claude':
        return {
          lead: 'In Claude, open Settings › Developer › Edit Config, and add:',
          code: JSON.stringify({ mcpServers: { daybloom: { command: exe, args } } }, null, 2),
          note: 'Restart Claude. The relay finds the key by itself.',
        };
      default:
        return {
          lead: 'Most apps (Cursor, VS Code, Windsurf, …) take an address and a header:',
          code: JSON.stringify({ mcpServers: { daybloom: { url, headers: { Authorization: `Bearer ${t}` } } } }, null, 2),
          note: `Apps that start a command instead can run ${command}.`,
        };
    }
  }
  const shown = $derived(setups(shownToken));
  const real = $derived(setups(token));

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    copied = id;
    setTimeout(() => copied === id && (copied = ''), 1600);
  }

  async function newKey() {
    if (!confirmKey) {
      confirmKey = true;
      setTimeout(() => (confirmKey = false), 4000);
      return;
    }
    confirmKey = false;
    await mcp.rotate();
    view.say('New key made. Copy the setup again for apps that use the address.');
  }

  const reads = MCP_TOOLS.filter((t) => !t.writes);
  const writes = MCP_TOOLS.filter((t) => t.writes);
  const log = $derived([...mcp.log].reverse().slice(0, 24));
  const iconOf = (name: string) => MCP_TOOLS.find((t) => t.name === name)?.icon ?? 'plug';
  const appName = $derived(mcp.clients.at(-1) ?? 'Your AI app');

  // The bridge: a bead crosses on every request; a change also makes the dial bloom once.
  let lane = $state<HTMLDivElement>();
  let dial = $state<SVGSVGElement>();
  let tile = $state<HTMLDivElement>();
  $effect(() => {
    const n = mcp.pulse;
    if (!n || !lane) return;
    untrack(() => {
      if (rm) return;
      const inward = mcp.lastWrite;
      const ends = ['translateX(-100%)', 'translateX(0%)'];
      const [a, b] = inward ? [ends[1], ends[0]] : ends;
      lane!.animate(
        [
          { transform: a, opacity: 0 },
          { opacity: 1, offset: 0.12 },
          { opacity: 1, offset: 0.88 },
          { transform: b, opacity: 0 },
        ],
        { duration: 820, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
      );
      const land = inward ? dial : tile;
      land?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 520, delay: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    });
  });

  // A few arcs on the little dial, in the category colours.
  const ARCS: [number, number, 'focus' | 'care' | 'move' | 'rest'][] = [
    [-80, -20, 'focus'],
    [-8, 40, 'care'],
    [52, 96, 'move'],
    [150, 210, 'rest'],
  ];
  const arc = (r: number, a0: number, a1: number) => {
    const p = (a: number) => [40 + r * Math.cos(((a - 90) * Math.PI) / 180), 40 + r * Math.sin(((a - 90) * Math.PI) / 180)].map((v) => v.toFixed(2)).join(' ');
    return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`;
  };

  const EXAMPLES = ['What’s on my day?', 'Find an hour for writing tomorrow afternoon', 'Move my walk to after lunch', 'How did my week go?'];
</script>

{#if open}
  <Panel title="MCP" onclose={() => (view.sheet = null)} accent="#DB4F94">
    <div class="mp">
      <div class="bridge" class:off={!on}>
        <div class="end">
          <svg bind:this={dial} class="dial" viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="37" class="face" />
            {#each ARCS as [a0, a1, c] (a0)}
              <path d={arc(30, a0, a1)} stroke={categoryColor(c, view.finish.dark)} />
            {/each}
            <line x1="40" y1="40" x2="40" y2="17" class="hand" transform="rotate(38 40 40)" />
            <circle cx="40" cy="40" r="3.2" class="hub" />
          </svg>
          <span>Daybloom</span>
        </div>
        <div class="thread" aria-hidden="true">
          <i class="line"></i>
          <div class="lane" bind:this={lane}><b class:fill={mcp.lastWrite}></b></div>
        </div>
        <div class="end">
          <div class="tile" bind:this={tile}><Icon name="terminal" size={24} stroke={1.8} /></div>
          <span>{#key appName}<em in:fade={{ duration: rm ? 0 : 240 }}>{appName}</em>{/key}</span>
        </div>
      </div>

      <p class="state" role="status">
        {#if mcp.error}
          <i class="dot warn"></i> Couldn’t start: {mcp.error}
        {:else if on}
          <i class="dot"></i> Ready on this computer <code>127.0.0.1:{st?.port}</code>
        {:else}
          <i class="dot idle"></i> Starting…
        {/if}
      </p>

      <section>
        <h3>Connect an app</h3>
        <Segmented
          label="AI app"
          value={app}
          onchange={(v) => (app = v)}
          options={[
            { value: 'claude-code', label: 'Claude Code' },
            { value: 'codex', label: 'Codex' },
            { value: 'claude', label: 'Claude' },
            { value: 'other', label: 'Other' },
          ]}
        />
        {#key app}
          <div class="setup" in:fly={{ y: 6, duration: rm ? 0 : 260, easing: cubicOut }}>
            <p class="lead">{shown.lead}</p>
            <div class="code">
              <pre>{shown.code}</pre>
              <button class="copy" class:done={copied === 'main'} onclick={() => copy(real.code, 'main')} aria-label="Copy">
                <Icon name={copied === 'main' ? 'check' : 'copy'} size={14} stroke={2} />{copied === 'main' ? 'Copied' : 'Copy'}
              </button>
            </div>
            {#if shown.alt && real.alt}
              <p class="lead">{shown.alt.lead}</p>
              <div class="code">
                <pre>{shown.alt.code}</pre>
                <button class="copy" class:done={copied === 'alt'} onclick={() => copy(real.alt!.code, 'alt')} aria-label="Copy">
                  <Icon name={copied === 'alt' ? 'check' : 'copy'} size={14} stroke={2} />{copied === 'alt' ? 'Copied' : 'Copy'}
                </button>
              </div>
            {/if}
            {#if shown.note}<p class="hint">{shown.note}</p>{/if}
            {#if app === 'claude-code' || app === 'other'}
              <button class="link" onclick={() => (reveal = !reveal)}><Icon name={reveal ? 'eye-off' : 'eye'} size={13} /> {reveal ? 'Hide the key' : 'Show the key'}</button>
            {/if}
          </div>
        {/key}
      </section>

      <section>
        <h3>Then ask</h3>
        <ul class="asks">
          {#each EXAMPLES as e, i (e)}
            <li in:fly={{ x: -6, duration: rm ? 0 : 300, delay: rm ? 0 : 60 * i, easing: cubicOut }}>“{e}”</li>
          {/each}
        </ul>
      </section>

      <section>
        <h3>What apps can do</h3>
        <div class="tools">
          {#each reads as t (t.name)}
            {#if !t.needs || isOn(t.needs)}<span class="tool" title={t.description}><Icon name={t.icon} size={13} />{t.title}</span>{/if}
          {/each}
        </div>
        <label class="row">
          <span>
            Let apps change my plans
            <small>Every change shows a toast with Undo. Off: apps can only read.</small>
          </span>
          <input type="checkbox" class="switch" bind:checked={mcp.write} />
        </label>
        <div class="tools" class:muted={!mcp.write}>
          {#each writes as t (t.name)}
            <span class="tool w" title={t.description}><Icon name={t.icon} size={13} />{t.title}</span>
          {/each}
        </div>
      </section>

      <section>
        <div class="sh">
          <h3>Activity</h3>
          {#if log.length}<button class="link" onclick={() => mcp.clearLog()}>Clear</button>{/if}
        </div>
        {#if log.length}
          <ul class="log">
            {#each log as a (a.id)}
              <li class:fail={!a.ok} class:w={a.write} in:fly={{ y: -6, duration: rm ? 0 : 260, easing: cubicOut }} out:slide={{ duration: rm ? 0 : 160 }}>
                <span class="ic"><Icon name={a.ok ? iconOf(a.tool) : 'x'} size={13} stroke={2} /></span>
                <span class="what"><b>{clientLabel(a.client)}</b> {a.ok ? a.text : `couldn’t use ${a.tool}: ${a.text}`}</span>
                <span class="when tnum">{ago(a.at, clock.minute)}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="empty">Nothing yet. When an app reads or changes your day, you see it here.</p>
        {/if}
      </section>

      <section>
        <h3>Privacy</h3>
        <p class="hint big">
          Daybloom answers only on this computer (127.0.0.1), and only to apps that have the key. Web pages can’t reach it. An app sees your plans only when it uses one of these tools, and each use shows under Activity.
        </p>
        <button class="btn btn-quiet key" class:sure={confirmKey} onclick={newKey}>
          <Icon name="key" size={14} />{confirmKey ? 'Sure? Old setups stop working' : 'Make a new key'}
        </button>
      </section>
    </div>
  </Panel>
{/if}

<style>
  .mp {
    --pink: #db4f94;
  }
  :global([data-theme='dark']) .mp {
    --pink: #ff86bf;
  }

  /* ── The bridge ── */
  .bridge {
    display: grid;
    grid-template-columns: 76px 1fr 76px;
    align-items: start;
    gap: 6px;
    padding: var(--s-3) var(--s-2) var(--s-2);
    border-radius: var(--r-lg);
    background:
      radial-gradient(120% 140% at 50% 0%, color-mix(in srgb, var(--pink) 9%, transparent), transparent 70%),
      var(--surface);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .end {
    display: grid;
    justify-items: center;
    gap: 6px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .end em {
    font-style: normal;
  }
  .dial {
    width: 64px;
    height: 64px;
    overflow: visible;
  }
  .dial .face {
    fill: var(--raised);
    stroke: var(--line-strong);
  }
  .dial path {
    fill: none;
    stroke-width: 6;
    stroke-linecap: round;
  }
  .dial .hand {
    stroke: var(--signal);
    stroke-width: 2;
    stroke-linecap: round;
  }
  .dial .hub {
    fill: var(--ink);
  }
  .tile {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: 18px;
    color: var(--pink);
    background: color-mix(in srgb, var(--pink) 12%, var(--raised));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pink) 26%, transparent);
  }
  .thread {
    position: relative;
    height: 64px;
    margin: 0 2px;
  }
  .line {
    position: absolute;
    left: 0;
    right: 0;
    top: 31px;
    height: 2px;
    background: radial-gradient(circle, var(--ink-3) 0 1px, transparent 1.4px) 0 0 / 7px 2px repeat-x;
    opacity: 0.55;
    transition: opacity var(--dur-3) var(--ease-out);
  }
  .off .line {
    opacity: 0.18;
    mask: linear-gradient(90deg, #000 38%, transparent 42% 58%, #000 62%);
  }
  .off .dial,
  .off .tile {
    filter: saturate(0.3);
    opacity: 0.7;
  }
  .lane {
    position: absolute;
    inset: 0;
    opacity: 0;
    transform: translateX(-100%);
    will-change: transform, opacity;
  }
  .lane b {
    position: absolute;
    right: -6px;
    top: 26px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--pink);
    background: var(--raised);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--pink) 16%, transparent);
  }
  .lane b.fill {
    background: var(--pink);
  }
  .state {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin: var(--s-3) 0 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--lume);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lume) 22%, transparent);
  }
  .dot.idle {
    background: var(--ink-3);
    box-shadow: none;
  }
  .dot.warn {
    background: var(--warm);
  }
  code,
  pre {
    font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;
  }
  .state code {
    font-size: var(--t-xs);
    padding: 2px 6px;
    border-radius: var(--r-xs);
    background: var(--sunken);
    color: var(--ink-2);
  }

  /* ── Sections ── */
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  .bridge + .state + section {
    margin-top: var(--s-3);
  }
  h3 {
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .sh {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .setup {
    display: grid;
    gap: var(--s-2);
    margin-top: var(--s-3);
  }
  .lead {
    margin: var(--s-1) 0 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .code {
    position: relative;
    border-radius: var(--r-md);
    background: var(--sunken);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .code pre {
    margin: 0;
    padding: 12px 14px 40px;
    font-size: 12px;
    line-height: 1.55;
    color: var(--ink);
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow: auto;
  }
  .copy {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink);
    background: var(--raised);
    box-shadow: var(--shadow-1), inset 0 0 0 1px var(--line);
    transition:
      background var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .copy:hover {
    background: var(--surface);
  }
  .copy:active {
    transform: scale(0.96);
  }
  .copy.done {
    color: var(--ink-inverse);
    background: var(--lume);
  }
  .link {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    margin-left: -8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
  }
  .link:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .hint,
  .empty {
    margin: 0;
    font-size: var(--t-xs);
    line-height: 1.5;
    color: var(--ink-3);
  }
  .hint.big,
  .empty {
    font-size: var(--t-sm);
  }
  .asks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .asks li {
    justify-self: start;
    padding: 7px 12px;
    border-radius: 14px 14px 14px 4px;
    font-family: var(--font-read);
    font-size: var(--t-sm);
    color: var(--ink);
    background: color-mix(in srgb, var(--pink) 8%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pink) 16%, var(--line));
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    transition: opacity var(--dur-2) var(--ease-out);
  }
  .tools.muted {
    opacity: 0.45;
  }
  .tool {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px 4px 8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    color: var(--ink-2);
    background: var(--sunken);
  }
  .tool.w {
    color: var(--ink);
    background: color-mix(in srgb, var(--pink) 10%, var(--surface));
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 40px;
    margin: var(--s-3) 0 var(--s-2);
    font-size: var(--t-sm);
  }
  .row small {
    display: block;
    margin-top: 2px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .log {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .log li {
    display: grid;
    grid-template-columns: 24px 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 6px 4px;
    border-radius: var(--r-sm);
    font-size: var(--t-sm);
  }
  .ic {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    color: var(--ink-3);
    background: var(--sunken);
  }
  .log li.w .ic {
    color: var(--pink);
    background: color-mix(in srgb, var(--pink) 12%, transparent);
  }
  .log li.fail .ic {
    color: var(--ink-3);
  }
  .what {
    min-width: 0;
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
  .what b {
    font-weight: 500;
    color: var(--ink);
  }
  .fail .what {
    color: var(--ink-3);
  }
  .when {
    font-size: var(--t-xs);
    color: var(--ink-3);
    white-space: nowrap;
  }
  .key {
    margin-top: var(--s-3);
    gap: 6px;
    height: 32px;
  }
  .key.sure {
    color: var(--ink);
    background: color-mix(in srgb, var(--warm) 16%, transparent);
  }
  :global([data-motion='calm']) .mp .lane {
    display: none;
  }
</style>
