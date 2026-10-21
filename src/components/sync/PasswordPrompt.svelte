<script lang="ts">
  // One place to type the master password: set a new one (typed twice, with a kind hint on
  // length) or enter it, with the recovery key as a way back in. Errors come back from
  // `onsubmit` as plain words and stay next to the field.
  import Icon from '../../lib/Icon.svelte';
  import { MIN_PASSWORD, normalizeRecovery, passwordProblem } from '../../lib/sync/vault';

  interface Props {
    /** 'new': choose a password (typed twice). 'enter': type the one you chose. */
    mode: 'new' | 'enter';
    title?: string;
    hint?: string;
    submitLabel: string;
    /** Offer "Use my recovery key instead" (enter mode). */
    recovery?: boolean;
    onsubmit: (secret: string, how: 'password' | 'recovery') => Promise<void>;
    oncancel?: () => void;
  }

  let { mode, title, hint, submitLabel, recovery = false, onsubmit, oncancel }: Props = $props();

  let secret = $state('');
  let again = $state('');
  let show = $state(false);
  let how = $state<'password' | 'recovery'>('password');
  let busy = $state(false);
  let problem = $state('');
  const uid = Math.random().toString(36).slice(2, 8);

  const choosing = $derived(mode === 'new' && how === 'password');
  const weak = $derived(choosing && secret ? passwordProblem(secret) : null);
  const ready = $derived(
    how === 'recovery' ? normalizeRecovery(secret).length === 26 : choosing ? !!secret && !weak && secret === again : secret.length > 0,
  );
  const help = $derived.by(() => {
    if (!choosing) return '';
    if (weak) return weak;
    if (again && again !== secret) return 'The two don’t match yet.';
    return `At least ${MIN_PASSWORD} characters. Only you know it: Daybloom can’t see it or reset it, which is what keeps your data private.`;
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    busy = true;
    problem = '';
    try {
      await onsubmit(how === 'recovery' ? secret.trim() : secret, how);
      secret = '';
      again = '';
    } catch (err) {
      problem = err instanceof Error && err.message ? err.message : 'That didn’t work. Try once more.';
    } finally {
      busy = false;
    }
  }

  function switchHow() {
    how = how === 'password' ? 'recovery' : 'password';
    secret = '';
    problem = '';
  }
</script>

<form class="vault-prompt" onsubmit={submit}>
  {#if title}<p class="prompt-title"><Icon name={how === 'recovery' ? 'key' : 'lock'} size={14} /> {title}</p>{/if}
  {#if hint}<p class="hint">{hint}</p>{/if}
  <div class="stack">
    <label for="vault-{uid}">{how === 'recovery' ? 'Recovery key' : 'Master password'}</label>
    <div class="inline">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        id="vault-{uid}"
        class="field"
        type={show || how === 'recovery' ? 'text' : 'password'}
        bind:value={secret}
        autocomplete={choosing ? 'new-password' : 'current-password'}
        spellcheck="false"
        autocapitalize="off"
        autofocus
        placeholder={how === 'recovery' ? 'XXXXX-XXXXX-XXXX-XXXX-XXXX-XXXX' : ''}
      />
      {#if how === 'password'}
        <button type="button" class="btn btn-quiet icon-only" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onclick={() => (show = !show)}>
          <Icon name={show ? 'eye-off' : 'eye'} size={14} />
        </button>
      {/if}
    </div>
  </div>
  {#if choosing}
    <label class="stack">
      <span>Type it again</span>
      <input class="field" type={show ? 'text' : 'password'} bind:value={again} autocomplete="new-password" spellcheck="false" />
    </label>
    <p class="hint" aria-live="polite">{help}</p>
  {/if}
  {#if problem}<p class="notice" aria-live="polite"><Icon name="info" size={14} /> {problem}</p>{/if}
  <div class="actions">
    <button class="btn btn-primary" disabled={!ready || busy}>{busy ? 'One moment…' : submitLabel}</button>
    {#if oncancel}<button type="button" class="btn btn-quiet" onclick={oncancel}>Cancel</button>{/if}
    {#if recovery && mode === 'enter'}
      <button type="button" class="link" onclick={switchHow}>{how === 'password' ? 'Use my recovery key instead' : 'Use my password'}</button>
    {/if}
  </div>
</form>

<style>
  .vault-prompt {
    display: grid;
    gap: var(--s-3);
    margin-top: var(--s-3);
    padding: var(--s-3);
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line);
    animation: rise var(--dur-2) var(--ease-settle);
  }
  .vault-prompt .hint,
  .vault-prompt .notice {
    margin: 0;
  }
  .vault-prompt .actions {
    margin: 0;
    align-items: center;
  }
  .icon-only {
    width: 34px;
    padding: 0;
    justify-content: center;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .vault-prompt {
      animation: none;
    }
  }
</style>
