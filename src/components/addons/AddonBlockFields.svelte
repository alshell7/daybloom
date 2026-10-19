<script lang="ts">
  // Addon fields inside the block editor: Work (project, billable, rate, what it earns) and
  // the Time Tracker (track this block, and what's been tracked on it).
  import { slide } from 'svelte/transition';
  import { clockText } from '../../lib/addons/labels';
  import { isOn } from '../../lib/addons/registry';
  import { tracker } from '../../lib/addons/tracker/tracker.svelte';
  import { formatMoney, fromMinor, toMinor } from '../../lib/addons/work/money';
  import { work } from '../../lib/addons/work/work.svelte';
  import { formatDuration, MINUTE } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { chartColor } from './charts/palette';

  let { taskId, blockKey, minutes, done }: { taskId: string; blockKey: string | null; minutes: number; done: boolean } = $props();

  const workOn = $derived(isOn('work'));
  const trackOn = $derived(isOn('tracker'));
  const res = $derived(workOn ? work.resolve(blockKey ?? taskId) : null);
  const projectId = $derived(res?.project.id ?? '');
  const billable = $derived(res?.billable ?? true);
  const currency = $derived(res?.currency ?? work.settings.currency);
  const own = $derived(workOn ? (work.assignment(taskId)?.rate ?? null) : null);

  function setProject(id: string) {
    if (!id) work.assign(taskId, null);
    else work.assign(taskId, id, billable);
  }
  let rateOpen = $state(false);
  let rateText = $state('');
  $effect(() => {
    rateText = own && own.kind !== 'none' ? String(fromMinor(own.amount, currency)) : '';
  });
  function saveRate() {
    const v = Number(rateText.replace(',', '.'));
    if (!rateText.trim() || !Number.isFinite(v) || v <= 0) work.setRate(taskId, null);
    else work.setRate(taskId, { kind: res?.rate.kind === 'fixed' ? 'fixed' : 'hourly', amount: toMinor(v, currency) });
  }
  const earns = $derived.by(() => {
    if (!res || !billable) return null;
    if (res.rate.kind === 'fixed') return formatMoney(res.rate.amount, currency);
    if (res.rate.kind === 'hourly') return formatMoney(Math.round((res.rate.amount * minutes) / 60), currency);
    return null;
  });

  // tracker
  const tracking = $derived(trackOn && blockKey ? tracker.isTracking({ blockKey }) : false);
  const trackedMs = $derived.by(() => {
    if (!trackOn) return 0;
    void clock.now;
    return tracker.entries.filter((e) => (blockKey ? e.blockKey === blockKey : e.taskId === taskId)).reduce((s, e) => s + ((e.endMs ?? clock.now) - e.startMs), 0);
  });
</script>

{#if workOn || trackOn}
  <section class="group addons">
    {#if workOn}
      <h3><Icon name="briefcase" size={14} /> Work</h3>
      {#if work.projects.filter((p) => !p.archived).length}
        <div class="line">
          <select class="field" value={projectId} onchange={(e) => setProject(e.currentTarget.value)} aria-label="Project">
            <option value="">Not for a project</option>
            {#each work.projects.filter((p) => !p.archived) as p (p.id)}<option value={p.id}>{p.name}{p.clientId ? ` · ${work.client(p.clientId)?.name ?? ''}` : ''}</option>{/each}
          </select>
          {#if projectId}
            <label class="bill"><input type="checkbox" class="switch" checked={billable} onchange={(e) => work.setBillable(taskId, e.currentTarget.checked)} /> Billable</label>
          {/if}
        </div>
        {#if projectId && res}
          <div class="earn" transition:slide={{ duration: view.reducedMotion ? 0 : 180 }}>
            <i style:background={chartColor(res.project.color)}></i>
            {#if billable && earns}
              <span><b class="tnum">{earns}</b> {res.rate.kind === 'fixed' ? 'when done' : `for ${formatDuration(minutes * MINUTE)}`}{done ? ' · earned' : ''}</span>
            {:else if !billable}
              <span>Not billed. Time still counts in Work.</span>
            {:else}
              <span>No rate yet. Set one on the project or here.</span>
            {/if}
            <button class="link" onclick={() => (rateOpen = !rateOpen)}>{own ? 'Own rate' : 'Rate'}</button>
          </div>
          {#if rateOpen}
            <div class="rate" transition:slide={{ duration: view.reducedMotion ? 0 : 180 }}>
              <span>{currency}</span>
              <input class="field" inputmode="decimal" placeholder={res.rate.kind !== 'none' ? String(fromMinor(res.rate.amount, currency)) : 'Rate'} bind:value={rateText} onchange={saveRate} aria-label="Rate for this block" />
              <span>{res.rate.kind === 'fixed' ? 'per block' : 'per hour'}</span>
            </div>
          {/if}
        {/if}
      {:else}
        <button class="btn btn-soft sm" onclick={() => (view.sheet = { kind: 'work', tab: 'projects' })}><Icon name="plus" size={13} /> Create a project to bill this</button>
      {/if}
    {/if}

    {#if trackOn && blockKey}
      <h3 class="t2"><Icon name="timer" size={14} /> Time</h3>
      <div class="line">
        <button class="btn sm" class:btn-primary={!tracking} class:btn-soft={tracking} onclick={() => tracker.toggle({ blockKey, taskId })}>
          <Icon name={tracking ? 'square' : 'play'} size={12} stroke={2.6} /> {tracking ? 'Stop' : 'Track this block'}
        </button>
        <span class="tracked tnum">{trackedMs ? `${tracking ? clockText(trackedMs) : formatDuration(Math.round(trackedMs / MINUTE) * MINUTE)} tracked` : 'Nothing tracked yet'}</span>
      </div>
    {/if}
  </section>
{/if}

<style>
  .addons h3 {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .t2 {
    margin-top: var(--s-3);
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }
  .line .field {
    flex: 1;
    min-width: 0;
  }
  .bill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-xs);
    color: var(--ink-2);
    white-space: nowrap;
  }
  .earn {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .earn i {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .earn span {
    flex: 1;
  }
  .earn b {
    color: var(--ink);
    font-weight: 600;
  }
  .link {
    font-size: var(--t-xs);
    color: var(--ink-3);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .rate {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .rate .field {
    width: 100px;
  }
  .sm {
    height: 30px;
    padding: 0 12px;
    font-size: var(--t-xs);
  }
  .tracked {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
</style>
