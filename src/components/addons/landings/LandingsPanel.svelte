<script lang="ts">
  // Soft landings: how much room to keep after meetings, when to offer a landing, which
  // stepping stones to offer, today's back-to-back hand-offs (with "Make room"), and the week.
  import { platform } from '../../../lib/platform';
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { handoffs, headline, pickStones, STONES } from '../../../lib/addons/landings/landings';
  import { landings } from '../../../lib/addons/landings/landings.svelte';
  import { ALL_STONES, landingsFile } from '../../../lib/addons/landings/pad.svelte';
  import { formatTime, hourOf } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import { shownTitle } from '../../../lib/privacy';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import Panel from '../../Panel.svelte';
  import Segmented from '../../Segmented.svelte';

  const open = $derived(view.sheet?.kind === 'landings');
  const rm = $derived(view.reducedMotion);
  const s = $derived(landingsFile.value.settings);
  const today = $derived(handoffs(view.dayBlocks, Math.max(s.buffer, 5)));
  const weekAgo = $derived(clock.minute - 7 * 86_400_000);
  const week = $derived(landingsFile.value.log.filter((l) => l.at > weekAgo));
  const taken = $derived(week.filter((l) => l.stone));
  const favourite = $derived.by(() => {
    const n = new Map<string, number>();
    for (const l of taken) n.set(l.stone!, (n.get(l.stone!) ?? 0) + 1);
    const best = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best) return null;
    return best[0] === 'step' ? 'a first step into what’s next' : STONES.find((x) => x.id === best[0])?.title.toLowerCase() ?? null;
  });

  function toggle(id: string) {
    const cur = s.stones;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    if (next.length) landingsFile.value.settings.stones = next.filter((x) => ALL_STONES.includes(x));
  }
  function preview() {
    const next = view.now.next;
    landings.moment = {
      key: 'preview',
      drain: 'meeting',
      run: 2,
      headline: headline(2, 'meeting'),
      next: next ?? null,
      stones: pickStones({ next: next && next.kind === 'task' ? next : null, seed: Math.floor(clock.minute / 60_000), allowed: s.stones, recent: landingsFile.value.recent, hour: hourOf(clock.now) }),
      at: clock.now,
    };
  }
</script>

{#if open}
  <Panel title="Soft landings" onclose={() => (view.sheet = null)} accent="#8670E6">
    <div class="sl">
      <p class="lead">After meetings, energy dips and the next task is hard to pick up straight away. A few minutes to land, and a small first step, make it easier.</p>

      <section>
        <h3>Keep time to land</h3>
        <div class="row">
          <span>After meetings and long focus</span>
          <Segmented label="Minutes to keep" value={String(s.buffer)} onchange={(v) => (landingsFile.value.settings.buffer = Number(v))} options={[{ value: '0', label: 'Off' }, { value: '5', label: '5m' }, { value: '10', label: '10m' }, { value: '15', label: '15m' }]} />
        </div>
        <p class="hint">Free-time suggestions, the backlog planner and AI apps leave this much room after a meeting.</p>
      </section>

      <section>
        <h3>Today</h3>
        {#if today.length}
          <ul class="hand">
            {#each today as h, i (h.from.key)}
              <li in:fly={{ y: 6, duration: rm ? 0 : 260, delay: rm ? 0 : i * 50, easing: cubicOut }}>
                <span class="when tnum">{formatTime(h.from.endMs, view.hour12)}</span>
                <span class="what">
                  <b>{shownTitle(h.from.title, h.from.category)}{h.run > 1 ? ` (and ${h.run - 1} before)` : ''}</b>
                  <small>then {shownTitle(h.to.title, h.to.category)}{h.gapMin ? ` after ${h.gapMin}m` : ' straight away'}</small>
                </span>
                {#if h.to.kind === 'task' && !h.to.readOnly}
                  <button class="btn btn-soft sm" onclick={() => landings.makeRoom(h)}>Make {h.needMin}m room</button>
                {:else}
                  <span class="fixed">calendar</span>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="empty"><Icon name="leaf" size={14} /> No back-to-back hand-offs today. Room to land after every meeting.</p>
        {/if}
      </section>

      <section>
        <h3>When to offer a landing</h3>
        <label class="row"><span>When a meeting ends</span><input type="checkbox" class="switch" bind:checked={landingsFile.value.settings.afterMeetings} /></label>
        <label class="row"><span>After 90 minutes or more of focus</span><input type="checkbox" class="switch" bind:checked={landingsFile.value.settings.afterLong} /></label>
        <button class="btn btn-quiet sm try" onclick={preview}><Icon name="play" size={13} /> See one now</button>
      </section>

      <section>
        <h3>Stepping stones to offer</h3>
        <div class="stones">
          {#each STONES as st (st.id)}
            <button class="stone" aria-pressed={s.stones.includes(st.id)} onclick={() => toggle(st.id)}><Icon name={st.icon} size={13} /> {st.title}</button>
          {/each}
          <button class="stone" aria-pressed={s.stones.includes('step')} onclick={() => toggle('step')}><Icon name="arrow-right" size={13} /> A first step into what’s next</button>
        </div>
      </section>

      <section>
        <h3>This week</h3>
        {#if week.length}
          <p class="stat"><b class="tnum">{taken.length}</b> {taken.length === 1 ? 'landing' : 'landings'} taken of <span class="tnum">{week.length}</span> offered{favourite ? ` · most often: ${favourite}` : ''}.</p>
        {:else}
          <p class="empty">When a meeting ends, a landing card appears here at the bottom of the {platform.isMobile ? 'screen' : 'window'}.</p>
        {/if}
      </section>
    </div>
  </Panel>
{/if}

<style>
  .sl {
    --lav: #8670e6;
  }
  :global([data-theme='dark']) .sl {
    --lav: #b4a2ff;
  }
  .lead {
    margin: 0 0 var(--s-2);
    font-size: var(--t-sm);
    line-height: 1.5;
    color: var(--ink-2);
  }
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  h3 {
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 40px;
    font-size: var(--t-sm);
  }
  /* A phone: a control that doesn't fit beside its label goes under it, on the right. */
  @media (max-width: 480px) {
    .row {
      flex-wrap: wrap;
      row-gap: var(--s-2);
    }
    .row > :last-child:not(:first-child) {
      margin-left: auto;
    }
    /* A switch stays beside its words; the words wrap instead. */
    .row:has(> .switch) > :first-child {
      flex: 1 1 0;
      min-width: 0;
    }
  }
  .hint,
  .empty,
  .stat {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    line-height: 1.5;
    color: var(--ink-3);
  }
  .empty {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: var(--t-sm);
  }
  .empty :global(svg) {
    color: var(--lav);
  }
  .stat {
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .stat b {
    font-weight: 500;
    color: var(--ink);
  }
  .hand {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .hand li {
    display: grid;
    grid-template-columns: 56px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--lav) 7%, var(--surface));
  }
  .when {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .what {
    display: grid;
    min-width: 0;
    font-size: var(--t-sm);
  }
  .what b {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .what small {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .fixed {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .try {
    margin-top: var(--s-2);
    gap: 6px;
  }
  .stones {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .stone {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 11px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    color: var(--ink-3);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    transition:
      background var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out);
  }
  .stone[aria-pressed='true'] {
    color: var(--ink);
    background: color-mix(in srgb, var(--lav) 14%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lav) 40%, transparent);
  }
</style>
