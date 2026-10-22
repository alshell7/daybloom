<script lang="ts">
  // Cloudflare D1 sync: your own Cloudflare account and database, set up here (the account ID
  // and an API token, kept in the keychain), always sealed with the master password. Turning
  // it on or off, and disconnecting, ask for that password first.
  import { onMount } from 'svelte';
  import Icon from '../../lib/Icon.svelte';
  import { keychain, platform } from '../../lib/platform';
  import { D1_DEFAULT_NAME, D1_TOKEN_URL, validAccountId, type D1Database } from '../../lib/sync/d1';
  import type { TestResult } from '../../lib/sync/engine.svelte';
  import { d1Sync as sync, githubSync } from '../../lib/sync/sync.svelte';
  import { bioForget, bioOpen, bioState } from '../../lib/native/bio';
  import Segmented from '../Segmented.svelte';
  import DeviceList from './DeviceList.svelte';
  import SyncOptions from './SyncOptions.svelte';
  import PasswordPrompt from './PasswordPrompt.svelte';
  import RecoveryKey from './RecoveryKey.svelte';
  import { ago, messageOf, plural } from './time';

  type Step = 'creds' | 'db' | 'vault' | 'key' | 'join';
  let step = $state<Step>('creds');
  let accountId = $state('');
  let token = $state('');
  let deviceName = $state('');
  let replacingToken = $state(false);
  let dbs = $state<D1Database[] | null>(null);
  let result = $state<TestResult<D1Database> | null>(null);
  let join = $state<'replace' | 'merge'>('merge');
  let freshKey = $state('');
  let busy = $state('');
  let problem = $state('');
  /** Password-gated actions once connected. */
  let gate = $state<'' | 'on' | 'off' | 'disconnect'>('');
  let erase = $state(false);
  // A phone with the fingerprint unlock set up confirms these with a fingerprint instead.
  let bioSealed = $state(false);
  $effect(() => {
    void gate;
    void bioState().then((s) => (bioSealed = s.sealed));
  });
  const viaFinger = (then: () => Promise<void>) => (bioSealed ? async () => {
    await sync.adoptKey(await bioOpen('Confirm it’s you'));
    await then();
  } : undefined);

  onMount(() => {
    sync.init().then(() => {
      accountId = sync.config.accountId;
      deviceName = sync.config.deviceName;
    });
  });

  const cfg = $derived(sync.config);
  const status = $derived(sync.status);
  const connected = $derived(sync.configured && (cfg.enabled || !sync.firstSync) && step === 'creds');
  const needsChoice = $derived(!!result?.hasData && sync.firstSync);
  const existing = $derived(dbs?.find((d) => d.name === D1_DEFAULT_NAME) ?? null);

  const statusLine = $derived.by(() => {
    if (status.state === 'syncing') return 'Syncing…';
    if (status.state === 'error') return status.message;
    if (!cfg.enabled) return 'Paused on this device.';
    if (!cfg.lastSyncAt) return 'Waiting for the first sync…';
    return `Synced ${ago(cfg.lastSyncAt)} · ${plural(Math.max(1, sync.devices.length), 'device', 'devices')}`;
  });

  async function work(name: string, fn: () => Promise<void>) {
    problem = '';
    busy = name;
    try {
      await fn();
    } catch (err) {
      problem = messageOf(err);
    } finally {
      busy = '';
    }
  }

  const connect = (e: SubmitEvent) => {
    e.preventDefault();
    return work('connect', async () => {
      if (!validAccountId(accountId)) throw new Error('The account ID has 32 letters and digits. Copy it from the Cloudflare dashboard.');
      await sync.configure({ accountId, deviceName });
      if (token.trim()) {
        await sync.saveToken(token);
        token = '';
        replacingToken = false;
      }
      if (!sync.hasToken) throw new Error('Paste an API token to connect.');
      dbs = await sync.databases();
      step = 'db';
    });
  };

  const pick = (db: D1Database | null) =>
    work(db ? `db:${db.id}` : 'create', async () => {
      if (db) await sync.configure({ databaseId: db.id, databaseName: db.name });
      else await sync.createDatabase();
      result = await sync.test();
      step = 'vault';
    });

  async function setPassword(pw: string) {
    const key = await sync.createPassword(pw);
    if (key) {
      freshKey = key;
      step = 'key';
    } else step = 'join';
  }

  const start = () =>
    work('start', async () => {
      await sync.enable(true, needsChoice ? join : 'merge');
      step = 'creds';
      result = null;
      dbs = null;
    });

  async function changeDatabase() {
    await work('dbs', async () => {
      dbs = await sync.databases();
      step = 'db';
    });
  }
</script>

<div class="card" aria-labelledby="d1-heading">
  <div class="card-head">
    <span class="badge" class:open={connected && cfg.enabled}><Icon name="database" size={16} /></span>
    <div>
      <h4 id="d1-heading">Cloudflare D1</h4>
      <p class="sub">{connected ? `${cfg.databaseName || 'Your database'} · encrypted` : 'Your own database, encrypted end to end'}</p>
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
      <input
        type="checkbox"
        class="switch"
        checked={cfg.enabled}
        disabled={gate !== ''}
        onchange={(e) => {
          const on = e.currentTarget.checked;
          e.currentTarget.checked = cfg.enabled;
          gate = on ? 'on' : 'off';
        }}
      />
    </label>

    {#if gate === 'on'}
      <PasswordPrompt
        mode="enter"
        title="Turn on Cloudflare D1 sync"
        submitLabel="Turn on"
        recovery={!sync.unlocked}
        onbiometric={viaFinger(async () => {
          await sync.enable(true);
          gate = '';
        })}
        onsubmit={async (secret, how) => {
          if (sync.unlocked) {
            if (!(await sync.checkPassword(secret))) throw new Error('That isn’t your master password. Check caps lock and try again.');
          } else await sync.unlock(secret, how);
          await sync.enable(true);
          gate = '';
        }}
        oncancel={() => (gate = '')}
      />
    {:else if gate === 'off'}
      <PasswordPrompt
        mode="enter"
        title="Pause Cloudflare D1 sync"
        hint="This device stops syncing. Your data stays in the database, sealed."
        submitLabel="Pause"
        onbiometric={viaFinger(async () => {
          await sync.enable(false);
          gate = '';
        })}
        onsubmit={async (pw) => {
          if (!(await sync.checkPassword(pw))) throw new Error('That isn’t your master password. Check caps lock and try again.');
          await sync.enable(false);
          gate = '';
        }}
        oncancel={() => (gate = '')}
      />
    {:else if gate === 'disconnect'}
      <label class="tick">
        <input type="checkbox" bind:checked={erase} />
        <span>Also erase Daybloom's data from {cfg.databaseName || 'the database'}</span>
      </label>
      <PasswordPrompt
        mode="enter"
        title="Disconnect Cloudflare D1"
        hint={erase
          ? 'Every device loses this copy. The data on each device stays.'
          : 'This device forgets the token and sync history. The database keeps its sealed data.'}
        submitLabel={erase ? 'Erase and disconnect' : 'Disconnect'}
        onbiometric={viaFinger(async () => {
          await sync.disconnect({ erase });
          if (!githubSync.config.encrypted) {
            await sync.lockHere();
            await bioForget().catch(() => {});
          }
          gate = '';
          erase = false;
        })}
        onsubmit={async (pw) => {
          if (!(await sync.checkPassword(pw))) throw new Error('That isn’t your master password. Check caps lock and try again.');
          await sync.disconnect({ erase });
          // Nothing else uses the master password: this device forgets the key too.
          if (!githubSync.config.encrypted) {
            await sync.lockHere();
            await bioForget().catch(() => {});
          }
          gate = '';
          erase = false;
          accountId = sync.config.accountId;
        }}
        oncancel={() => ((gate = ''), (erase = false))}
      />
    {/if}

    {#if status.state === 'error' && status.kind === 'auth' && !replacingToken}
      <button class="btn btn-soft" onclick={() => (replacingToken = true)}>Paste a new token</button>
    {/if}

    <DeviceList devices={sync.devices} mine={cfg.deviceId} mineAt={cfg.lastSyncAt} />

    <SyncOptions {sync} />

    <details class="conn" open={replacingToken}>
      <summary>Connection</summary>
      <p class="where">Account …{cfg.accountId.slice(-6)} · {cfg.databaseName || cfg.databaseId}</p>
      <label class="stack">
        <span>This device's name</span>
        <input class="field" bind:value={deviceName} maxlength="60" onchange={() => sync.configure({ deviceName })} />
      </label>
      <div class="stack">
        <span>API token</span>
        {#if replacingToken}
          <div class="inline">
            <input class="field" type="password" bind:value={token} autocomplete="off" spellcheck="false" aria-label="New API token" />
            <button
              class="btn btn-soft"
              disabled={busy !== '' || !token.trim()}
              onclick={() =>
                work('token', async () => {
                  await sync.saveToken(token);
                  token = '';
                  replacingToken = false;
                  if (cfg.enabled) await sync.syncNow();
                })}>{busy === 'token' ? 'Saving…' : 'Save'}</button
            >
          </div>
        {:else}
          <div class="inline">
            <span class="chip"><Icon name="check" size={12} /> {platform.isMobile ? 'Saved on this phone' : 'Saved in your keychain'}</span>
            <button class="btn btn-quiet" onclick={() => (replacingToken = true)}>Replace</button>
          </div>
        {/if}
      </div>
      <div class="actions">
        <button class="btn btn-quiet" onclick={changeDatabase} disabled={busy !== ''}>Change database…</button>
        <button class="btn btn-quiet" onclick={() => (gate = 'disconnect')} disabled={gate !== ''}>Disconnect…</button>
      </div>
    </details>
  {:else if step === 'creds'}
    <p class="hint intro">
      Sync through a database in your own Cloudflare account. Everything is sealed with your master password before it leaves this device, so Cloudflare stores only ciphertext.
    </p>
    <form class="setup" onsubmit={connect}>
      <label class="stack">
        <span>Account ID</span>
        <input class="field tnum" placeholder="32 letters and digits" bind:value={accountId} autocomplete="off" spellcheck="false" autocapitalize="off" />
      </label>
      <p class="hint">On the Cloudflare dashboard, open your account's home page. The Account ID is in the column on the right.</p>
      <div class="stack">
        <label for="d1-token">API token</label>
        {#if sync.hasToken && !replacingToken}
          <div class="inline">
            <span class="chip"><Icon name="check" size={12} /> {platform.isMobile ? 'Saved on this phone' : 'Saved in your keychain'}</span>
            <button type="button" class="btn btn-quiet" onclick={() => (replacingToken = true)}>Replace</button>
          </div>
        {:else}
          <input id="d1-token" class="field" type="password" bind:value={token} autocomplete="off" spellcheck="false" />
        {/if}
      </div>
      <p class="hint">
        Create a custom token with one permission, <em>Account · D1 · Edit</em>, for this account only. It goes straight into {keychain}.
        <button type="button" class="link" onclick={() => platform.openExternal(D1_TOKEN_URL)}>Create a token on Cloudflare <Icon name="external" size={12} /></button>
      </p>
      {#if !platform.isNative}
        <p class="hint">In the browser preview the token only lasts until this tab closes.</p>
      {/if}
      <div class="actions">
        <button class="btn btn-soft" disabled={busy !== '' || !accountId.trim() || (!sync.hasToken && !token.trim())}>
          {busy === 'connect' ? 'Checking…' : 'Connect'}
        </button>
      </div>
    </form>
  {:else if step === 'db'}
    <p class="hint intro">Pick the database Daybloom should use. It keeps its data in its own table, so a database you use for other things is fine too.</p>
    <ul class="dbs">
      {#if !existing}
        <li>
          <button class="db" onclick={() => pick(null)} disabled={busy !== ''}>
            <Icon name="plus" size={16} />
            <span class="name">Create “{D1_DEFAULT_NAME}”</span>
            <span class="when">{busy === 'create' ? 'Creating…' : 'recommended'}</span>
          </button>
        </li>
      {/if}
      {#each dbs ?? [] as db (db.id)}
        <li>
          <button class="db" class:current={db.id === cfg.databaseId} onclick={() => pick(db)} disabled={busy !== ''}>
            <Icon name="database" size={16} />
            <span class="name">{db.name}</span>
            <span class="when">{busy === `db:${db.id}` ? 'Checking…' : db.name === D1_DEFAULT_NAME ? 'Daybloom' : ''}</span>
          </button>
        </li>
      {/each}
    </ul>
    <div class="actions">
      <button class="btn btn-quiet" onclick={() => (step = 'creds')}>Back</button>
    </div>
  {:else if step === 'vault' && result}
    <p class="ok"><Icon name="circle-check" size={14} /> Connected to {result.info.name}</p>
    {#if result.vault}
      <PasswordPrompt
        mode="enter"
        title="This database is already encrypted"
        hint="Enter the master password you chose on your other device."
        submitLabel="Unlock"
        recovery
        onsubmit={async (secret, how) => {
          await sync.unlock(secret, how);
          step = 'join';
        }}
        oncancel={() => (step = 'db')}
      />
    {:else if sync.unlocked}
      <PasswordPrompt
        mode="enter"
        title="Use your master password"
        hint="The same password that encrypts your GitHub sync will seal this database too."
        submitLabel="Continue"
        onsubmit={async (pw) => {
          await setPassword(pw);
        }}
        oncancel={() => (step = 'db')}
      />
    {:else}
      <PasswordPrompt
        mode="new"
        title="Choose a master password"
        hint="It seals everything Daybloom syncs. You'll get a recovery key next."
        submitLabel="Set password"
        onsubmit={setPassword}
        oncancel={() => (step = 'db')}
      />
    {/if}
  {:else if step === 'key'}
    <RecoveryKey code={freshKey} oncontinue={() => ((freshKey = ''), (step = 'join'))} />
  {:else if step === 'join' && result}
    {#if needsChoice}
      <p class="hint">
        {result.info.name} already has Daybloom data{result.deviceCount ? ` from ${plural(result.deviceCount, 'device', 'devices')}` : ''}. How should this device join?
      </p>
      <Segmented
        label="How to join"
        value={join}
        options={[
          { value: 'replace', label: 'Use the database’s' },
          { value: 'merge', label: 'Combine both' },
        ]}
        onchange={(v) => (join = v)}
      />
      <p class="hint">
        {join === 'replace'
          ? "This device's blocks and shared settings are replaced by what's in the database. Badges are kept either way."
          : 'Blocks from both are kept. Where a shared setting differs, the database’s wins.'}
      </p>
    {/if}
    <div class="actions">
      <button class="btn btn-primary" onclick={start} disabled={busy !== ''}>{busy === 'start' ? 'Starting…' : 'Start syncing'}</button>
    </div>
    <p class="hint">Also synced, sealed: the Trash, calendar subscriptions and their links, AI services and keys. Widget placement and the time zone stay with each device.</p>
  {/if}

  {#if problem}<p class="notice" aria-live="polite">{problem}</p>{/if}
</div>

<style>
  .dbs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .db {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    width: 100%;
    min-height: 40px;
    padding: 0 var(--s-3);
    border-radius: var(--r-sm);
    background: var(--surface);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--t-sm);
    text-align: left;
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .db:hover:not(:disabled) {
    background: color-mix(in srgb, var(--surface), var(--ink) 5%);
  }
  .db:active:not(:disabled) {
    transform: scale(0.99);
  }
  .db.current {
    box-shadow: inset 0 0 0 1px var(--focus-ring);
  }
  .db .name {
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .db .when {
    margin-left: auto;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .tick {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    margin-top: var(--s-3);
    font-size: var(--t-sm);
    color: var(--ink-2);
    cursor: pointer;
  }
</style>
