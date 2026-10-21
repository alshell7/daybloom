<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import type { DeviceInfo } from '../../lib/sync/sync.svelte';
  import { ago } from './time';

  let { devices, mine, mineAt }: { devices: readonly DeviceInfo[]; mine: string; mineAt: number | null } = $props();
</script>

{#if devices.length}
  <p class="label">Devices</p>
  <ul class="devices">
    {#each devices as d (d.id)}
      <li>
        <Icon name={d.os === 'android' || d.os === 'ios' ? 'smartphone' : 'laptop'} size={16} />
        <span class="name">{d.name}</span>
        {#if d.id === mine}<span class="me">this device</span>{/if}
        <span class="when tnum">{ago(d.id === mine ? (mineAt ?? d.lastSyncAt) : d.lastSyncAt)}</span>
      </li>
    {/each}
  </ul>
{/if}
