<script lang="ts">
  // The addon gallery. Each addon is a card: what it adds, and one switch. Switching on
  // gives a small celebration and an "Open" button; the addon also appears in the top bar.
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { ADDONS, isOn, setOn, type AddonMeta } from '../../lib/addons/registry';
  import Icon from '../../lib/Icon.svelte';
  import { sounds } from '../../lib/sound';
  import { settings } from '../../lib/stores/settings.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Panel from '../Panel.svelte';

  const open = $derived(view.sheet?.kind === 'addons');
  let fresh = $state<string | null>(null);

  function toggle(a: AddonMeta, e: Event) {
    const on = !isOn(a.id);
    setOn(a.id, on);
    if (on) {
      fresh = a.id;
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      view.spark(r.left + r.width / 2, r.top + r.height / 2, a.accent, true);
      if (settings.value.sound) sounds.done();
      setTimeout(() => fresh === a.id && (fresh = null), 1400);
    }
  }
</script>

{#if open}
  <Panel title="Addons" onclose={() => (view.sheet = null)} wide>
    <div class="ad">
      <p class="lead">Add new powers to Daybloom. Switch an addon off at any time — your day stays exactly as it was.</p>

      {#each ADDONS as a, i (a.id)}
        {@const on = isOn(a.id)}
        <article
          class="card"
          class:on
          class:fresh={fresh === a.id}
          style:--ac={a.accent}
          in:fly={{ y: 10, duration: view.reducedMotion ? 0 : 320, delay: view.reducedMotion ? 0 : i * 60, easing: cubicOut }}
        >
          <header>
            <span class="tile"><Icon name={a.icon} size={22} stroke={1.9} /></span>
            <div class="name">
              <h3>{a.name}</h3>
              <p>{a.tagline}</p>
            </div>
            <label class="switch-wrap" title={on ? `Turn ${a.name} off` : `Turn ${a.name} on`}>
              <input type="checkbox" class="switch" checked={on} onchange={(e) => toggle(a, e)} aria-label={`${a.name} addon`} />
            </label>
          </header>
          <p class="desc">{a.description}</p>
          <ul>
            {#each a.features as f (f.text)}
              <li><Icon name={f.icon} size={14} stroke={2} /> {f.text}</li>
            {/each}
          </ul>
          {#if on}
            <div class="go" in:fly={{ y: -4, duration: view.reducedMotion ? 0 : 220 }}>
              <button class="btn btn-soft" onclick={() => (view.sheet = { kind: a.sheet })}>Open {a.name} <Icon name="arrow-right" size={14} /></button>
              <span class="hint">Also in the top bar</span>
            </div>
          {/if}
        </article>
      {/each}

      <p class="more"><Icon name="puzzle" size={14} /> More addons are on the way.</p>
    </div>
  </Panel>
{/if}

<style>
  .ad {
    display: grid;
    gap: var(--s-4);
  }
  .lead {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
    line-height: 1.5;
  }
  .card {
    position: relative;
    display: grid;
    gap: var(--s-3);
    padding: var(--s-4);
    border-radius: var(--r-lg);
    background: var(--raised);
    border: 1px solid var(--line);
    transition:
      border-color var(--dur-3) var(--ease-out),
      box-shadow var(--dur-3) var(--ease-out);
  }
  .card.on {
    border-color: color-mix(in srgb, var(--ac) 45%, var(--line));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--ac) 10%, transparent);
  }
  .card.fresh {
    animation: hello 1.2s var(--ease-out);
  }
  @keyframes hello {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--ac) 45%, transparent);
    }
    60% {
      box-shadow: 0 0 0 10px color-mix(in srgb, var(--ac) 0%, transparent);
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--s-3);
  }
  .tile {
    display: grid;
    place-items: center;
    flex: none;
    width: 46px;
    height: 46px;
    border-radius: 14px;
    color: var(--ac);
    background: color-mix(in srgb, var(--ac) 14%, transparent);
    transition:
      background var(--dur-3) var(--ease-out),
      color var(--dur-3) var(--ease-out),
      transform var(--dur-3) var(--ease-out);
  }
  .card.on .tile {
    color: #fff;
    background: var(--ac);
  }
  .card.fresh .tile {
    animation: pop 600ms var(--ease-out);
  }
  @keyframes pop {
    40% {
      transform: scale(1.14) rotate(-6deg);
    }
  }
  .name {
    flex: 1;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: var(--t-md);
    font-weight: 600;
  }
  .name p {
    margin: 2px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .desc {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.5;
    color: var(--ink-2);
  }
  ul {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  li :global(svg) {
    flex: none;
    color: var(--ac);
  }
  .go {
    display: flex;
    align-items: center;
    gap: var(--s-3);
  }
  .hint {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .more {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
</style>
