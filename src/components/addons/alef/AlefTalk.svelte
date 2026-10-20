<script lang="ts">
  // Talking with Alef: the conversation (with the planner's answer cards when Alef answered on
  // this device), a few things to ask, and — in the panel's footer — the line you type or say.
  import { tick } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { alef, alefFile } from '../../../lib/addons/alef/alef.svelte';
  import type { Option } from '../../../lib/assistant/tools';
  import { HELP_GROUPS } from '../../../lib/assistant/tools';
  import Icon from '../../../lib/Icon.svelte';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import { voice } from '../../../lib/voice/voice.svelte';
  import Card from '../../assistant/Card.svelte';
  import MicButton from '../../voice/MicButton.svelte';
  import AlefMini from './AlefMini.svelte';

  let { input = false }: { input?: boolean } = $props();

  const eyes = $derived(alefFile.value.settings.eyes);
  const rm = $derived(view.reducedMotion);

  // Things to ask that fit the time of day.
  const ideas = $derived.by(() => {
    const h = new Date(clock.minute).getHours();
    if (h < 11) return ["What's on today?", 'Plan my day', "I'm stuck", 'When am I free?'];
    if (h < 17) return ["What's next?", 'Find an hour for focus tomorrow', "I'm stuck", 'How is my day going?'];
    if (h < 21) return ['How was my day?', 'Plan tomorrow', 'Move what is left to tomorrow', 'Tell me a joke'];
    return ['Wind down', 'Show tomorrow', 'Good night'];
  });

  const TOOL_WORDS: Record<string, string> = {
    get_day: 'read your day',
    list_blocks: 'looked at blocks',
    find_free_time: 'found free time',
    list_backlog: 'read the backlog',
    get_settings: 'read settings',
    get_insights: 'read your rhythm',
    get_prayer_times: 'read salah times',
    create_block: 'added a block',
    update_block: 'changed a block',
    complete_block: 'ticked a block',
    delete_block: 'removed a block',
    add_to_backlog: 'saved to the backlog',
    schedule_backlog_item: 'planned a backlog task',
    update_settings: 'changed a setting',
  };
  const toolWords = (t: string[]) => [...new Set(t.map((x) => TOOL_WORDS[x] ?? x.replace(/_/g, ' ')))];

  // ── The feed: keep the newest line in view ──
  let feed = $state<HTMLDivElement>();
  $effect(() => {
    void alef.messages.length;
    void alef.messages.at(-1)?.pending;
    if (input) return;
    tick().then(() => {
      const box = feed?.closest('.content') as HTMLElement | null;
      if (box) box.scrollTo({ top: box.scrollHeight, behavior: rm ? 'auto' : 'smooth' });
    });
  });

  // ── The input ──
  let text = $state('');
  let field = $state<HTMLInputElement>();
  function send(e?: SubmitEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || alef.busy) return;
    text = '';
    void alef.ask(t);
  }
  $effect(() => {
    if (input && view.sheet?.kind === 'alef') tick().then(() => field?.focus({ preventScroll: true }));
  });
  // Spoken words go straight to Alef.
  let usedFinal = '';
  $effect(() => {
    if (!input || voice.surface !== 'alef' || voice.phase !== 'idle' || !voice.final || voice.final === usedFinal) return;
    usedFinal = voice.final;
    void alef.ask(voice.final);
  });
  const dictating = $derived(voice.surface === 'alef' && (voice.phase === 'listening' || voice.phase === 'finishing'));

  const pick = (o: Option) => void alef.run(o.call, o.label);
</script>

{#if input}
  <form class="say" onsubmit={send} data-voice="alef">
    <input
      bind:this={field}
      bind:value={text}
      class="field"
      placeholder={dictating ? (voice.live || 'Listening…') : alef.busy ? 'Alef is thinking…' : 'Say something to Alef'}
      aria-label="Say something to Alef"
      autocomplete="off"
      enterkeyhint="send"
      maxlength="600"
    />
    <span class="mic"><MicButton surface="alef" size={32} label="Speak to Alef" /></span>
    <button class="send" type="submit" disabled={!text.trim() || alef.busy} aria-label="Send"><Icon name="arrow-up" size={17} stroke={2.4} /></button>
  </form>
{:else}
  <div class="feed" bind:this={feed} aria-live="polite">
    {#if !alef.messages.length}
      <div class="intro" in:fly={{ y: 8, duration: rm ? 0 : 320, easing: cubicOut }}>
        <p>Hi! I'm <b>Alef</b>. I keep you company while you work, cheer your wins and help you plan. Ask me anything about your day.</p>
        <div class="ideas">
          {#each ideas as q (q)}
            <button class="idea" onclick={() => void alef.ask(q)}>{q}</button>
          {/each}
        </div>
      </div>
    {/if}

    {#each alef.messages as m (m.id)}
      {#if m.who === 'you'}
        <div class="me" in:fly={{ y: 6, duration: rm ? 0 : 220, easing: cubicOut }}>{m.text}</div>
      {:else}
        <div class="it" in:fly={{ y: 6, duration: rm ? 0 : 260, easing: cubicOut }}>
          <AlefMini feeling={m.feeling ?? 'pleased'} {eyes} size={34} />
          <div class="body">
            {#if m.pending}
              <p class="dots" aria-label="Alef is thinking"><i></i><i></i><i></i></p>
            {:else}
              <p class="said" class:err={m.error}>{m.text}</p>
              {#if m.note}<p class="note"><Icon name="info" size={13} /> {m.note}</p>{/if}
              {#if m.tools?.length}
                <p class="used">{#each toolWords(m.tools) as w (w)}<span>{w}</span>{/each}</p>
              {/if}
              {#if m.entry?.result}
                {@const card = m.entry.result.card}
                {#if card.kind === 'choice'}
                  <div class="ideas">
                    {#each card.options as o, i (i)}
                      <button class="idea" onclick={() => pick(o)}><Icon name={o.icon ?? 'sparkles'} size={13} /> {o.label}</button>
                    {/each}
                  </div>
                {:else if card.kind === 'help'}
                  <div class="ideas">
                    {#each HELP_GROUPS.flatMap((g) => g.examples.slice(0, 1)) as q (q)}
                      <button class="idea" onclick={() => void alef.ask(q)}>{q}</button>
                    {/each}
                  </div>
                {:else if card.kind !== 'note'}
                  <div class="card"><Card entry={m.entry} /></div>
                {/if}
              {/if}
            {/if}
          </div>
        </div>
      {/if}
    {/each}
    {#if alef.messages.length}
      <button class="clear" onclick={() => alef.clearChat()}>Clear the chat</button>
    {/if}
  </div>
{/if}

<style>
  .feed {
    display: grid;
    gap: var(--s-3);
    padding-bottom: var(--s-2);
  }
  .intro p {
    margin: 0 0 var(--s-3);
    font-size: var(--t-sm);
    line-height: 1.5;
    color: var(--ink-2);
  }
  .ideas {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .idea {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    padding: 4px 12px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    font-size: var(--t-xs);
    color: var(--ink-2);
    text-align: left;
    transition:
      background var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .idea:hover {
    border-color: var(--ink-3);
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 4%, transparent);
  }
  .idea:active {
    transform: scale(0.97);
  }
  .me {
    justify-self: end;
    max-width: 82%;
    padding: 8px 12px;
    border-radius: 16px 16px 4px 16px;
    background: var(--ink);
    color: var(--raised);
    font-size: var(--t-sm);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .it {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    max-width: 100%;
  }
  .it :global(.mini) {
    margin-top: 2px;
  }
  .body {
    min-width: 0;
    flex: 1;
  }
  .said {
    margin: 0;
    display: inline-block;
    max-width: 100%;
    padding: 8px 12px;
    border-radius: 4px 16px 16px 16px;
    background: color-mix(in srgb, var(--ink) 6%, var(--raised));
    font-size: var(--t-sm);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .said.err {
    color: var(--ink-2);
  }
  .note {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    margin: 6px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .used {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 6px 0 0;
  }
  .used span {
    padding: 2px 8px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--focus-ring) 12%, transparent);
    color: var(--ink-2);
    font-size: 11px;
  }
  .card {
    margin-top: var(--s-2);
  }
  .dots {
    display: inline-flex;
    gap: 4px;
    margin: 0;
    padding: 12px 14px;
    border-radius: 4px 16px 16px 16px;
    background: color-mix(in srgb, var(--ink) 6%, var(--raised));
  }
  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink-3);
    animation: dot 1.1s ease-in-out infinite;
  }
  .dots i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .dots i:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes dot {
    0%,
    100% {
      opacity: 0.3;
      transform: translateY(0);
    }
    40% {
      opacity: 1;
      transform: translateY(-3px);
    }
  }
  .clear {
    justify-self: center;
    margin-top: var(--s-2);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .clear:hover {
    color: var(--ink);
  }
  .say {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .say .field {
    flex: 1;
    min-width: 0;
    border-radius: var(--r-pill);
    padding-inline: 14px;
  }
  .mic {
    flex: none;
    display: inline-grid;
  }
  .send {
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--ink);
    color: var(--raised);
    transition:
      opacity var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .send:disabled {
    opacity: 0.3;
  }
  .send:not(:disabled):active {
    transform: scale(0.92);
  }
  @media (prefers-reduced-motion: reduce) {
    .dots i {
      animation: none;
    }
  }
</style>
