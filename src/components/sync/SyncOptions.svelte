<script lang="ts">
  // How and what one sync service syncs: its own pace (or only by hand), after a change or not,
  // mobile data on a phone, and what it leaves out. Shared by the GitHub and Cloudflare D1 cards;
  // each service keeps its own choices, on this device.
  import { platform } from '../../lib/platform';
  import { SYNC_GROUPS, type SyncGroup } from '../../lib/sync/codecs';
  import { SYNC_EVERY, type CommonConfig } from '../../lib/sync/engine.svelte';
  import Segmented from '../Segmented.svelte';

  type Options = Pick<CommonConfig, 'every' | 'onChange' | 'mobileData' | 'skip'>;
  let { sync }: { sync: { readonly config: Readonly<CommonConfig>; readonly sealed: boolean; setOptions(p: Partial<Options>): Promise<void> } } = $props();

  const cfg = $derived(sync.config);
  const EVERY_LABEL: Record<number, string> = { 1: '1 min', 5: '5 min', 15: '15 min', 60: 'Hourly', 0: 'By hand' };
  // Calendar links and keys travel only sealed, so a plain GitHub repo never offers them.
  const groups = $derived(SYNC_GROUPS.filter((g) => sync.sealed || (g.id !== 'keys' && g.id !== 'calendars')));

  function toggle(g: SyncGroup, on: boolean) {
    const skip = on ? cfg.skip.filter((x) => x !== g) : [...cfg.skip, g];
    void sync.setOptions({ skip });
  }
</script>

<details class="conn">
  <summary>Syncing</summary>
  <div class="row">
    <span>On its own</span>
    <Segmented label="How often it syncs" value={String(cfg.every)} options={SYNC_EVERY.map((m) => ({ value: String(m), label: EVERY_LABEL[m] }))} onchange={(v) => void sync.setOptions({ every: Number(v) })} />
  </div>
  {#if cfg.every === 0}
    <p class="hint">Only when you tap Sync now.</p>
  {:else}
    <label class="row">
      <span class="lbl">After a change<small>Shortly after you change something here</small></span>
      <input type="checkbox" class="switch" checked={cfg.onChange} onchange={(e) => void sync.setOptions({ onChange: e.currentTarget.checked })} />
    </label>
  {/if}
  {#if platform.isMobile}
    <label class="row">
      <span class="lbl">Use mobile data<small>Off: it waits for Wi-Fi (Sync now still works)</small></span>
      <input type="checkbox" class="switch" checked={cfg.mobileData} onchange={(e) => void sync.setOptions({ mobileData: e.currentTarget.checked })} />
    </label>
  {/if}

  <p class="label">What syncs</p>
  <label class="row">
    <span>Your day, backlog and history</span>
    <input type="checkbox" class="switch" checked disabled />
  </label>
  {#each groups as g (g.id)}
    <label class="row">
      <span>{g.label}</span>
      <input type="checkbox" class="switch" checked={!cfg.skip.includes(g.id)} onchange={(e) => toggle(g.id, e.currentTarget.checked)} />
    </label>
  {/each}
  <p class="hint">What you leave out stays as it is on each device.</p>
</details>

<style>
  .lbl {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .lbl small {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
</style>
