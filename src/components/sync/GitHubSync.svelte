<script lang="ts">
  // GitHub Sync: connect once (repo + a fine-grained token kept in the keychain), then it just
  // keeps every device the same. Optionally sealed with the master password, so the repo holds
  // only ciphertext.
  import { onMount } from 'svelte';
  import Icon from '../../lib/Icon.svelte';
  import { platform } from '../../lib/platform';
  import { d1Sync, githubSync as sync, TOKEN_URL, type TestResult } from '../../lib/sync/sync.svelte';
  import Segmented from '../Segmented.svelte';
  import DeviceList from './DeviceList.svelte';
  import PasswordPrompt from './PasswordPrompt.svelte';
  import RecoveryKey from './RecoveryKey.svelte';
  import { ago, messageOf, plural } from './time';

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
  /** The encryption switch's little flow. */
  let enc = $state<'idle' | 'new' | 'key' | 'confirm' | 'join' | 'off'>('idle');
  let freshKey = $state('');

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
  const lockedHere = $derived(status.state === 'error' && (status.kind === 'locked' || status.kind === 'vault'));

  const statusLine = $derived.by(() => {
    if (status.state === 'syncing') return 'Syncing…';
    if (status.state === 'error') return status.message;
    if (!cfg.enabled) return 'Paused on this device.';
    if (!cfg.lastSyncAt) return 'Waiting for the first sync…';
    return `Synced ${ago(cfg.lastSyncAt)} · ${plural(Math.max(1, sync.devices.length), 'device', 'devices')}`;
  });

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
      enc = 'idle';
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

  /** The switch asks first; it only flips once the password step is done. */
  async function askEncrypt(e: Event) {
    const box = e.currentTarget as HTMLInputElement;
    const on = box.checked;
    box.checked = cfg.encrypted;
    problem = '';
    if (!on) {
      enc = 'off';
      return;
    }
    try {
      if (await sync.remoteVault()) enc = 'join';
      else enc = sync.unlocked ? 'confirm' : 'new';
    } catch (err) {
      problem = messageOf(err);
    }
  }

  async function turnOn() {
    enc = 'idle';
    await sync.setEncrypted(true);
  }
</script>

<div class="card" aria-labelledby="gh-heading">
  <div class="card-head">
    <span class="badge" class:open={connected && cfg.enabled}><Icon name="cloud" size={16} /></span>
    <div>
      <h4 id="gh-heading">GitHub</h4>
      <p class="sub">{connected ? `${cfg.repo}${cfg.encrypted ? ' · encrypted' : ''}` : 'Small files in a private repo you own'}</p>
    </div>
  </div>

  {#if connected}
    <div class="row">
      <span class="status tnum" class:gentle={status.state === 'error'} aria-live="polite">{statusLine}</span>
      <button class="btn btn-soft" onclick={() => sync.syncNow()} disabled={!cfg.enabled || status.state === 'syncing'}>
        <Icon name="refresh" size={14} /> Sync now
      </button>
    </div>
    <label class="row">
      <span>Sync this device</span>
      <input type="checkbox" class="switch" checked={cfg.enabled} onchange={(e) => sync.enable(e.currentTarget.checked)} />
    </label>
    <label class="row">
      <span><Icon name="lock" size={14} /> Encrypt with your master password</span>
      <input type="checkbox" class="switch" checked={cfg.encrypted} onchange={askEncrypt} disabled={enc !== 'idle'} />
    </label>

    {#if lockedHere && enc === 'idle' && !cfg.encrypted}
      <p class="notice"><Icon name="lock" size={14} /> Another device encrypted this repo. Turn on encryption here and enter the master password to keep syncing.</p>
    {/if}

    {#if enc === 'new'}
      <PasswordPrompt
        mode="new"
        title="Choose a master password"
        hint="It seals your synced files on every device. You'll get a recovery key next."
        submitLabel="Set password"
        onsubmit={async (pw) => {
          freshKey = (await sync.createPassword(pw)) ?? '';
          if (freshKey) enc = 'key';
          else await turnOn();
        }}
        oncancel={() => (enc = 'idle')}
      />
    {:else if enc === 'key'}
      <RecoveryKey code={freshKey} oncontinue={() => ((freshKey = ''), turnOn())} />
    {:else if enc === 'confirm'}
      <PasswordPrompt
        mode="enter"
        title="Encrypt this repo"
        hint="Your files move, sealed, into a “vault” folder and the plain ones are removed. Update Daybloom on your other computers first."
        submitLabel="Encrypt"
        onsubmit={async (pw) => {
          await sync.createPassword(pw);
          await turnOn();
        }}
        oncancel={() => (enc = 'idle')}
      />
    {:else if enc === 'join'}
      <PasswordPrompt
        mode="enter"
        title="This repo is already encrypted"
        hint="Enter the master password you chose on your other device."
        submitLabel="Unlock and sync"
        recovery
        onsubmit={async (secret, how) => {
          await sync.unlock(secret, how);
          await turnOn();
        }}
        oncancel={() => (enc = 'idle')}
      />
    {:else if enc === 'off'}
      <PasswordPrompt
        mode="enter"
        title="Turn encryption off"
        hint="Your files go back into the repo in the clear, for every device. Enter your master password to confirm."
        submitLabel="Turn off"
        onsubmit={async (pw) => {
          await sync.setEncrypted(false, pw);
          // Nothing else uses the master password: this device forgets the key too.
          if (!d1Sync.configured) await sync.lockHere();
          enc = 'idle';
        }}
        oncancel={() => (enc = 'idle')}
      />
    {/if}

    {#if cfg.encrypted && enc === 'idle'}
      <p class="hint">The repo holds only sealed files. Git history may still have older plain copies; for a clean start, sync to a new repo.</p>
    {/if}

    {#if isPublic}
      <p class="notice"><Icon name="eye" size={14} /> This repo is public{cfg.encrypted ? '. Your files are sealed, but a private repo is still the safer place' : ', so anyone can read your blocks. You can make it private in the repo’s settings on GitHub'}.</p>
    {/if}

    {#if status.state === 'error' && status.kind === 'auth' && !replacingToken}
      <button class="btn btn-soft" onclick={() => (replacingToken = true)}>Paste a new token</button>
    {/if}

    <DeviceList devices={sync.devices} mine={cfg.deviceId} mineAt={cfg.lastSyncAt} />

    <details class="conn" open={replacingToken}>
      <summary>Connection</summary>
      <p class="where">{cfg.repo} · {cfg.branch} · {cfg.folder ? `${cfg.folder}/` : 'repo root'}</p>
      <label class="stack">
        <span>This device's name</span>
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
      <p class="hint">Disconnect forgets the token and sync history on this device. Nothing in the repo is touched.</p>
    </details>
  {:else}
    <p class="hint intro">
      Daybloom keeps your blocks, settings and badges as small files in a private GitHub repo you own.
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
            <span>This device's name</span>
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
          This repo already has Daybloom data{result.deviceCount ? ` from ${plural(result.deviceCount, 'device', 'devices')}` : ''}. How should this device join?
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
            ? "This device's blocks and shared settings are replaced by what's in the repo. Badges are kept either way."
            : 'Blocks from both are kept. Where a shared setting differs, the repo’s wins.'}
        </p>
      {/if}
      {#if result.vault}
        <PasswordPrompt
          mode="enter"
          title="This repo's Daybloom data is encrypted"
          hint="Enter the master password you chose on your other device."
          submitLabel="Unlock and start syncing"
          recovery
          onsubmit={async (secret, how) => {
            await sync.unlock(secret, how);
            await sync.setEncrypted(true);
            await startSyncing();
          }}
        />
      {:else}
        <div class="actions">
          <button class="btn btn-primary" onclick={startSyncing} disabled={busy !== ''}>{busy === 'start' ? 'Starting…' : 'Start syncing'}</button>
        </div>
      {/if}
      <p class="hint">Widget placement, open at login, the menu-bar timer and the time zone stay with each device.</p>
    {/if}
  {/if}

  {#if problem}<p class="notice" aria-live="polite">{problem}</p>{/if}
</div>
