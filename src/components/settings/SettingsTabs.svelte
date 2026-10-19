<script lang="ts" module>
  export interface SettingsTab {
    id: string;
    label: string;
    icon: string;
    blurb: string;
  }
</script>

<script lang="ts">
  // The settings tabs: equal cells, each an icon over a short name, with a raised thumb that
  // glides to the chosen one on transform (compositor-only). Arrow keys move between them.
  import Icon from '../../lib/Icon.svelte';

  let { tabs, value, onchange }: { tabs: SettingsTab[]; value: string; onchange: (id: string) => void } = $props();

  const index = $derived(Math.max(0, tabs.findIndex((t) => t.id === value)));
  let list: HTMLDivElement | undefined = $state();

  function key(e: KeyboardEvent) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + step + tabs.length) % tabs.length;
    onchange(tabs[next].id);
    list?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
</script>

<div class="tabs" role="tablist" aria-label="Settings" bind:this={list} style:--n={tabs.length} style:--i={index} tabindex="-1" onkeydown={key}>
  <span class="thumb" aria-hidden="true"></span>
  {#each tabs as t, i (t.id)}
    <button
      role="tab"
      id={`settings-tab-${t.id}`}
      aria-selected={i === index}
      aria-controls="settings-pane"
      tabindex={i === index ? 0 : -1}
      title={t.blurb}
      class:on={i === index}
      onclick={() => onchange(t.id)}
    >
      <span class="ico"><Icon name={t.icon} size={17} stroke={1.9} /></span>
      <span class="lbl">{t.label}</span>
    </button>
  {/each}
</div>

<style>
  .tabs {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
    padding: 3px;
    border-radius: var(--r-md);
    background: var(--sunken);
    outline: none;
  }
  .thumb {
    position: absolute;
    top: 3px;
    bottom: 3px;
    left: 3px;
    width: calc((100% - 6px) / var(--n));
    border-radius: calc(var(--r-md) - 3px);
    background: var(--raised);
    box-shadow: var(--shadow-1);
    transform: translateX(calc(var(--i) * 100%));
    transition: transform var(--dur-3) var(--ease-out);
  }
  button {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 3px;
    padding: 7px 2px 6px;
    border-radius: calc(var(--r-md) - 3px);
    color: var(--ink-3);
    transition: color var(--dur-2) var(--ease-out);
  }
  button:hover {
    color: var(--ink-2);
  }
  button.on {
    color: var(--ink);
  }
  .ico {
    display: grid;
    transition: transform var(--dur-3) var(--ease-settle);
  }
  button.on .ico {
    transform: translateY(-1px) scale(1.06);
  }
  button:active .ico {
    transform: scale(0.92);
  }
  .lbl {
    font-size: var(--t-xs);
    font-weight: 500;
    white-space: nowrap;
  }
</style>
