<script lang="ts">
  // Talking with Alef, face to face. Alef sits on a little stage: it watches the field while you
  // type, thinks visibly, then answers in a big speech bubble that writes itself out as it
  // speaks, with the planner's card (and its Undo) when the answer came from this device, and a
  // few things to ask next. Earlier talk stays below. The field you type in lives in the panel's
  // footer (`input`).
  import { tick, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly, scale } from 'svelte/transition';
  import { alef, alefFile, type Msg } from '../../../lib/addons/alef/alef.svelte';
  import { ACTS } from '../../../lib/addons/alef/behaviors';
  import { providerOf } from '../../../lib/addons/alef/llm';
  import { md } from '../../../lib/addons/alef/md';
  import type { Option } from '../../../lib/assistant/tools';
  import { HELP_GROUPS } from '../../../lib/assistant/tools';
  import Icon from '../../../lib/Icon.svelte';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import { voice } from '../../../lib/voice/voice.svelte';
  import Card from '../../assistant/Card.svelte';
  import MicButton from '../../voice/MicButton.svelte';
  import AlefFace from './AlefFace.svelte';
  import AlefMini from './AlefMini.svelte';

  let { input = false }: { input?: boolean } = $props();

  const s = $derived(alefFile.value.settings);
  const pal = $derived(alef.screenFor(view.finish));
  const rm = $derived(view.reducedMotion);

  const brainLine = $derived(
    s.brain === 'local' ? 'thinks on this device' : alef.aiReady ? `thinks with ${providerOf(s.brain).name}` : `${providerOf(s.brain).name} isn't set up · thinks on this device`,
  );
  const mood = $derived(alef.thinking ? 'thinking…' : alef.typing ? 'listening' : ACTS[alef.perf.id].label.toLowerCase().replace(' (cute)', ''));

  // The latest exchange is on the stage; everything before it is "earlier".
  const lastAlef = $derived([...alef.messages].reverse().find((m) => m.who === 'alef') ?? null);
  const asked = $derived.by(() => {
    if (!lastAlef) return null;
    const i = alef.messages.indexOf(lastAlef);
    const prev = alef.messages[i - 1];
    return prev?.who === 'you' ? prev : null;
  });
  const earlier = $derived.by(() => {
    if (!lastAlef) return [] as Msg[];
    const cut = asked ? alef.messages.indexOf(asked) : alef.messages.indexOf(lastAlef);
    return alef.messages.slice(0, cut);
  });
  let showEarlier = $state(false);

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

  // ── The bubble writes itself out while Alef speaks ──
  let shown = $state(Infinity);
  const done = new Set<number>();
  let typer: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    const m = lastAlef;
    const pending = m?.pending;
    untrack(() => {
      if (typer) clearInterval(typer);
      typer = null;
      if (!m || pending) return void (shown = 0);
      const full = m.text.length;
      if (rm || done.has(m.id) || input) return void (shown = full);
      const secs = Math.max(0.5, Math.min(5, alef.talk?.total ?? full / 40));
      const step = Math.max(1, full / ((secs * 1000) / 28));
      shown = 0;
      typer = setInterval(() => {
        shown = Math.min(full, shown + step);
        if (shown >= full) {
          done.add(m.id);
          if (typer) clearInterval(typer);
          typer = null;
        }
      }, 28);
    });
    return () => {
      if (typer) clearInterval(typer);
    };
  });
  const writing = $derived(!!lastAlef && !lastAlef.pending && shown < lastAlef.text.length);

  // New talk: bring the stage into view.
  let stage = $state<HTMLDivElement>();
  $effect(() => {
    void alef.messages.length;
    if (input) return;
    tick().then(() => {
      const box = stage?.closest('.content') as HTMLElement | null;
      if (box && box.scrollTop > 0) box.scrollTo({ top: 0, behavior: rm ? 'auto' : 'smooth' });
    });
  });

  // ── The field ──
  let text = $state('');
  let field = $state<HTMLInputElement>();
  function send(e?: SubmitEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || alef.busy) return;
    text = '';
    alef.typing = false;
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
  $effect(() => {
    if (!input) return;
    const on = dictating || text.trim().length > 0;
    untrack(() => (alef.typing = on));
  });

  const pick = (o: Option) => void alef.run(o.call, o.label);
</script>

{#snippet card(m: Msg)}
  {#if m.entry?.result}
    {@const c = m.entry.result.card}
    {#if c.kind === 'choice'}
      <div class="ideas">
        {#each c.options as o, i (i)}
          <button class="idea" onclick={() => pick(o)}><Icon name={o.icon ?? 'sparkles'} size={13} /> {o.label}</button>
        {/each}
      </div>
    {:else if c.kind === 'help'}
      <div class="ideas">
        {#each HELP_GROUPS.flatMap((g) => g.examples.slice(0, 1)) as q (q)}
          <button class="idea" onclick={() => void alef.ask(q)}>{q}</button>
        {/each}
      </div>
    {:else if c.kind !== 'note'}
      <div class="card"><Card entry={m.entry} /></div>
    {/if}
  {/if}
{/snippet}

{#if input}
  <form class="say" onsubmit={send} data-voice="alef" class:busy={alef.busy}>
    <input
      bind:this={field}
      bind:value={text}
      class="field"
      placeholder={dictating ? voice.live || 'Listening…' : alef.busy ? 'Alef is thinking…' : 'Talk to Alef…'}
      aria-label="Talk to Alef"
      autocomplete="off"
      enterkeyhint="send"
      maxlength="600"
      onblur={() => (alef.typing = false)}
    />
    <span class="mic"><MicButton surface="alef" size={32} label="Speak to Alef" /></span>
    <button class="send" type="submit" disabled={!text.trim() || alef.busy} aria-label="Send"><Icon name="arrow-up" size={17} stroke={2.4} /></button>
  </form>
{:else}
  <div class="stage" bind:this={stage} style:--eye={pal.eye}>
    <div class="me">
      <AlefFace
        perf={alef.perf}
        performing={alef.performing}
        affect={alef.affect}
        talk={alef.talk}
        screen={pal}
        led={s.led}
        reduced={rm}
        posture
        attend={alef.typing ? { x: 0, y: 0.9 } : null}
        onpoke={() => alef.poke()}
        ontouch={(k) => alef.touch(k)}
      />
    </div>
    <p class="mood"><span class="dot" class:on={alef.thinking || alef.typing || !!alef.talk}></span>Alef · {mood} · {brainLine}</p>

    {#if asked}
      {#key asked.id}
        <p class="asked" in:fly={{ y: 8, duration: rm ? 0 : 260, easing: cubicOut }}>{asked.text}</p>
      {/key}
    {/if}

    {#key lastAlef?.id ?? 0}
      <div class="speech" class:err={lastAlef?.error} in:scale={{ start: 0.86, duration: rm ? 0 : 420, easing: cubicOut }}>
        {#if !lastAlef}
          <p>Hi! I'm <b>Alef</b>. I keep you company while you work, cheer your wins and help you plan. What shall we do?</p>
        {:else if lastAlef.pending}
          <p class="dots" aria-label="Alef is thinking"><i></i><i></i><i></i></p>
        {:else if writing}
          <p>{lastAlef.text.slice(0, Math.floor(shown))}<span class="caret"></span></p>
        {:else}
          <div class="md">{@html md(lastAlef.text)}</div>
        {/if}
      </div>
    {/key}

    {#if lastAlef && !lastAlef.pending && !writing}
      <div class="after" in:fly={{ y: 6, duration: rm ? 0 : 260, easing: cubicOut }}>
        {#if lastAlef.note}<p class="note"><Icon name="info" size={13} /> {lastAlef.note}</p>{/if}
        {#if lastAlef.tools?.length}
          <p class="used">{#each toolWords(lastAlef.tools) as w (w)}<span>{w}</span>{/each}</p>
        {/if}
        {@render card(lastAlef)}
      </div>
    {/if}

    {#if !alef.busy && !writing && (!lastAlef || !lastAlef.entry || lastAlef.entry.result?.card.kind === 'note')}
      <div class="ideas next" in:fly={{ y: 6, duration: rm ? 0 : 300, delay: rm ? 0 : 120, easing: cubicOut }}>
        {#each ideas as q (q)}
          <button class="idea" onclick={() => void alef.ask(q)}>{q}</button>
        {/each}
      </div>
    {/if}
  </div>

  {#if earlier.length}
    <section class="earlier">
      <button class="toggle" onclick={() => (showEarlier = !showEarlier)} aria-expanded={showEarlier}>
        <Icon name={showEarlier ? 'chevron-down' : 'chevron-right'} size={14} />
        Earlier <span class="count">{earlier.filter((m) => m.who === 'you').length}</span>
      </button>
      <span class="spacer"></span>
      <button class="clear" onclick={() => alef.clearChat()}>Clear</button>
    </section>
    {#if showEarlier}
      <div class="log">
        {#each earlier as m (m.id)}
          {#if m.who === 'you'}
            <p class="me-line">{m.text}</p>
          {:else if !m.pending}
            <div class="it-line">
              <AlefMini feeling={m.feeling ?? 'pleased'} screen={pal} size={30} />
              <div class="body">
                <div class="said md">{@html md(m.text)}</div>
                {@render card(m)}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  {/if}
{/if}

<style>
  /* ── The stage ── */
  .stage {
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 6px 0 var(--s-3);
  }
  .me {
    width: 156px;
    padding: 10px;
  }
  .mood {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin: -2px 0 2px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ink-3);
    opacity: 0.45;
    transition:
      background 300ms ease,
      opacity 300ms ease;
  }
  .dot.on {
    background: var(--eye);
    opacity: 1;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--eye) 25%, transparent);
  }
  .asked {
    margin: 0;
    max-width: 86%;
    padding: 6px 12px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink-2);
    font-size: var(--t-xs);
    text-align: center;
    overflow-wrap: anywhere;
  }
  .asked::before {
    content: 'You: ';
    color: var(--ink-3);
  }
  /* Alef's speech: a big bubble whose tail points up at its face. */
  .speech {
    position: relative;
    width: min(100%, 460px);
    padding: 14px 18px;
    border-radius: 22px;
    background: var(--raised);
    color: var(--ink);
    box-shadow:
      0 14px 36px -18px rgba(12, 22, 40, 0.35),
      0 0 0 1px var(--line);
    font-size: 15px;
    line-height: 1.5;
    text-align: left;
    transform-origin: 50% 0;
  }
  .speech::before {
    content: '';
    position: absolute;
    left: 50%;
    top: -7px;
    width: 14px;
    height: 14px;
    translate: -50% 0;
    rotate: 45deg;
    background: var(--raised);
    box-shadow: -1px -1px 0 var(--line);
    border-radius: 3px 0 0 0;
  }
  .speech p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .speech.err {
    color: var(--ink-2);
  }
  .md :global(p) {
    margin: 0;
  }
  .md :global(p + p),
  .md :global(p + ul),
  .md :global(ul + p),
  .md :global(p + ol),
  .md :global(ol + p) {
    margin-top: 8px;
  }
  .md :global(ul),
  .md :global(ol) {
    margin: 4px 0 0;
    padding-left: 20px;
  }
  .md :global(li + li) {
    margin-top: 2px;
  }
  .md :global(code) {
    padding: 1px 5px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    font-size: 0.9em;
  }
  .caret {
    display: inline-block;
    width: 2px;
    height: 1em;
    margin-left: 2px;
    vertical-align: -2px;
    background: var(--eye);
    border-radius: 1px;
  }
  .dots {
    display: inline-flex;
    gap: 5px;
    padding: 4px 0;
  }
  .dots i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--eye);
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
      transform: translateY(-4px);
    }
  }
  .after {
    width: min(100%, 460px);
    display: grid;
    gap: 8px;
  }
  .note {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    margin: 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .used {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
  }
  .used span {
    padding: 2px 9px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--eye) 16%, transparent);
    color: var(--ink-2);
    font-size: 11px;
  }
  .ideas {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .ideas.next {
    justify-content: center;
    width: min(100%, 460px);
  }
  .idea {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    padding: 4px 12px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    background: var(--raised);
    font-size: var(--t-xs);
    color: var(--ink-2);
    text-align: left;
    transition:
      background var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out);
  }
  .idea:hover {
    border-color: color-mix(in srgb, var(--eye) 60%, var(--line-strong));
    color: var(--ink);
    transform: translateY(-1px);
  }
  .idea:active {
    transform: scale(0.97);
  }

  /* ── Earlier ── */
  .earlier {
    display: flex;
    align-items: center;
    padding-top: var(--s-3);
    border-top: 1px solid var(--line);
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
  }
  .count {
    padding: 0 6px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    color: var(--ink-3);
    font-weight: 400;
  }
  .spacer {
    flex: 1;
  }
  .clear {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .clear:hover {
    color: var(--ink);
  }
  .log {
    display: grid;
    gap: 10px;
    padding: var(--s-3) 0 var(--s-2);
  }
  .me-line {
    justify-self: end;
    max-width: 82%;
    margin: 0;
    padding: 7px 12px;
    border-radius: 16px 16px 4px 16px;
    background: var(--ink);
    color: var(--raised);
    font-size: var(--t-sm);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .it-line {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .it-line :global(.mini) {
    margin-top: 3px;
  }
  .body {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 8px;
  }
  .said {
    justify-self: start;
    max-width: 100%;
    padding: 8px 12px;
    border-radius: 4px 16px 16px 16px;
    background: color-mix(in srgb, var(--ink) 6%, var(--raised));
    font-size: var(--t-sm);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  /* ── The field ── */
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
    height: 40px;
    border-radius: var(--r-pill);
    padding-inline: 16px;
    transition:
      border-color var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }
  .mic {
    flex: none;
    display: inline-grid;
  }
  .send {
    flex: none;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--ink);
    color: var(--raised);
    transition:
      opacity var(--dur-1) var(--ease-out),
      transform var(--dur-2) var(--ease-settle);
  }
  .send:disabled {
    opacity: 0.25;
    transform: scale(0.9);
  }
  .send:not(:disabled):active {
    transform: scale(0.9);
  }
  @media (prefers-reduced-motion: reduce) {
    .dots i {
      animation: none;
    }
  }
</style>
