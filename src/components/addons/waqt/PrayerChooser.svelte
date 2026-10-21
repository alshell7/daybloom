<script lang="ts">
  // How a prayer went: on time, in jamaat (when you pray in jamaat), or made up late; qasr for
  // Dhuhr, Asr and Isha. Opens from a pearl; the pearl already took the likely answer.
  import type { PrayerSlot } from '../../../lib/addons/waqt/times';
  import { PRAYER_ICON, QASR, type PrayedHow } from '../../../lib/addons/waqt/types';
  import { waqt, waqtFile } from '../../../lib/addons/waqt/waqt.svelte';
  import type { ISODate } from '../../../lib/engine/types';
  import Icon from '../../../lib/Icon.svelte';
  import { sounds } from '../../../lib/sound';
  import { settings } from '../../../lib/stores/settings.svelte';
  import Popover from '../../pickers/Popover.svelte';

  let { anchor, date, slot, onclose }: { anchor: HTMLElement; date: ISODate; slot: PrayerSlot; onclose: () => void } = $props();

  const how = $derived(waqt.howOf(date, slot.id));
  // Shown before marking too: travelling turns it on; a change before marking is kept for the mark.
  let pending = $state<boolean | null>(null);
  const qasr = $derived(pending ?? waqt.qasrOf(date, slot.id));
  const jamaatOn = $derived(waqtFile.value.settings.jamaat.on || how === 'jamaat');
  const canQasr = $derived(QASR.includes(slot.id));

  const OPTIONS: { how: PrayedHow; label: string; icon: string; hint: string }[] = [
    { how: 'ontime', label: 'On time', icon: 'check', hint: 'In its time' },
    { how: 'jamaat', label: 'In jamaat', icon: 'users', hint: 'With the congregation' },
    { how: 'late', label: 'Late', icon: 'clock', hint: 'Made up after its time' },
  ];

  function pick(h: PrayedHow) {
    waqt.markAs(date, slot.id, h, qasr);
    if (settings.value.sound) sounds.tick();
    setTimeout(onclose, 260);
  }
</script>

<Popover {anchor} {onclose} label={`How ${slot.name} went`} width={252}>
  <div class="pc">
    <p class="t"><Icon name={PRAYER_ICON[slot.id]} size={14} /> {slot.name}</p>
    <div class="opts" role="radiogroup" aria-label={`How ${slot.name} went`}>
      {#each OPTIONS.filter((o) => o.how !== 'jamaat' || jamaatOn) as o (o.how)}
        <button role="radio" aria-checked={how === o.how} class:on={how === o.how} data-how={o.how} onclick={() => pick(o.how)} title={o.hint}>
          <span class="dot"><Icon name={o.icon} size={13} stroke={2.4} /></span>{o.label}
        </button>
      {/each}
    </div>
    {#if canQasr}
      <label class="q">
        <span>Qasr <small>shortened, travelling</small></span>
        <input type="checkbox" class="switch" checked={qasr} onchange={(e) => (how ? waqt.setQasr(date, slot.id, e.currentTarget.checked) : (pending = e.currentTarget.checked))} />
      </label>
    {/if}
    {#if how}
      <button
        class="clear"
        onclick={() => {
          waqt.markAs(date, slot.id, null);
          onclose();
        }}>Not prayed yet</button
      >
    {/if}
  </div>
</Popover>

<style>
  .pc {
    --green: #25976a;
    display: grid;
    gap: 8px;
  }
  :global([data-theme='dark']) .pc {
    --green: #4fd39a;
  }
  .t {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 2px;
    font-size: var(--t-sm);
    font-weight: 500;
  }
  .opts {
    display: grid;
    gap: 4px;
  }
  .opts button {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 10px;
    border-radius: var(--r-sm);
    font-size: var(--t-sm);
    color: var(--ink);
    text-align: left;
    transition: background var(--dur-1) var(--ease-out);
  }
  .opts button:hover {
    background: var(--sunken);
  }
  .dot {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    color: var(--ink-3);
    box-shadow: inset 0 0 0 1.5px var(--line-strong);
    transition:
      background var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out);
  }
  .opts button.on .dot {
    color: #fff;
    background: var(--green);
    box-shadow: none;
  }
  .opts button.on[data-how='jamaat'] .dot {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 30%, transparent);
  }
  .opts button.on[data-how='late'] .dot {
    color: var(--ink);
    background: color-mix(in srgb, var(--warm) 70%, var(--raised));
  }
  .q {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px 2px;
    border-top: 1px solid var(--line);
    font-size: var(--t-sm);
  }
  .q small {
    margin-left: 4px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .clear {
    justify-self: start;
    padding: 4px 10px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .clear:hover {
    background: var(--sunken);
    color: var(--ink);
  }
</style>
