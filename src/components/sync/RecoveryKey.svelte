<script lang="ts">
  // The recovery key, shown once right after it's made: copy it or save it as a file, tick
  // that it's somewhere safe, then carry on. It never appears again.
  import Icon from '../../lib/Icon.svelte';
  import { platform } from '../../lib/platform';
  import { formatRecovery } from '../../lib/sync/vault';

  let { code, oncontinue }: { code: string; oncontinue: () => void } = $props();

  const formatted = $derived(formatRecovery(code));
  // Groups wrap as wholes, never mid-group.
  const groups = $derived(formatted.split('-'));
  let saved = $state(false);
  let note = $state('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatted);
      note = 'Copied. Paste it into your password manager.';
    } catch {
      note = 'Select the key and copy it by hand.';
    }
  }

  async function save() {
    const text = [
      'Daybloom recovery key',
      '',
      formatted,
      '',
      'This key opens your synced Daybloom data if you forget your master password.',
      'Keep it somewhere safe and private. Anyone with it and your sync token can read your data.',
      '',
    ].join('\n');
    try {
      await platform.exportFile('Daybloom recovery key.txt', text, 'reveal');
      note = 'Saved to your Downloads folder. Move it somewhere safe.';
    } catch {
      note = 'Daybloom couldn’t save the file. Copy the key instead.';
    }
  }
</script>

<div class="recovery" role="group" aria-labelledby="recovery-title">
  <p class="prompt-title" id="recovery-title"><Icon name="key" size={14} /> Your recovery key</p>
  <p class="hint">If you ever forget the master password, this key opens your data. It is shown only now. Keep it in a password manager or on paper, away from this device.</p>
  <code class="code tnum" aria-label="Recovery key {formatted.split('').join(' ')}"
    >{#each groups as g, i (i)}<span class="g">{g}{#if i < groups.length - 1}-{/if}</span>{/each}</code
  >
  <div class="actions">
    <button class="btn btn-soft" onclick={copy}><Icon name="copy" size={14} /> Copy</button>
    <button class="btn btn-soft" onclick={save}><Icon name="download" size={14} /> Save as a file</button>
  </div>
  {#if note}<p class="hint" aria-live="polite">{note}</p>{/if}
  <label class="tick">
    <input type="checkbox" bind:checked={saved} />
    <span>I’ve saved it somewhere safe</span>
  </label>
  <div class="actions">
    <button class="btn btn-primary" disabled={!saved} onclick={oncontinue}>Continue</button>
  </div>
</div>

<style>
  .recovery {
    display: grid;
    gap: var(--s-3);
    margin-top: var(--s-3);
    padding: var(--s-3);
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .recovery .hint,
  .recovery .actions {
    margin: 0;
  }
  .code {
    display: block;
    padding: var(--s-3);
    border-radius: var(--r-sm);
    background: var(--sunken);
    color: var(--ink);
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 15px;
    letter-spacing: 0.06em;
    text-align: center;
    user-select: all;
  }
  .g {
    display: inline-block;
  }
  .tick {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    font-size: var(--t-sm);
    color: var(--ink-2);
    cursor: pointer;
  }
</style>
