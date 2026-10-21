<script lang="ts">
  // One clear button for one change. It says what it will touch before it acts (the blocks it
  // will move, the block it will tick), draws nothing when the block it names doesn't exist,
  // and offers Undo after. It never removes anything.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { act, blockOf, restOfToday, type Did } from '../../lib/ai/genui/act';
  import { valid } from '../../lib/ai/genui/read';
  import { ConfirmActionProps, type ConfirmKind } from '../../lib/ai/genui/schema';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';

  let { props }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(ConfirmActionProps, props));
  const NEEDS_KEY: ConfirmKind[] = ['move', 'tomorrow', 'done', 'start'];
  const ICON: Record<ConfirmKind, string> = { rest_to_tomorrow: 'move-later', move: 'route', tomorrow: 'move-later', done: 'check', start: 'play', breathe: 'wind', focus: 'target' };

  let did = $state<Did | null>(null);
  let ran = $state(false);
  let said = $state('');
  const b = $derived((clock.minute, blockOf(p?.key)));
  const rest = $derived((clock.minute, p?.action === 'rest_to_tomorrow' ? restOfToday() : []));
  const usable = $derived.by(() => {
    if (!p) return false;
    if (!NEEDS_KEY.includes(p.action)) return true;
    if (!b) return false;
    if (p.action === 'start') return !b.done;
    return b.kind === 'task' && !b.readOnly && !b.done;
  });
  const detail = $derived.by(() => {
    if (p?.detail?.trim()) return p.detail.trim().slice(0, 140);
    if (p?.action === 'rest_to_tomorrow') {
      const names = rest.slice(0, 3).map((x) => x.title || 'Untitled');
      return rest.length ? `${names.join(', ')}${rest.length > 3 ? ` and ${rest.length - 3} more` : ''}` : '';
    }
    return b ? b.title : '';
  });

  function run() {
    if (!p || ran) return;
    const k = b?.key ?? '';
    const a = p.action;
    const n = rest.length;
    did = a === 'rest_to_tomorrow' ? act.restToTomorrow() : a === 'move' ? act.move(k) : a === 'tomorrow' ? act.tomorrow(k) : a === 'done' ? act.done(k) : a === 'start' ? act.start(k) : a === 'breathe' ? act.breathe() : act.focus();
    ran = !!did;
    said = { rest_to_tomorrow: `Moved ${n} to tomorrow.`, move: 'Moved to free time.', tomorrow: 'Moved to tomorrow.', done: 'Ticked. Nicely done.', start: 'Two minutes, running.', breathe: 'Breathe with the dial.', focus: 'Focus is running.' }[a];
  }

  function undo() {
    did?.undo();
    did = null;
    ran = false;
  }
</script>

{#if p && (usable || ran)}
  <div class="a-card gu-flat confirm" style:--c={b?.color ?? 'var(--ink-3)'}>
    {#if p.action === 'rest_to_tomorrow' && !rest.length && !ran}
      <p class="a-meta"><Icon name="circle-check" size={13} /> Nothing left to move. Today is already light.</p>
    {:else}
      {#if detail}
        <p class="detail">{#if b && NEEDS_KEY.includes(p.action)}<span class="a-dot"></span>{/if}{detail}</p>
      {/if}
      <div class="a-actions">
        {#if ran}
          <span class="a-meta"><Icon name="circle-check" size={12} /> {said}</span>
          {#if p.action !== 'breathe'}<button class="a-chip quiet" onclick={undo}><Icon name="undo" size={13} /> Undo</button>{/if}
        {:else}
          <button class="a-chip primary big" onclick={run}><Icon name={ICON[p.action]} size={14} stroke={2.2} /> {p.label.trim().slice(0, 48)}</button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .detail {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.4;
    color: var(--ink-2);
  }
  .big {
    height: 36px;
    padding: 0 16px;
  }
</style>
