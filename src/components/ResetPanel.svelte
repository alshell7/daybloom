<script lang="ts">
  // Reset Daybloom: choose what to clear — each part says what goes, with a count where it
  // helps — or everything. Save a copy first, then hold the button to confirm (a plain second
  // press works from the keyboard). Saving stops, every window reloads into a fresh start.
  import { cubicOut } from 'svelte/easing';
  import { fly, slide } from 'svelte/transition';
  import Icon from '../lib/Icon.svelte';
  import { PARTS, resetApp, type ResetPart } from '../lib/reset';
  import { calendarState } from '../lib/calendarBridge.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { taskFile } from '../lib/stores/tasks.svelte';
  import { trashFile } from '../lib/stores/trash.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { ai } from '../lib/ai/hub.svelte';
  import Panel from './Panel.svelte';

  const open = $derived(view.sheet?.kind === 'reset');
  const rm = $derived(view.reducedMotion);

  let chosen = $state<ResetPart[]>(['blocks']);
  let everything = $state(false);
  let armed = $state(false);
  let going = $state(false);
  /** 0..1 while the button is held. */
  let hold = $state(0);
  let holdStart = 0;
  let frame = 0;

  const count = $derived<Partial<Record<ResetPart, string>>>({
    blocks: `${taskFile.value.tasks.length} ${taskFile.value.tasks.length === 1 ? 'task' : 'tasks'}${trashFile.value.items.length ? ` · ${trashFile.value.items.length} in the Trash` : ''}`,
    addons: `${Object.values(settings.value.addons).filter(Boolean).length} on`,
    ai: `${Object.keys(ai.file.services).length} ${Object.keys(ai.file.services).length === 1 ? 'service' : 'services'}`,
    calendars: `${calendarState.accounts.length} connected`,
  });

  const pick = (id: ResetPart, on: boolean) => {
    armed = false;
    chosen = on ? [...new Set([...chosen, id])] : chosen.filter((x) => x !== id);
  };
  const all = (on: boolean) => {
    armed = false;
    everything = on;
    chosen = on ? PARTS.map((p) => p.id) : ['blocks'];
  };
  const n = $derived(everything ? PARTS.length : chosen.length);

  function exportCopy() {
    const blob = new Blob([JSON.stringify({ app: 'daybloom', version: 1, settings: $state.snapshot(settings.value), tasks: $state.snapshot(taskFile.value.tasks) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `daybloom-before-reset-${view.today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function go() {
    if (going || !n) return;
    going = true;
    await resetApp(chosen, everything);
  }

  // Hold to confirm: a ring fills for 1.2 s; letting go early cancels.
  function down(e: PointerEvent) {
    if (!n || going || e.button !== 0) return;
    holdStart = performance.now();
    const step = () => {
      hold = Math.min(1, (performance.now() - holdStart) / 1200);
      if (hold >= 1) {
        frame = 0;
        void go();
      } else frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }
  function up() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (hold < 1) hold = 0;
  }
  function key(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (armed) void go();
    else armed = true;
  }
</script>

{#if open}
  <Panel title="Reset Daybloom" onclose={() => ((view.sheet = null), (armed = false))}>
    <div class="rs">
      <p class="lead">Start over, as much as you like. Choose what to clear on this computer.</p>

      <label class="all" class:on={everything}>
        <span class="ico"><Icon name="refresh" size={16} /></span>
        <span class="txt"><b>Everything</b><small>All of the below, as if Daybloom were new.</small></span>
        <input type="checkbox" class="switch" checked={everything} onchange={(e) => all(e.currentTarget.checked)} />
      </label>

      <ul>
        {#each PARTS as p, i (p.id)}
          {@const on = everything || chosen.includes(p.id)}
          <li in:fly={{ y: 6, duration: rm ? 0 : 240, delay: rm ? 0 : i * 30, easing: cubicOut }}>
            <label class:on>
              <input type="checkbox" checked={on} disabled={everything} onchange={(e) => pick(p.id, e.currentTarget.checked)} />
              <span class="ico"><Icon name={p.icon} size={15} /></span>
              <span class="txt">
                <b>{p.name}{#if count[p.id]}<em class="tnum">{count[p.id]}</em>{/if}</b>
                <small>{p.what}</small>
              </span>
            </label>
          </li>
        {/each}
      </ul>

      <button class="copy" onclick={exportCopy}><Icon name="download" size={14} /> Save a copy of your blocks and settings first</button>

      {#if armed}
        <p class="sure" transition:slide={{ duration: rm ? 0 : 200 }}>Press again to clear {n} {n === 1 ? 'part' : 'parts'}. This can't be undone.</p>
      {/if}
    </div>

    {#snippet footer()}
      <button class="btn btn-quiet" onclick={() => (view.sheet = null)}>Cancel</button>
      <span class="grow"></span>
      <button
        class="btn btn-danger hold"
        style:--hold={hold}
        disabled={!n || going}
        onpointerdown={down}
        onpointerup={up}
        onpointerleave={up}
        onkeydown={key}
        aria-label={`Reset ${n} ${n === 1 ? 'part' : 'parts'}: hold to confirm, or press twice`}
      >
        <span class="fill" aria-hidden="true"></span>
        <span class="lbl">{going ? 'Starting fresh…' : hold > 0 ? 'Keep holding…' : `Hold to reset${everything ? ' everything' : ` ${n} ${n === 1 ? 'part' : 'parts'}`}`}</span>
      </button>
    {/snippet}
  </Panel>
{/if}

<style>
  .rs {
    display: grid;
    gap: var(--s-3);
  }
  .lead {
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
  label {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--raised);
    cursor: pointer;
    transition:
      border-color var(--dur-2) var(--ease-out),
      background var(--dur-2) var(--ease-out);
  }
  label.on {
    border-color: color-mix(in srgb, var(--danger) 40%, var(--line));
    background: color-mix(in srgb, var(--danger) 5%, var(--raised));
  }
  .all {
    align-items: center;
    background: var(--sunken);
  }
  label input[type='checkbox']:not(.switch) {
    flex: none;
    margin-top: 8px;
    accent-color: var(--danger);
  }
  .ico {
    display: grid;
    place-items: center;
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 10px;
    background: var(--sunken);
    color: var(--ink-2);
  }
  .txt {
    display: grid;
    flex: 1;
    min-width: 0;
    gap: 2px;
  }
  .txt b {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: var(--t-sm);
    font-weight: 600;
  }
  .txt em {
    font-style: normal;
    font-weight: 400;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .txt small {
    font-size: var(--t-xs);
    line-height: 1.45;
    color: var(--ink-3);
  }
  .copy {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    justify-self: start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font-size: var(--t-sm);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .sure {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--danger);
  }
  .grow {
    flex: 1;
  }
  .hold {
    position: relative;
    overflow: hidden;
    user-select: none;
    touch-action: none;
  }
  .hold .fill {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--danger) 22%, transparent);
    transform: scaleX(var(--hold));
    transform-origin: left;
  }
  .hold .lbl {
    position: relative;
  }
</style>
