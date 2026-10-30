<script lang="ts">
  // Decision (addon): its own panel. How it's doing (the 6 MB model on this device), a box to
  // try it on any line and see what it thinks and how sure it is, "Sort my Inbox" (moves you
  // approve), and what it has learned from you, with a way to forget it.
  import { fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { decision, decisionFile, DECISION_BYTES } from '../../../lib/addons/decision/decision.svelte';
  import { DESTINATIONS, type Suggestion, type TriageMove } from '../../../lib/addons/decision/questions';
  import { itemsIn, PRIORITY_LABEL } from '../../../lib/backlog';
  import { CATEGORY_BY_ID, categoryColor } from '../../../lib/engine/categories';
  import Icon from '../../../lib/Icon.svelte';
  import { readLine } from '../../../lib/jot';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { taskFile, tasks } from '../../../lib/stores/tasks.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import Panel from '../../Panel.svelte';

  const open = $derived(view.sheet?.kind === 'decision');
  const rm = $derived(view.reducedMotion);
  const mb = (DECISION_BYTES / 1_048_576).toFixed(1);

  $effect(() => {
    if (open) void decision.ensure().catch(() => {});
  });

  // ── Try it ──
  let probe = $state('');
  let seen = $state<Suggestion | null>(null);
  let probing = $state(false);
  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const p = probe.trim();
    clearTimeout(probeTimer);
    if (!p) {
      seen = null;
      return;
    }
    probeTimer = setTimeout(async () => {
      const l = readLine(p, clock.now);
      if (!l) return;
      probing = true;
      const r = await decision.suggest(p, l.hints).catch(() => null);
      probing = false;
      if (probe.trim() === p) seen = r?.suggestion ?? null;
    }, 280);
  });
  const destLabel = (id: string) => DESTINATIONS.find((d) => d.id === id)?.label ?? id;
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  // ── Sort my Inbox ──
  const inbox = $derived(itemsIn(taskFile.value.tasks, 'inbox'));
  let moves = $state<(TriageMove & { on: boolean })[] | null>(null);
  let sorting = $state(false);
  async function sortInbox() {
    sorting = true;
    try {
      const m = await decision.triage(inbox.slice(0, 40).map((t) => ({ id: t.id, title: t.title })));
      moves = m.map((x) => ({ ...x, on: x.sure >= 0.6 }));
    } finally {
      sorting = false;
    }
  }
  const chosen = $derived(moves?.filter((m) => m.on) ?? []);
  function applyMoves() {
    const before = chosen.map((m) => ({ id: m.taskId, t: JSON.parse(JSON.stringify(tasks.get(m.taskId))) }));
    for (const m of chosen) {
      if (m.to === 'today') tasks.update(m.taskId, { list: 'next', ...(m.priority ? { priority: m.priority } : {}) });
      else tasks.update(m.taskId, { list: m.to, ...(m.priority ? { priority: m.priority } : {}) });
    }
    const n = chosen.length;
    view.say(`Sorted ${n} ${n === 1 ? 'item' : 'items'} out of your Inbox`, {
      label: 'Undo',
      run: () => {
        for (const b of before) {
          const i = taskFile.value.tasks.findIndex((x) => x.id === b.id);
          if (i >= 0 && b.t) taskFile.value.tasks[i] = b.t;
        }
      },
    });
    moves = null;
  }

  const statusLine = $derived(
    decision.status === 'ready'
      ? `Ready on this device${decision.lastMs ? ` · answers in about ${decision.lastMs < 1000 ? `${Math.max(1, Math.round(decision.lastMs / 100) / 10)} s` : `${Math.round(decision.lastMs / 100) / 10} s`}` : ''}`
      : decision.status === 'downloading'
        ? `Downloading the model · ${pct(decision.progress)} of ${mb} MB`
        : decision.status === 'loading'
          ? 'Waking up…'
          : decision.status === 'error'
            ? `It couldn’t start: ${decision.error}`
            : `The model (${mb} MB) downloads once, when you need it.`,
  );
</script>

{#if open}
  <Panel title="Decision" onclose={() => (view.sheet = null)} accent="#D99A06">
    <div class="dc">
      <p class="status" class:ok={decision.status === 'ready'} role="status">
        <span class="led" aria-hidden="true"></span>{statusLine}
      </p>
      {#if decision.status === 'downloading'}
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(decision.progress * 100)} aria-label="Downloading Decision"><i style:width={pct(decision.progress)}></i></div>
      {:else if decision.status === 'error'}
        <button class="btn btn-soft" onclick={() => void decision.ensure().catch(() => {})}><Icon name="refresh" size={14} /> Try again</button>
      {/if}

      <section aria-labelledby="dc-try">
        <h3 id="dc-try"><Icon name="sparkle" size={14} /> Try it</h3>
        <input class="probe" bind:value={probe} placeholder="Type anything you might jot down…" aria-label="A line to try" autocomplete="off" />
        {#if probing && !seen}<p class="muted">Reading…</p>{/if}
        {#if seen}
          <dl class="read" in:fly={{ y: 4, duration: rm ? 0 : 200, easing: cubicOut }}>
            <div><dt>Goes to</dt><dd><strong>{destLabel(seen.dest)}</strong> <span class="muted">· {seen.why}</span></dd></div>
            <div><dt>When</dt><dd>{seen.model.when} <span class="meter" style:--p={seen.model.whenP}><i></i></span> <span class="muted tnum">{pct(seen.model.whenP)}</span></dd></div>
            <div><dt>Kind</dt><dd>
              {#if seen.model.kind}<span class="kind" style:--c={categoryColor(seen.model.kind, view.finish.dark)}><Icon name={CATEGORY_BY_ID[seen.model.kind].icon} size={12} /> {CATEGORY_BY_ID[seen.model.kind].label}</span>{/if}
              <span class="meter" style:--p={seen.model.kindP}><i></i></span> <span class="muted tnum">{pct(seen.model.kindP)}</span>
            </dd></div>
            <div><dt>Urgent</dt><dd><span class="meter" style:--p={seen.model.urgent}><i></i></span> <span class="muted tnum">{pct(seen.model.urgent)}</span>{#if seen.priority} · {PRIORITY_LABEL[seen.priority]}{/if}</dd></div>
          </dl>
        {/if}
      </section>

      <section aria-labelledby="dc-sort">
        <h3 id="dc-sort"><Icon name="inbox" size={14} /> Sort my Inbox</h3>
        {#if !moves}
          <p class="muted">{inbox.length ? `${inbox.length} ${inbox.length === 1 ? 'item waits' : 'items wait'} in your Inbox. Decision suggests where each could go; you approve the moves.` : 'Your Inbox is clear.'}</p>
          {#if inbox.length}
            <button class="btn btn-soft" onclick={sortInbox} disabled={sorting || decision.status !== 'ready'}>
              <Icon name="route" size={14} /> {sorting ? 'Reading your Inbox…' : 'Suggest moves'}
            </button>
          {/if}
        {:else if !moves.length}
          <p class="muted" transition:slide={{ duration: rm ? 0 : 200 }}>Nothing it’s sure enough about. They can stay in the Inbox until you sort them.</p>
          <button class="btn btn-quiet" onclick={() => (moves = null)}>OK</button>
        {:else}
          <ul class="moves" transition:slide={{ duration: rm ? 0 : 220, easing: cubicOut }}>
            {#each moves as m (m.taskId)}
              <li>
                <label>
                  <input type="checkbox" bind:checked={m.on} />
                  <span class="mt">{m.title}</span>
                  <span class="to"><Icon name="arrow-right" size={12} /> {m.to === 'someday' ? 'Someday' : 'Next'}{m.priority === 1 ? ' · Must' : ''}</span>
                </label>
                <span class="why muted">{m.why}</span>
              </li>
            {/each}
          </ul>
          <div class="row">
            <button class="btn btn-quiet" onclick={() => (moves = null)}>Not now</button>
            <button class="btn btn-primary" onclick={applyMoves} disabled={!chosen.length}>Move {chosen.length}</button>
          </div>
        {/if}
      </section>

      <section aria-labelledby="dc-learn">
        <h3 id="dc-learn"><Icon name="brain" size={14} /> What it learned</h3>
        <p class="muted">
          {#if decision.learned}
            {decision.learned} lessons from your choices: you kept {decisionFile.value.kept} suggestions and changed {decisionFile.value.changed}. They sync with your other devices.
          {:else}
            Each time you add from Jot, what you keep or change teaches it your way of writing.
          {/if}
        </p>
        <div class="row">
          {#if decision.learned}<button class="btn btn-quiet" onclick={() => decision.forgetLessons()}>Forget what it learned</button>{/if}
          <button class="btn btn-quiet" onclick={() => void decision.forget()}>Remove the model from this device</button>
        </div>
      </section>

      <p class="credit muted">TinyDecide by REZOR, Apache 2.0. It runs on this device; nothing you write leaves it.</p>
    </div>
  </Panel>
{/if}

<style>
  .dc {
    display: grid;
    gap: var(--s-4);
  }
  section {
    display: grid;
    gap: var(--s-2);
  }
  h3 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-sm);
    font-weight: 600;
    color: var(--ink);
  }
  .status {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .led {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ink-3);
  }
  .status.ok .led {
    background: var(--lume, #2fae7b);
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--sunken);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: #d99a06;
    transition: width 0.2s linear;
  }
  .probe {
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--raised);
    color: var(--ink);
    font: inherit;
  }
  .read {
    margin: 0;
    display: grid;
    gap: 6px;
  }
  .read div {
    display: grid;
    grid-template-columns: 72px 1fr;
    align-items: center;
    gap: 8px;
  }
  dt {
    font-size: var(--t-xs, 12px);
    color: var(--ink-3);
  }
  dd {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: var(--t-sm);
    color: var(--ink);
  }
  .meter {
    width: 64px;
    height: 6px;
    border-radius: 3px;
    background: var(--sunken);
    overflow: hidden;
  }
  .meter i {
    display: block;
    height: 100%;
    width: calc(var(--p) * 100%);
    background: #d99a06;
  }
  .kind {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--c);
  }
  .muted {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
  .moves {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
  }
  .moves li {
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .moves label {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
  }
  .moves input {
    width: 20px;
    height: 20px;
    accent-color: #d99a06;
  }
  .mt {
    flex: 1;
    min-width: 0;
    color: var(--ink);
  }
  .to {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--t-xs, 12px);
    color: var(--ink-2);
  }
  .why {
    display: block;
    padding-left: 30px;
    font-size: var(--t-xs, 12px);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    justify-content: flex-end;
  }
  .credit {
    font-size: var(--t-xs, 12px);
  }
</style>
