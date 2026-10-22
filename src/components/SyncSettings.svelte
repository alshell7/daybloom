<script lang="ts">
  // "Sync": a self-contained Settings section. Two services, alone or together — a GitHub
  // repo, a Cloudflare D1 database — and one master password that seals what they store.
  import D1Sync from './sync/D1Sync.svelte';
  import GitHubSync from './sync/GitHubSync.svelte';
  import VaultCard from './sync/VaultCard.svelte';
</script>

<section class="sync" aria-labelledby="sync-heading">
  <h3 id="sync-heading">Sync</h3>
  <p class="hint lead">Keep your day the same on every device, through a service you own. There's no Daybloom server in between. Use one, or both.</p>
  <VaultCard />
  <GitHubSync />
  <D1Sync />
</section>

<style>
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  h3 {
    margin: 0 0 var(--s-2);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .lead {
    margin: 0 0 var(--s-3);
  }
  .sync :global(.card) {
    margin-top: var(--s-3);
    padding: var(--s-3) var(--s-4) var(--s-4);
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--sunken) 55%, transparent);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .sync :global(.card-head) {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    margin-bottom: var(--s-2);
  }
  .sync :global(.card-head h4) {
    margin: 0;
    font-size: var(--t-sm);
    font-weight: 600;
    color: var(--ink);
  }
  .sync :global(.card-head .sub) {
    margin: 1px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    overflow-wrap: anywhere;
  }
  .sync :global(.badge) {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: 10px;
    background: var(--surface);
    color: var(--ink-3);
    box-shadow: inset 0 0 0 1px var(--line);
    transition:
      color var(--dur-2) var(--ease-out),
      background var(--dur-2) var(--ease-out);
  }
  .sync :global(.badge.open) {
    color: var(--focus-ring);
    background: color-mix(in srgb, var(--focus-ring) 12%, var(--surface));
  }
  .sync :global(.prompt-title) {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink);
  }
  .sync :global(.row) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 40px;
    font-size: var(--t-sm);
  }
  .sync :global(.row > span:first-child) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
  }
  /* A phone: a control that doesn't fit beside its label goes under it, on the right. */
  @media (max-width: 480px) {
    .sync :global(.row) {
      flex-wrap: wrap;
      row-gap: var(--s-2);
    }
    .sync :global(.row > :last-child:not(:first-child)) {
      margin-left: auto;
    }
    .sync :global(.row:has(> .switch) > :first-child) {
      flex: 1 1 0;
      min-width: 0;
    }
  }
  .sync :global(.status) {
    min-width: 0;
    line-height: 1.4;
  }
  .sync :global(.status.gentle) {
    color: color-mix(in srgb, var(--warm) 70%, var(--ink));
  }
  .sync :global(.hint) {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.5;
  }
  .sync :global(.intro) {
    margin: 0 0 var(--s-3);
  }
  .sync :global(.hint em) {
    font-style: normal;
    color: var(--ink-2);
    font-weight: 500;
  }
  .sync :global(.label) {
    margin: var(--s-4) 0 var(--s-2);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .sync :global(.setup) {
    display: grid;
    gap: var(--s-3);
  }
  .sync :global(.setup .hint) {
    margin: 0;
  }
  .sync :global(.stack) {
    display: grid;
    gap: 6px;
    font-size: var(--t-sm);
  }
  .sync :global(.stack > span:first-child),
  .sync :global(.stack > label:first-child) {
    color: var(--ink-2);
  }
  .sync :global(.stack .field),
  .sync :global(.inline .field) {
    height: 34px;
    font-size: var(--t-sm);
  }
  .sync :global(.inline) {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 34px;
  }
  .sync :global(.inline .field) {
    flex: 1;
    min-width: 0;
  }
  .sync :global(.chip) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 9px;
    border-radius: var(--r-pill);
    background: var(--sunken);
    color: var(--ink-2);
    font-size: var(--t-xs);
  }
  .sync :global(.link) {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-xs);
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 2px;
    transition: text-decoration-color var(--dur-1) var(--ease-out);
  }
  .sync :global(.link:hover) {
    text-decoration-color: currentColor;
  }
  .sync :global(details) {
    margin-top: var(--s-3);
    font-size: var(--t-sm);
  }
  .sync :global(.setup details) {
    margin-top: 0;
  }
  .sync :global(summary) {
    cursor: pointer;
    color: var(--ink-2);
    min-height: 28px;
    display: list-item;
  }
  .sync :global(details[open] > summary) {
    margin-bottom: var(--s-2);
  }
  .sync :global(.conn .stack + .stack) {
    margin-top: var(--s-3);
  }
  .sync :global(.advanced) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s-3);
  }
  .sync :global(.advanced .wide) {
    grid-column: 1 / -1;
  }
  .sync :global(.where) {
    margin: 0 0 var(--s-3);
    font-size: var(--t-xs);
    color: var(--ink-3);
    overflow-wrap: anywhere;
  }
  .sync :global(.actions) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    margin-top: var(--s-3);
  }
  .sync :global(.setup .actions) {
    margin-top: 0;
  }
  .sync :global(.ok) {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: var(--s-3) 0 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .sync :global(.notice) {
    display: flex;
    align-items: flex-start;
    gap: var(--s-2);
    margin: var(--s-3) 0 0;
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--warm) 12%, transparent);
    color: var(--ink-2);
    font-size: var(--t-xs);
    line-height: 1.5;
  }
  .sync :global(.notice svg) {
    flex: none;
    margin-top: 2px;
    color: color-mix(in srgb, var(--warm) 80%, var(--ink));
  }
  .sync :global(.devices) {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .sync :global(.devices li) {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 34px;
    padding: 0 var(--s-3);
    border-radius: var(--r-sm);
    background: var(--surface);
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .sync :global(.devices .name) {
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sync :global(.devices .me) {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .sync :global(.devices .when) {
    margin-left: auto;
    font-size: var(--t-xs);
    color: var(--ink-3);
    white-space: nowrap;
  }
  .sync :global(.switch) {
    appearance: none;
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: var(--line-strong);
    position: relative;
    cursor: pointer;
    transition: background var(--dur-2) var(--ease-out);
    flex: none;
  }
  .sync :global(.switch:disabled) {
    opacity: 0.55;
    cursor: default;
  }
  .sync :global(.switch::after) {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
    transition:
      transform var(--dur-2) var(--ease-settle),
      width var(--dur-1) var(--ease-out);
  }
  .sync :global(.switch:checked) {
    background: var(--focus-ring);
  }
  .sync :global(.switch:checked::after) {
    transform: translateX(16px);
  }
  .sync :global(.switch:active::after) {
    width: 23px;
  }
  .sync :global(.switch:checked:active::after) {
    transform: translateX(11px);
  }
</style>
