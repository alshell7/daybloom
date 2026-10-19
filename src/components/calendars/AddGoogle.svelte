<script lang="ts">
  import type { CalendarAccount } from '../../lib/calendar/types';
  import { calendarState, connectGoogleAccount } from '../../lib/calendarBridge.svelte';
  import Icon from '../../lib/Icon.svelte';
  import { platform } from '../../lib/platform';
  import { settings } from '../../lib/stores/settings.svelte';
  import Spinner from './Spinner.svelte';

  let {
    showSetup = false,
    onadded,
  }: {
    /** Open the client ID fields at first (a card asked to set up Google). */
    showSetup?: boolean;
    onadded: (account: CalendarAccount) => void;
  } = $props();

  let busy = $state(false);
  let error = $state('');

  const ready = $derived(calendarState.googleConfigured || !!settings.value.google.clientId.trim());

  async function signIn() {
    error = '';
    busy = true;
    try {
      onadded(await connectGoogleAccount());
    } catch (e) {
      error = (e as Error)?.message ?? String(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="google">
  <p class="text">
    Daybloom opens Google in your web browser. Choose the account, then allow access. Daybloom only reads your calendars.
  </p>
  <div class="actions">
    <button class="btn btn-primary" onclick={signIn} disabled={busy}>
      {#if busy}
        <Spinner size={14} /> Waiting for Google…
      {:else}
        <Icon name="google" size={15} /> Sign in with Google
      {/if}
    </button>
  </div>
  {#if busy}
    <p class="hint" role="status">Finish signing in in your browser. Then come back here.</p>
  {/if}
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
  {#if !platform.isNative}
    <p class="hint">Google sign-in works only in the desktop app.</p>
  {/if}
  <p class="hint">Add as many Google accounts as you use. Work and personal sit side by side.</p>

  <details open={showSetup || !ready}>
    <summary>Google client ID</summary>
    <p class="hint">Daybloom needs a Google OAuth “Desktop app” client to sign in. See docs/calendar.md.</p>
    <input class="field" placeholder="Client ID" autocomplete="off" spellcheck="false" bind:value={settings.value.google.clientId} />
    <input
      class="field"
      placeholder="Client secret (desktop clients have one)"
      autocomplete="off"
      spellcheck="false"
      bind:value={settings.value.google.clientSecret}
    />
  </details>
</div>

<style>
  .google {
    display: grid;
    gap: var(--s-2);
  }
  .text {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.5;
    color: var(--ink-2);
  }
  .actions {
    margin-top: var(--s-1);
  }
  .hint {
    margin: 0;
    font-size: var(--t-xs);
    line-height: 1.5;
    color: var(--ink-3);
  }
  .error {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.45;
    color: var(--danger);
  }
  details {
    margin-top: var(--s-1);
    font-size: var(--t-sm);
  }
  summary {
    cursor: pointer;
    color: var(--ink-2);
    width: fit-content;
  }
  details .hint {
    margin-top: var(--s-2);
  }
  details .field {
    margin-top: var(--s-2);
    height: 34px;
    font-size: var(--t-sm);
  }
</style>
