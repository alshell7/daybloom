<script lang="ts">
  // The Breadcrumbs panel: thoughts you parked (send them to the backlog or let them go), the
  // last note you left on each task, and when Daybloom should ask.
  import { cubicOut } from 'svelte/easing';
  import { fly, slide } from 'svelte/transition';
  import { ago, crumbs, crumbsFile } from '../../../lib/addons/crumbs/crumbs.svelte';
  import { categoryColor } from '../../../lib/engine/categories';
  import Icon from '../../../lib/Icon.svelte';
  import { shownTitle } from '../../../lib/privacy';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { taskFile } from '../../../lib/stores/tasks.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import Panel from '../../Panel.svelte';

  const open = $derived(view.sheet?.kind === 'crumbs');
  const rm = $derived(view.reducedMotion);
  const parked = $derived([...crumbs.parked].sort((a, b) => b.at - a.at));

  /** The newest note per task, newest first. */
  const latest = $derived.by(() => {
    const seen = new Set<string>();
    const out = [];
    for (const c of [...crumbs.list].sort((a, b) => b.at - a.at)) {
      if (seen.has(c.taskId)) continue;
      seen.add(c.taskId);
      const task = taskFile.value.tasks.find((t) => t.id === c.taskId);
      out.push({ c, task, count: crumbs.of(c.taskId).length });
      if (out.length >= 14) break;
    }
    return out;
  });

  function allToBacklog() {
    const n = crumbs.toBacklog(parked.map((p) => p.id));
    if (n) view.say(`${n === 1 ? '1 thought' : `${n} thoughts`} moved to the backlog`);
  }
</script>

{#if open}
  <Panel title="Breadcrumbs" onclose={() => (view.sheet = null)} accent="#B07E06">
    <div class="cp">
      {#if parked.length}
        <section>
          <div class="sh">
            <h3>Parked thoughts</h3>
            {#if parked.length > 1}<button class="link" onclick={allToBacklog}><Icon name="inbox" size={13} /> All to the backlog</button>{/if}
          </div>
          <ul class="parked">
            {#each parked as p (p.id)}
              <li in:fly={{ y: -4, duration: rm ? 0 : 220 }} out:slide={{ duration: rm ? 0 : 160 }}>
                <div class="pt">
                  <p>{p.text}</p>
                  <small class="tnum">{ago(p.at, clock.minute)}{p.from ? ` · during ${shownTitle(p.from, 'focus')}` : ''}</small>
                </div>
                <button class="mini" onclick={() => crumbs.toBacklog([p.id])} title="Send to the backlog" aria-label="Send to the backlog"><Icon name="inbox" size={14} /></button>
                <button class="mini" onclick={() => crumbs.letGo([p.id])} title="Let it go" aria-label="Let it go"><Icon name="x" size={14} /></button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <section>
        <h3>Where you left off</h3>
        {#if latest.length}
          <ul class="notes">
            {#each latest as { c, task, count }, i (c.id)}
              <li in:fly={{ y: 8, duration: rm ? 0 : 300, delay: rm ? 0 : i * 40, easing: cubicOut }}>
                <button class="note" onclick={() => task && (view.sheet = { kind: 'edit', key: `later:${task.id}` })} disabled={!task}>
                  <span class="who"><i style:background={categoryColor(task?.category ?? 'focus', view.finish.dark)}></i>{shownTitle(task?.title ?? c.title, task?.category ?? 'focus')}{#if !task}<em> · gone</em>{/if}</span>
                  <span class="txt">{c.text}</span>
                  <span class="meta tnum">{ago(c.at, clock.minute)}{count > 1 ? ` · ${count} notes` : ''}</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="empty">
            <span class="pin"><Icon name="pin" size={18} stroke={2} /></span>
            <p>No breadcrumbs yet. When you step away from a task in focus, Daybloom asks where you left off, and keeps your answer here and on the task.</p>
          </div>
        {/if}
      </section>

      <section>
        <h3>When to ask</h3>
        <label class="row">
          <span>When I leave focus mode</span>
          <input type="checkbox" class="switch" bind:checked={crumbsFile.value.settings.askOnLeave} />
        </label>
        <label class="row">
          <span>When a focus session ends</span>
          <input type="checkbox" class="switch" bind:checked={crumbsFile.value.settings.askOnStop} />
        </label>
        <p class="hint">You can leave a note on any task, any time, in its details. With sync on, your notes also go to your other devices.</p>
      </section>
    </div>
  </Panel>
{/if}

<style>
  .cp {
    --amber: #b07e06;
  }
  :global([data-theme='dark']) .cp {
    --amber: #e2b44a;
  }
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  section:first-child {
    border-top: 0;
    padding-top: 0;
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
  .link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
  }
  .link:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .parked li {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 6px 8px 12px;
    border-radius: var(--r-md);
    background: var(--sunken);
  }
  .pt {
    flex: 1;
    min-width: 0;
  }
  .pt p {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .pt small {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .mini {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: none;
    border-radius: 50%;
    color: var(--ink-3);
  }
  .mini:hover {
    background: var(--raised);
    color: var(--ink);
  }
  .note {
    display: grid;
    gap: 3px;
    width: 100%;
    padding: 10px 12px;
    border-radius: var(--r-md);
    text-align: left;
    background: color-mix(in srgb, var(--amber) 6%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--amber) 18%, var(--line));
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .note:hover:not(:disabled) {
    background: color-mix(in srgb, var(--amber) 11%, var(--surface));
  }
  .note:active:not(:disabled) {
    transform: scale(0.99);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
  }
  .who i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .who em {
    font-style: normal;
    color: var(--ink-3);
  }
  .txt {
    font-family: var(--font-read);
    font-size: var(--t-sm);
    line-height: 1.45;
    color: var(--ink);
  }
  .meta {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .empty {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .empty .pin {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: none;
    border-radius: 50%;
    color: var(--amber);
    background: color-mix(in srgb, var(--amber) 14%, transparent);
  }
  .empty p,
  .hint {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.5;
    color: var(--ink-3);
  }
  .hint {
    margin-top: var(--s-2);
    font-size: var(--t-xs);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 40px;
    font-size: var(--t-sm);
  }
</style>
