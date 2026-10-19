<script lang="ts">
  // "Sync with GitHub": a self-contained Settings section. Connect once (repo + a
  // fine-grained token kept in the keychain), then it just keeps every computer the same.
  import { onMount } from 'svelte';
  import Icon from '../lib/Icon.svelte';
  import { platform } from '../lib/platform';
  import { clock } from '../lib/stores/clock.svelte';
  import { githubSync as sync, TOKEN_URL, type TestResult } from '../lib/sync/sync.svelte';
  import Segmented from './Segmented.svelte';

  let repo = $state('');
  let branch = $state('main');
  let folder = $state('daybloom/');
  let deviceName = $state('');
  let token = $state('');
  let replacingToken = $state(false);
  let editing = $state(false);
  let busy = $state<'' | 'test' | 'start' | 'token' | 'disconnect'>('');
  let result = $state<TestResult | null>(null);
  let problem = $state('');
  let join = $state<'replace' | 'merge'>('replace');

  function fillFromConfig() {
    repo = sync.config.repo;
    branch = sync.config.branch;
    folder = sync.config.folder ? `${sync.config.folder}/` : '';
    deviceName = sync.config.deviceName;
  }

  onMount(() => {
    sync.init().then(fillFromConfig);
  });

  const cfg = $derived(sync.config);
  const status = $derived(sync.status);
  const connected = $derived(!editing && sync.configured && (cfg.enabled || !sync.firstSync));
  const isPublic = $derived(result ? !result.repo.private : cfg.repoPrivate === false);
  const needsChoice = $derived(!!result?.hasData && sync.firstSync);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  function ago(ms: number | null | undefined): string {
    if (!ms) return 'not yet';
    const s = Math.max(0, Math.round((clock.now - ms) / 1000));
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    const d = Math.round(h / 24);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }

  const statusLine = $derived.by(() => {
    if (status.state === 'syncing') return 'Syncing…';
    if (status.state === 'error') return status.message;
    if (!cfg.enabled) return 'Paused on this computer.';
    if (!cfg.lastSyncAt) return 'Waiting for the first sync…';
    return `Synced ${ago(cfg.lastSyncAt)} · ${plural(Math.max(1, sync.devices.length), 'device', 'devices')}`;
  });

  const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong.');

  async function test(e?: SubmitEvent) {
    e?.preventDefault();
    problem = '';
    result = null;
    busy = 'test';
    try {
      await sync.configure({ repo, branch, folder, deviceName });
      fillFromConfig();
      if (token.trim()) {
        await sync.saveToken(token);
        token = '';
        replacingToken = false;
      }
      if (!sync.hasToken) throw new Error('Paste a token to connect.');
      result = await sync.test();
    } catch (err) {
      problem = messageOf(err);
    } finally {
      busy = '';
    }
  }

  async function startSyncing() {
    problem = '';
    busy = 'start';
    try {
      await sync.enable(true, needsChoice ? join : 'merge');
      result = null;
      editing = false;
    } catch (err) {
      problem = messageOf(err);
    } finally {
      busy = '';
    }
  }

  async function saveToken() {
    problem = '';
    busy = 'token';
    try {
      await sync.saveToken(token);
      token = '';
      replacingToken = false;
      if (sync.config.enabled) await sync.syncNow();
    } catch (err) {
      problem = messageOf(err);
    } finally {
      busy = '';
    }
  }

  async function disconnect() {
    busy = 'disconnect';
    try {
      await sync.disconnect();
      token = '';
      replacingToken = false;
      editing = false;
      result = null;
      problem = '';
      fillFromConfig();
    } finally {
      busy = '';
    }
  }

  function cancelEditing() {
    editing = false;
    result = null;
    problem = '';
    token = '';
    replacingToken = false;
    fillFromConfig();
  }
</script>

<section aria-labelledby="sync-heading">
  <h3 id="sync-heading">Sync with GitHub</h3>

  {#if connected}
    <div class="row">
      <span class="status tnum" class:gentle={status.state === 'error'} aria-live="polite">{statusLine}</span>
      <button class="btn btn-soft" onclick={() => sync.syncNow()} disabled={!cfg.enabled || status.state === 'syncing'}>
        <Icon name="refresh" size={14} /> Sync now
      </button>
    </div>
    <label class="row">
      <span>Sync this computer</span>
      <input type="checkbox" class="switch" checked={cfg.enabled} onchange={(e) => sync.enable(e.currentTarget.checked)} />
    </label>

    {#if isPublic}
      <p class="notice"><Icon name="eye" size={14} /> This repo is public, so anyone can read your blocks. You can make it private in the repo's settings on GitHub.</p>
    {/if}

    {#if status.state === 'error' && status.kind === 'auth' && !replacingToken}
      <button class="btn btn-soft" onclick={() => (replacingToken = true)}>Paste a new token</button>
    {/if}

    {#if sync.devices.length}
      <p class="label">Devices</p>
      <ul class="devices">
        {#each sync.devices as d (d.id)}
          <li>
            <Icon name="laptop" size={16} />
            <span class="name">{d.name}</span>
            {#if d.id === cfg.deviceId}<span class="me">this computer</span>{/if}
            <span class="when tnum">{ago(d.id === cfg.deviceId ? (cfg.lastSyncAt ?? d.lastSyncAt) : d.lastSyncAt)}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <details class="conn" open={replacingToken}>
      <summary>Connection</summary>
      <p class="where">{cfg.repo} · {cfg.branch} · {cfg.folder ? `${cfg.folder}/` : 'repo root'}</p>
      <label class="stack">
        <span>This computer's name</span>
        <input class="field" bind:value={deviceName} maxlength="60" onchange={() => sync.configure({ deviceName })} />
      </label>
      <div class="stack">
        <span>Access token</span>
        {#if replacingToken}
          <div class="inline">
            <input class="field" type="password" placeholder="github_pat_…" bind:value={token} autocomplete="off" spellcheck="false" aria-label="New access token" />
            <button class="btn btn-soft" onclick={saveToken} disabled={busy !== '' || !token.trim()}>{busy === 'token' ? 'Saving…' : 'Save'}</button>
          </div>
        {:else}
          <div class="inline">
            <span class="chip"><Icon name="check" size={12} /> Saved in your keychain</span>
            <button class="btn btn-quiet" onclick={() => (replacingToken = true)}>Replace</button>
          </div>
        {/if}
      </div>
      <div class="actions">
        <button class="btn btn-quiet" onclick={() => (editing = true)}>Change repo…</button>
        <button class="btn btn-quiet" onclick={disconnect} disabled={busy !== ''}>Disconnect</button>
      </div>
      <p class="hint">Disconnect forgets the token and sync history on this computer. Nothing in the repo is touched.</p>
    </details>
  {:else}
    <p class="hint intro">
      Keep your blocks, settings and badges the same on every Mac and PC. Daybloom keeps them as small files in a private GitHub repo you own — there's no Daybloom server in between.
    </p>

    <form class="setup" onsubmit={test}>
      <label class="stack">
        <span>Repository</span>
        <input class="field" placeholder="you/daybloom-data" bind:value={repo} autocomplete="off" spellcheck="false" autocapitalize="off" />
      </label>

      <div class="stack">
        <label for="sync-token">Access token</label>
        {#if sync.hasToken && !replacingToken}
          <div class="inline">
            <span class="chip"><Icon name="check" size={12} /> Saved in your keychain</span>
            <button type="button" class="btn btn-quiet" onclick={() => (replacingToken = true)}>Replace</button>
          </div>
        {:else}
          <input id="sync-token" class="field" type="password" placeholder="github_pat_…" bind:value={token} autocomplete="off" spellcheck="false" />
        {/if}
      </div>
      <p class="hint">
        Make a fine-grained token with access to only this repo, and set <em>Contents</em> to <em>Read and write</em> — nothing else.
        It goes straight into your system keychain and isn't shown again.
        <button type="button" class="link" onclick={() => platform.openExternal(TOKEN_URL)}>Create a token on GitHub <Icon name="external" size={12} /></button>
      </p>
      {#if !platform.isNative}
        <p class="hint">In the browser preview the token only lasts until this tab closes.</p>
      {/if}

      <details>
        <summary>Advanced</summary>
        <div class="advanced">
          <label class="stack">
            <span>Branch</span>
            <input class="field" placeholder="main" bind:value={branch} autocomplete="off" spellcheck="false" />
          </label>
          <label class="stack">
            <span>Folder</span>
            <input class="field" placeholder="daybloom/" bind:value={folder} autocomplete="off" spellcheck="false" />
          </label>
          <label class="stack wide">
            <span>This computer's name</span>
            <input class="field" bind:value={deviceName} maxlength="60" />
          </label>
        </div>
      </details>

      <div class="actions">
        <button class="btn btn-soft" disabled={busy !== '' || !repo.trim() || (!sync.hasToken && !token.trim())}>
          {busy === 'test' ? 'Checking…' : 'Test connection'}
        </button>
        {#if editing}<button type="button" class="btn btn-quiet" onclick={cancelEditing}>Cancel</button>{/if}
      </div>
    </form>

    {#if result}
      <p class="ok" aria-live="polite"><Icon name="circle-check" size={14} /> Connected to {result.repo.fullName} · {result.repo.private ? 'private' : 'public'}</p>
      {#if !result.repo.private}
        <p class="notice"><Icon name="eye" size={14} /> This repo is public, so anyone could read your blocks. Making it private (in the repo's settings on GitHub) takes a moment.</p>
      {/if}
      {#if needsChoice}
        <p class="hint">
          This repo already has Daybloom data{result.deviceCount ? ` from ${plural(result.deviceCount, 'computer', 'computers')}` : ''}. How should this computer join?
        </p>
        <Segmented
          label="How to join"
          value={join}
          options={[
            { value: 'replace', label: "Use the repo's" },
            { value: 'merge', label: 'Combine both' },
          ]}
          onchange={(v) => (join = v)}
        />
        <p class="hint">
          {join === 'replace'
            ? "This computer's blocks and shared settings are replaced by what's in the repo. Badges are kept either way."
            : 'Blocks from both are kept. Where a shared setting differs, the repo’s wins.'}
        </p>
      {/if}
      <div class="actions">
        <button class="btn btn-primary" onclick={startSyncing} disabled={busy !== ''}>{busy === 'start' ? 'Starting…' : 'Start syncing'}</button>
      </div>
      <p class="hint">Widget placement, open at login, the menu-bar timer and the time zone stay with each computer.</p>
    {/if}
  {/if}

  {#if problem}<p class="notice" aria-live="polite">{problem}</p>{/if}
</section>

<style>
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  h3 {
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 40px;
    font-size: var(--t-sm);
  }
  .row > span:first-child {
    color: var(--ink-2);
  }
  .status {
    min-width: 0;
    line-height: 1.4;
  }
  .status.gentle {
    color: color-mix(in srgb, var(--warm) 70%, var(--ink));
  }
  .hint {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.5;
  }
  .intro {
    margin: 0 0 var(--s-3);
  }
  .hint em {
    font-style: normal;
    color: var(--ink-2);
    font-weight: 500;
  }
  .label {
    margin: var(--s-4) 0 var(--s-2);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .setup {
    display: grid;
    gap: var(--s-3);
  }
  .setup .hint {
    margin: 0;
  }
  .stack {
    display: grid;
    gap: 6px;
    font-size: var(--t-sm);
  }
  .stack > span:first-child,
  .stack > label:first-child {
    color: var(--ink-2);
  }
  .stack .field,
  .inline .field {
    height: 34px;
    font-size: var(--t-sm);
  }
  .inline {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 34px;
  }
  .inline .field {
    flex: 1;
    min-width: 0;
  }
  .chip {
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
  .link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0;
    color: var(--ink);
    font: inherit;
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 2px;
    transition: text-decoration-color var(--dur-1) var(--ease-out);
  }
  .link:hover {
    text-decoration-color: currentColor;
  }
  details {
    margin-top: var(--s-3);
    font-size: var(--t-sm);
  }
  .setup details {
    margin-top: 0;
  }
  summary {
    cursor: pointer;
    color: var(--ink-2);
    min-height: 28px;
    display: list-item;
  }
  details[open] > summary {
    margin-bottom: var(--s-2);
  }
  .conn .stack + .stack {
    margin-top: var(--s-3);
  }
  .advanced {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s-3);
  }
  .advanced .wide {
    grid-column: 1 / -1;
  }
  .where {
    margin: 0 0 var(--s-3);
    font-size: var(--t-xs);
    color: var(--ink-3);
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    margin-top: var(--s-3);
  }
  .setup .actions {
    margin-top: 0;
  }
  .ok {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: var(--s-3) 0 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .notice {
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
  .notice :global(svg) {
    flex: none;
    margin-top: 2px;
    color: color-mix(in srgb, var(--warm) 80%, var(--ink));
  }
  .devices {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .devices li {
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
  .devices .name {
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .devices .me {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .devices .when {
    margin-left: auto;
    font-size: var(--t-xs);
    color: var(--ink-3);
    white-space: nowrap;
  }
  .switch {
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
  .switch::after {
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
  .switch:checked {
    background: var(--focus-ring);
  }
  .switch:checked::after {
    transform: translateX(16px);
  }
  .switch:active::after {
    width: 23px;
  }
  .switch:checked:active::after {
    transform: translateX(11px);
  }
</style>
