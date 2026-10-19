<script lang="ts">
  // Ask Daybloom: a conversation feed where every answer is a small live card, not a wall of
  // text. Works at once without the model; gets better once Needle is on this device.
  import { tick, untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { DEBUG, session } from '../../lib/assistant/session.svelte';
  import { HELP_GROUPS } from '../../lib/assistant/tools';
  import Icon from '../../lib/Icon.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Panel from '../Panel.svelte';
  import Card from './Card.svelte';
  import EngineBadge from './EngineBadge.svelte';
  import MicButton from '../voice/MicButton.svelte';
  import { voice } from '../../lib/voice/voice.svelte';

  const open = $derived(view.sheet?.kind === 'assistant');
  const prefill = $derived(view.sheet?.kind === 'assistant' ? (view.sheet.query ?? '') : '');

  let text = $state('');
  let field: HTMLInputElement | undefined = $state();
  let feed: HTMLDivElement | undefined = $state();
  /** Position while stepping through history with ↑/↓ (-1 = not browsing). */
  let browse = -1;
  let draft = '';

  const starters = HELP_GROUPS.slice(0, 4).map((g) => g.examples[0]);

  // Speaking here: the words appear in the input as Whistle hears them; when you stop, the
  // voice module sends them and the input clears for the next thing.
  const hearing = $derived(voice.surface === 'assistant' && (voice.phase === 'listening' || voice.phase === 'finishing' || voice.phase === 'opening'));
  $effect(() => {
    if (voice.surface !== 'assistant') return;
    if (voice.phase === 'listening' || voice.phase === 'finishing') text = voice.live;
    else if (voice.phase === 'idle' && voice.final) untrack(() => (text = ''));
  });

  $effect(() => {
    if (!open) return;
    const q = prefill;
    untrack(() => {
      session.open();
      if (q) text = q;
      tick().then(() => {
        field?.focus();
        if (q) field?.select();
        scrollDown(false);
      });
    });
  });

  // New answers scroll into view.
  $effect(() => {
    const last = session.entries.at(-1);
    void last?.pending;
    void session.entries.length;
    untrack(() => tick().then(() => scrollDown(true)));
  });

  function scrollDown(smooth: boolean) {
    const el = feed?.lastElementChild as HTMLElement | null;
    el?.scrollIntoView({ block: 'end', behavior: smooth && !view.reducedMotion ? 'smooth' : 'auto' });
  }

  async function send(q = text) {
    const v = q.trim();
    if (!v) return;
    text = '';
    browse = -1;
    await session.ask(v);
  }

  function useChip(s: string) {
    if (s.endsWith('…')) {
      text = `${s.slice(0, -1)} `;
      field?.focus();
      return;
    }
    void send(s);
  }

  function onKey(e: KeyboardEvent) {
    const h = session.history;
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      void send();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      view.sheet = null;
    } else if (e.key === 'ArrowUp' && h.length && (browse >= 0 || !text.trim() || text === h[h.length - 1])) {
      e.preventDefault();
      if (browse < 0) {
        draft = text;
        browse = h.length;
      }
      browse = Math.max(0, browse - 1);
      text = h[browse];
    } else if (e.key === 'ArrowDown' && browse >= 0) {
      e.preventDefault();
      browse++;
      if (browse >= h.length) {
        browse = -1;
        text = draft;
      } else text = h[browse];
    }
  }

  const conf = (n: number) => n.toFixed(2);
</script>

{#if open}
  <Panel title="Ask Daybloom" onclose={() => (view.sheet = null)} wide>
    <div class="ask" bind:this={feed} aria-live="polite">
      {#if !session.entries.length}
        <section class="hello" in:fade={{ duration: view.reducedMotion ? 0 : 200 }}>
          <span class="mark"><Icon name="sparkles" size={18} stroke={1.9} /></span>
          <p class="a-say">Ask in your own words — what's now, add something, move it, plan the day.</p>
          <div class="a-actions">
            {#each starters as s (s)}
              <button class="a-chip" onclick={() => send(s)}>{s}</button>
            {/each}
            <button class="a-chip quiet" onclick={() => send('help')}>More…</button>
          </div>
        </section>
      {/if}

      {#each session.entries as e (e.id)}
        <article class="turn" in:fly={{ y: 8, duration: view.reducedMotion ? 0 : 260, easing: cubicOut }}>
          <p class="q" class:spoken={e.spoken}>
            <span>{#if e.spoken}<Icon name="mic" size={11} stroke={2.3} />{/if}{e.query}</span>
          </p>
          {#if e.pending}
            {#if e.slow}
              <p class="a-meta thinking" in:fade={{ duration: view.reducedMotion ? 0 : 160 }}>
                {session.status === 'loading' ? 'Waking Needle…' : 'Thinking…'}
              </p>
            {/if}
          {:else if e.result}
            <Card entry={e} />
          {/if}
          {#if DEBUG && e.route}
            <p class="debug tnum">
              {e.route.call?.tool ?? `choice: ${e.route.options.map((o) => o.tool).join(', ') || '—'}`} · {conf(e.route.confidence)} · {e.route.source} · {e.route.ms} ms
            </p>
          {/if}
        </article>
      {/each}
    </div>

    {#snippet footer()}
      <div class="foot">
        <div class="suggest" role="group" aria-label="Suggestions">
          {#each session.suggestions as s (s)}
            <button class="a-chip sm" onclick={() => useChip(s)}>{s}</button>
          {/each}
        </div>
        <form
          data-voice="assistant"
          class="bar"
          onsubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <span class="lead" aria-hidden="true"><Icon name="sparkles" size={16} stroke={1.9} /></span>
          <input
            bind:this={field}
            bind:value={text}
            onkeydown={onKey}
            readonly={hearing}
            class:hearing
            placeholder={hearing ? 'Listening…' : "What's now? · Add gym at 5pm · Plan my day"}
            aria-label="Ask Daybloom"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="send"
          />
          <MicButton surface="assistant" size={32} label="Speak" />
          <button class="icon-btn send" type="submit" disabled={!text.trim() || session.busy} aria-label="Ask"><Icon name="arrow-right" size={17} stroke={2.1} /></button>
        </form>
        <div class="under">
          <EngineBadge />
          {#if session.entries.length}
            <button class="clear" onclick={() => session.clear()}>Clear</button>
          {/if}
        </div>
      </div>
    {/snippet}
  </Panel>
{/if}

<style>
  .ask {
    display: grid;
    gap: var(--s-5);
    padding-top: var(--s-1);
  }
  .hello {
    display: grid;
    gap: var(--s-3);
    justify-items: start;
    padding: var(--s-2) 0;
  }
  .mark {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--sunken);
    color: var(--ink-2);
  }
  .turn {
    display: grid;
    gap: var(--s-2);
  }
  .q {
    display: flex;
    justify-content: flex-end;
    margin: 0;
  }
  .q span {
    max-width: 85%;
    padding: 7px 13px;
    border-radius: var(--r-lg) var(--r-lg) 6px var(--r-lg);
    background: var(--sunken);
    color: var(--ink);
    font-size: var(--t-md);
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .q.spoken span {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
  }
  .q.spoken span :global(svg) {
    flex: none;
    color: var(--ink-3);
    transform: translateY(1px);
  }
  input.hearing {
    color: var(--ink-2);
  }
  .thinking {
    margin: 0;
  }
  .debug {
    margin: 0;
    font-size: 10.5px;
    color: var(--ink-3);
    opacity: 0.8;
  }

  .foot {
    display: grid;
    gap: var(--s-2);
    width: 100%;
    min-width: 0;
  }
  .suggest {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    margin: 0 -2px;
    padding: 0 2px;
  }
  .suggest::-webkit-scrollbar {
    display: none;
  }
  .suggest :global(.a-chip) {
    flex: none;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 42px;
    padding: 0 4px 0 10px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--raised);
    transition:
      border-color var(--dur-1) var(--ease-out),
      box-shadow var(--dur-1) var(--ease-out);
  }
  .bar:focus-within {
    border-color: var(--focus-ring);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 20%, transparent);
  }
  .lead {
    display: grid;
    color: var(--ink-3);
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: none;
    background: transparent;
    font-family: var(--font-read);
    font-size: var(--t-md);
  }
  .send {
    width: 32px;
    height: 32px;
  }
  .send:not(:disabled) {
    background: var(--ink);
    color: var(--ink-inverse);
  }
  .under {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    min-width: 0;
    margin: -2px -6px -4px;
  }
  .clear {
    flex: none;
    padding: 2px 8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .clear:hover {
    background: var(--sunken);
    color: var(--ink);
  }

  /* ── Shared card language (used by every card under components/assistant) ── */
  :global(.a-say) {
    margin: 0;
    font-size: var(--t-md);
    line-height: 1.45;
    color: var(--ink);
  }
  :global(.a-card) {
    display: grid;
    gap: 10px;
    padding: 12px 14px;
    border-radius: var(--r-md);
    background: var(--surface);
    border: 1px solid var(--line);
    min-width: 0;
    transition: opacity var(--dur-2) var(--ease-out);
  }
  :global(.a-title) {
    font-family: var(--font-read);
    font-size: var(--t-md);
    font-weight: 500;
    line-height: 1.3;
    color: var(--ink);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.a-meta) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    font-size: var(--t-xs);
    line-height: 1.4;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    min-width: 0;
  }
  :global(.a-label) {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-3);
  }
  :global(.a-time) {
    font-size: var(--t-xs);
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  :global(.a-actions) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  :global(.a-chip) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 12px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    background: transparent;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    white-space: nowrap;
    transition:
      background var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  :global(.a-chip:hover:not(:disabled)) {
    background: var(--raised);
    border-color: var(--ink-3);
  }
  :global(.a-chip:active:not(:disabled)) {
    transform: scale(0.97);
  }
  :global(.a-chip[aria-pressed='true']) {
    background: color-mix(in srgb, var(--c, var(--ink)) 14%, transparent);
    border-color: var(--c, var(--ink));
  }
  :global(.a-chip.sm) {
    height: 26px;
    padding: 0 10px;
    font-size: var(--t-xs);
  }
  :global(.a-chip.icon) {
    width: 26px;
    padding: 0;
    justify-content: center;
  }
  :global(.a-chip.still) {
    border-color: transparent;
    background: var(--sunken);
    font-weight: 500;
    cursor: default;
  }
  :global(.a-chip.primary) {
    background: var(--ink);
    border-color: transparent;
    color: var(--ink-inverse);
    font-weight: 500;
  }
  :global(.a-chip.primary:hover:not(:disabled)) {
    background: color-mix(in srgb, var(--ink) 88%, var(--signal));
    border-color: transparent;
  }
  :global(.a-chip.quiet) {
    border-color: transparent;
    color: var(--ink-2);
  }
  :global(.a-chip.quiet:hover:not(:disabled)) {
    background: var(--sunken);
    border-color: transparent;
    color: var(--ink);
  }
  :global(.a-chip.danger) {
    border-color: transparent;
    color: var(--danger);
  }
  :global(.a-chip.danger:hover:not(:disabled)) {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    border-color: transparent;
  }
  :global(.a-ico) {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--c, var(--ink-3)) 18%, transparent);
    color: var(--c, var(--ink-2));
  }
  :global(.a-ico.quiet) {
    background: var(--sunken);
    color: var(--ink-2);
  }
  /* Finished: lume, the reward colour. */
  :global(.a-ico.lume) {
    background: color-mix(in srgb, var(--c, var(--lume)) 14%, transparent);
    box-shadow: inset 0 0 0 2px var(--lume);
    color: var(--ink);
  }
  :global(.a-dot) {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }
  :global(.a-list) {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  :global(.a-row) {
    display: grid;
    grid-template-columns: 46px 28px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    width: 100%;
    min-height: 38px;
    padding: 4px 6px;
    margin: 0 -6px;
    box-sizing: content-box;
    border-radius: var(--r-sm);
    text-align: left;
    transition: background var(--dur-1) var(--ease-out);
  }
  :global(button.a-row:hover) {
    background: var(--sunken);
  }
  :global(.a-row.done .a-title) {
    color: var(--ink-2);
    text-decoration: line-through;
    text-decoration-color: var(--ink-3);
  }
  :global(.a-row.live) {
    background: color-mix(in srgb, var(--c) 10%, transparent);
  }
</style>
