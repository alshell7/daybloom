<script lang="ts">
  // Pick for me: a few cards from your backlog, dealt for this moment. You choose — or deal
  // again, or let one go for now. Each card says honestly why it was dealt, how it invites you
  // (a mystery card, a ten-minute dare, just the first step…) and the tiny first thing to do.
  // Its settings are here too (the gear).
  import { untrack } from 'svelte';
  import { fly, slide } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { ai } from '../../lib/ai/hub.svelte';
  import { categoryColor } from '../../lib/engine/categories';
  import Icon from '../../lib/Icon.svelte';
  import { QUADRANTS } from '../../lib/matrix';
  import { HOOK_BY_ID } from '../../lib/pick';
  import { picker, type Card } from '../../lib/pick.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Panel from '../Panel.svelte';
  import Segmented from '../Segmented.svelte';

  const open = $derived(view.sheet?.kind === 'pick');
  const rm = $derived(view.reducedMotion);
  let gear = $state(false);

  $effect(() => {
    if (!open) return;
    const s = view.sheet;
    // Deal once per opening, not again whenever the backlog changes.
    untrack(() => picker.deal(s?.kind === 'pick' ? s.only : undefined));
  });

  const qOf = (c: Card) => QUADRANTS.find((q) => q.id === c.quadrant)!;
  const free = $derived(picker.freeMin);
  const sub = $derived(
    free >= 5 ? `${free >= 120 ? 'Plenty of' : `${free} minutes of`} free time. Choose what feels right — or deal again.` : 'Choose what feels right — or deal again.',
  );
  const p = $derived(settings.value.pick);
  const aiOn = $derived(ai.ready('starter', 'think'));
</script>

{#if open}
  <Panel title="Pick one" onclose={() => (view.sheet = null)} accent="#DB4F94" tall>
    <div class="pick">
      <p class="sub">{sub}</p>

      {#if gear}
        <section class="gear" transition:slide={{ duration: rm ? 0 : 220, easing: cubicOut }} aria-label="Pick for me settings">
          <div class="row">
            <span>Cards to choose from</span>
            <Segmented
              label="Cards to choose from"
              value={String(p.choices) as '2' | '3' | '4'}
              options={[
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '4', label: '4' },
              ]}
              onchange={(v) => (settings.value.pick = { ...p, choices: Number(v) as 2 | 3 | 4 })}
            />
          </div>
          <label class="row"><span>Playful cards <small>Mystery cards, dares, “do it badly”, beat the clock</small></span><input type="checkbox" class="switch" checked={p.playful} onchange={(e) => (settings.value.pick = { ...p, playful: e.currentTarget.checked })} /></label>
          <label class="row"><span>Include Someday</span><input type="checkbox" class="switch" checked={p.someday} onchange={(e) => (settings.value.pick = { ...p, someday: e.currentTarget.checked })} /></label>
          <label class="row"><span>Offer a pick in free time <small>A “Pick something” button on free stretches in the timeline</small></span><input type="checkbox" class="switch" checked={p.inGaps} onchange={(e) => (settings.value.pick = { ...p, inGaps: e.currentTarget.checked })} /></label>
          <label class="row"><span>Words from AI <small>{aiOn ? 'The AI service for Getting started writes each first step and invitation' : 'Choose an AI service for Getting started in Settings › AI'}</small></span><input type="checkbox" class="switch" checked={p.ai} disabled={!aiOn} onchange={(e) => (settings.value.pick = { ...p, ai: e.currentTarget.checked })} /></label>
        </section>
      {/if}

      {#if picker.cards.length}
        <ol class="deck" aria-label="Cards to choose from">
          {#each picker.cards as c, i (c.task.id)}
            {@const h = HOOK_BY_ID[c.hook]}
            {@const q = qOf(c)}
            <li
              class="card"
              class:hidden={!c.open}
              style:--c={categoryColor(c.task.category, view.finish.dark)}
              style:--i={i}
              animate:flip={{ duration: rm ? 0 : 260 }}
              in:fly={{ y: 18, duration: rm ? 0 : 340, delay: rm ? 0 : i * 70, easing: cubicOut }}
              out:fly={{ x: -40, duration: rm ? 0 : 220 }}
            >
              <div class="top">
                <span class="hook"><Icon name={h.icon} size={13} stroke={2.2} /> {h.label}</span>
                <span class="q" title={q.hint}><Icon name={q.icon} size={11} /> {q.title}</span>
              </div>
              {#if !c.open}
                <button class="reveal" onclick={() => picker.turn(c)} aria-label="Turn the mystery card over">
                  <span class="qm" aria-hidden="true">?</span>
                  <span>Turn it over</span>
                </button>
              {:else}
                <h3 class="title">{c.task.title}</h3>
                {#if c.reasons.length}<p class="why">{c.reasons.join(' · ')}</p>{/if}
                <p class="line">{c.line}</p>
                <p class="step"><span class="first">{c.ai ? '✦ ' : ''}First</span> {c.step}</p>
                <div class="acts">
                  <button class="btn btn-primary go" onclick={() => picker.start(c)}>
                    <Icon name="play" size={14} /> Start {c.minutes} min
                  </button>
                  <button class="btn btn-quiet" onclick={() => picker.pass(c)} aria-label={`Not ${c.task.title} for now`}>Not this one</button>
                </div>
              {/if}
            </li>
          {/each}
        </ol>
        {#if picker.writing}<p class="writing" role="status">Writing each card’s first step…</p>{/if}
      {:else}
        <div class="empty">
          <span class="halo"><Icon name="inbox" size={18} /></span>
          <p>Nothing is waiting in your backlog.</p>
          <button class="btn btn-soft" onclick={() => (view.sheet = { kind: 'jot' })}><Icon name="plus" size={14} /> Jot something down</button>
        </div>
      {/if}
    </div>
    {#snippet footer()}
      <button class="icon-btn" class:on={gear} onclick={() => (gear = !gear)} aria-expanded={gear} aria-label="Pick for me settings" title="Settings"><Icon name="sliders" size={17} /></button>
      <button class="btn btn-quiet" onclick={() => (view.sheet = { kind: 'backlog' })}><Icon name="layout-grid" size={15} /> Backlog</button>
      <span class="grow"></span>
      <button class="btn btn-soft" onclick={() => picker.deal()} disabled={picker.pool().length === 0}><Icon name="shuffle" size={15} /> Deal again</button>
    {/snippet}
  </Panel>
{/if}

<style>
  .pick {
    display: grid;
    gap: var(--s-3);
  }
  .sub {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .deck {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--s-3);
  }
  .card {
    position: relative;
    display: grid;
    gap: 8px;
    padding: 14px 14px 12px;
    border-radius: 18px;
    background:
      radial-gradient(120% 80% at 100% 0%, color-mix(in srgb, var(--c) 16%, transparent), transparent 60%),
      var(--raised);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--c) 28%, var(--line)),
      0 6px 18px -10px color-mix(in srgb, var(--c) 60%, transparent);
  }
  .card.hidden {
    background: repeating-linear-gradient(135deg, color-mix(in srgb, #db4f94 10%, var(--raised)) 0 12px, var(--raised) 12px 24px);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .hook {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs, 12px);
    font-weight: 600;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 14%, transparent);
  }
  .card.hidden .hook {
    color: #db4f94;
    background: color-mix(in srgb, #db4f94 14%, transparent);
  }
  .q {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--t-xs, 12px);
    color: var(--ink-3);
  }
  .title {
    margin: 2px 0 0;
    font-size: 18px;
    line-height: 1.25;
    font-weight: 600;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .why {
    margin: 0;
    font-size: var(--t-xs, 12px);
    color: var(--ink-2);
  }
  .line {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink);
  }
  .step {
    margin: 0;
    padding: 8px 10px;
    border-radius: 12px;
    font-size: var(--t-sm);
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  .first {
    margin-right: 4px;
    font-size: var(--t-xs, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--c);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
  }
  .go {
    min-height: 44px;
    padding-inline: 18px;
  }
  .reveal {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 18px 0 14px;
    border-radius: 14px;
    font-weight: 600;
    color: var(--ink);
  }
  .reveal:focus-visible,
  .go:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .qm {
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    border-radius: 50%;
    font-size: 28px;
    color: #fff;
    background: #db4f94;
    box-shadow: 0 8px 22px -8px #db4f94;
    animation: bob 2.4s ease-in-out infinite;
  }
  @keyframes bob {
    50% {
      transform: translateY(-3px) rotate(-6deg);
    }
  }
  .writing {
    margin: 0;
    font-size: var(--t-xs, 12px);
    color: var(--ink-3);
  }
  .gear {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    border-radius: var(--r-md);
    background: var(--sunken);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    font-size: var(--t-sm);
    color: var(--ink);
  }
  .row small {
    display: block;
    font-size: var(--t-xs, 12px);
    color: var(--ink-3);
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: var(--s-5) 0;
    color: var(--ink-2);
  }
  .halo {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--sunken);
  }
  .grow {
    flex: 1;
  }
  .icon-btn.on {
    color: var(--ink);
    background: var(--sunken);
  }
  @media (min-width: 861px) {
    .deck {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .qm {
      animation: none;
    }
  }
</style>
