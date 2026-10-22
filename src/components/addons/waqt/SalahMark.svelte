<script lang="ts">
  // A salah, opened from the dial or the timeline: its icon and times at the top (the adhan,
  // the jamaat, when its time ends, how long is left), then one tap to mark it — on time, in
  // jamaat or made up — and qasr while travelling. Tapping the mark again clears it. The likely
  // answer (on time while its time lasts, made up after) leads.
  import type { PrayerSlot } from '../../../lib/addons/waqt/times';
  import { PRAYER_ICON, QASR, type PrayedHow } from '../../../lib/addons/waqt/types';
  import { waqt, waqtFile } from '../../../lib/addons/waqt/waqt.svelte';
  import { formatDuration, formatTime } from '../../../lib/engine/time';
  import type { ISODate } from '../../../lib/engine/types';
  import Icon from '../../../lib/Icon.svelte';
  import { sounds } from '../../../lib/sound';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { settings } from '../../../lib/stores/settings.svelte';
  import { view } from '../../../lib/stores/view.svelte';

  let { date, slot, color, onmarked }: { date: ISODate; slot: PrayerSlot; color: string; onmarked?: () => void } = $props();

  const how = $derived(waqt.howOf(date, slot.id));
  const canQasr = $derived(QASR.includes(slot.id));
  // Before marking it shows what the mark will get (on while travelling); a change is kept for it.
  let pending = $state<boolean | null>(null);
  const qasr = $derived(how ? waqt.qasrOf(date, slot.id) : (pending ?? waqt.qasrOf(date, slot.id)));
  const likely = $derived(waqt.quickHow(slot, clock.now));
  const now = $derived(clock.minute);
  const timeNote = $derived(now < slot.at ? `in ${formatDuration(slot.at - now)}` : now < slot.end ? `${formatDuration(slot.end - now)} left in its time` : 'its time has ended');
  const at = (ms: number) => formatTime(ms, view.hour12);

  const OPTIONS = $derived(
    [
      { how: 'ontime' as PrayedHow, label: 'On time', icon: 'check', hint: 'In its time' },
      { how: 'jamaat' as PrayedHow, label: 'In jamaat', icon: 'users', hint: 'With the congregation' },
      { how: 'late' as PrayedHow, label: 'Made up', icon: 'clock', hint: 'After its time' },
    ].filter((o) => o.how !== 'jamaat' || waqtFile.value.settings.jamaat.on || !!slot.jamaat || how === 'jamaat'),
  );
  const WORD: Record<PrayedHow, string> = { ontime: 'Prayed on time', jamaat: 'Prayed in jamaat', late: 'Made up' };

  function pick(e: MouseEvent, h: PrayedHow) {
    if (how === h) {
      waqt.markAs(date, slot.id, null);
      return;
    }
    waqt.markAs(date, slot.id, h, canQasr ? qasr : undefined);
    pending = null;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    view.spark(r.left + r.width / 2, r.top + r.height / 2, color, false, 'Prayed');
    sounds.done();
    onmarked?.();
  }

  function toggleQasr(on: boolean) {
    if (how) waqt.setQasr(date, slot.id, on);
    else pending = on;
  }
</script>

<div class="head" style:--c={color}>
  <span class="tile"><Icon name={PRAYER_ICON[slot.id]} size={22} stroke={1.9} /></span>
  <div class="txt">
    <p class="name">{slot.name}</p>
    <p class="times tnum">
      Adhan {at(slot.at)}{#if slot.jamaat} · jamaat {at(slot.jamaat)}{/if} · until {at(slot.end)}
    </p>
    <p class="state" class:marked={!!how}>
      {#if how}<Icon name="check" size={12} stroke={2.6} /> {WORD[how]}{qasr ? ' · qasr' : ''}{:else}{timeNote}{/if}
    </p>
  </div>
</div>

<div class="opts" role="radiogroup" aria-label={`How ${slot.name} went`}>
  {#each OPTIONS as o (o.how)}
    <button role="radio" aria-checked={how === o.how} class:on={how === o.how} class:likely={!how && o.how === likely} style:--c={color} title={o.hint} onclick={(e) => pick(e, o.how)}>
      <span class="dot"><Icon name={o.icon} size={14} stroke={2.3} /></span>
      {o.label}
    </button>
  {/each}
</div>

{#if canQasr}
  <label class="q">
    <span class="qi"><Icon name="route" size={14} /></span>
    <span class="ql">Qasr <small>{waqt.travelling(date) ? 'shortened · you’re travelling' : 'shortened while travelling'}</small></span>
    <input type="checkbox" class="switch" checked={qasr} onchange={(e) => toggleQasr(e.currentTarget.checked)} aria-label={`${slot.name} prayed as qasr`} />
  </label>
{/if}
<p class="hint">{how ? 'Tap your choice again to unmark it.' : 'One tap marks it.'}</p>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    margin-bottom: var(--s-4);
  }
  .tile {
    display: grid;
    place-items: center;
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: 16px;
    color: var(--c);
    background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--c) 26%, transparent), color-mix(in srgb, var(--c) 8%, transparent) 70%);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 22%, transparent);
  }
  .txt {
    display: grid;
    min-width: 0;
    gap: 2px;
  }
  .name {
    margin: 0;
    font-size: var(--t-lg, 18px);
    font-weight: 600;
  }
  .times {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .state {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 2px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .state.marked {
    color: color-mix(in srgb, var(--c) 70%, var(--ink));
    font-weight: 600;
  }
  .opts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 6px;
  }
  button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 46px;
    padding: 0 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--raised);
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      transform var(--dur-2) cubic-bezier(0.3, 1.5, 0.5, 1),
      border-color var(--dur-2) var(--ease-out),
      background var(--dur-2) var(--ease-out);
  }
  button:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--c) 50%, var(--line));
  }
  button:active {
    transform: scale(0.97);
  }
  button.likely {
    border-color: color-mix(in srgb, var(--c) 45%, var(--line));
    background: color-mix(in srgb, var(--c) 8%, var(--raised));
  }
  button.on {
    border-color: var(--c);
    background: color-mix(in srgb, var(--c) 16%, var(--raised));
  }
  .dot {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    color: color-mix(in srgb, var(--c) 75%, var(--ink-2));
    background: color-mix(in srgb, var(--c) 12%, transparent);
    transition:
      background var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out),
      transform var(--dur-2) cubic-bezier(0.3, 1.5, 0.5, 1);
  }
  .on .dot {
    background: var(--c);
    color: var(--ink-inverse, #fff);
    transform: scale(1.08);
  }
  .q {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: var(--s-3);
    padding: 10px 12px;
    border-radius: var(--r-md);
    background: var(--sunken);
    font-size: var(--t-sm);
    cursor: pointer;
  }
  .qi {
    display: grid;
    place-items: center;
    color: var(--ink-3);
  }
  .ql {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .ql small {
    color: var(--ink-3);
    font-size: var(--t-xs);
  }
  .hint {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
</style>
