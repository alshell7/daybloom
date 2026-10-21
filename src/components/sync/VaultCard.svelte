<script lang="ts">
  // The master password, once any sync is encrypted: whether this device holds the key, and
  // the few things you can do with it. Both services share it, so this card stands above them.
  import Icon from '../../lib/Icon.svelte';
  import { d1Sync, githubSync } from '../../lib/sync/sync.svelte';
  import PasswordPrompt from './PasswordPrompt.svelte';
  import RecoveryKey from './RecoveryKey.svelte';

  type Step = 'idle' | 'unlock' | 'reset' | 'change' | 'change-next' | 'recovery' | 'show-key';
  let step = $state<Step>('idle');
  let current = '';
  let freshKey = $state('');
  let done = $state('');

  const d1On = $derived(d1Sync.configured && d1Sync.config.enabled);
  const sealedSomewhere = $derived(d1On || (githubSync.configured && githubSync.config.encrypted));
  const unlocked = $derived(githubSync.unlocked);
  // Either service reads the vault record; prefer the one that's always sealed.
  const svc = $derived(d1On ? d1Sync : githubSync);
  const visible = $derived(unlocked || sealedSomewhere);

  function finish(message: string) {
    step = 'idle';
    done = message;
    void (d1On ? d1Sync.syncNow() : null);
    if (githubSync.config.enabled && githubSync.config.encrypted) void githubSync.syncNow();
  }

  async function unlock(secret: string, how: 'password' | 'recovery') {
    await svc.unlock(secret, how);
    if (how === 'recovery') step = 'reset';
    else finish('Unlocked. Syncing again.');
  }
</script>

{#if visible}
  <div class="card vault" aria-labelledby="vault-heading">
    <div class="card-head">
      <span class="badge" class:open={unlocked}><Icon name={unlocked ? 'shield-check' : 'lock'} size={16} /></span>
      <div>
        <h4 id="vault-heading">Master password</h4>
        <p class="sub">{unlocked ? 'On · unlocked on this device' : 'Locked on this device'}</p>
      </div>
    </div>

    {#if step === 'idle'}
      {#if unlocked}
        <p class="hint">Your synced data is encrypted before it leaves this device. Only your master password, or your recovery key, can open it.</p>
        <div class="actions">
          <button class="btn btn-soft" onclick={() => ((step = 'change'), (done = ''))}>Change password</button>
          <button class="btn btn-quiet" onclick={() => ((step = 'recovery'), (done = ''))}>New recovery key</button>
          <button class="btn btn-quiet" onclick={() => githubSync.lockHere().then(() => (done = 'This device is locked. Sync waits until you enter the password.'))}>Lock this device</button>
        </div>
      {:else}
        <p class="hint">Enter your master password to keep syncing. Everything on this device is still here.</p>
        <div class="actions">
          <button class="btn btn-primary" onclick={() => ((step = 'unlock'), (done = ''))}><Icon name="lock-open" size={14} /> Unlock</button>
        </div>
      {/if}
      {#if done}<p class="ok" aria-live="polite"><Icon name="circle-check" size={14} /> {done}</p>{/if}
    {:else if step === 'unlock'}
      <PasswordPrompt mode="enter" submitLabel="Unlock" recovery onsubmit={unlock} oncancel={() => (step = 'idle')} />
    {:else if step === 'reset'}
      <PasswordPrompt
        mode="new"
        title="Choose a new master password"
        hint="Your recovery key opened the vault. Pick a new password for it now; your other devices will ask for it next time."
        submitLabel="Save new password"
        onsubmit={async (next) => {
          await svc.changePassword(next);
          finish('New password saved.');
        }}
      />
    {:else if step === 'change'}
      <PasswordPrompt
        mode="enter"
        title="Your current password"
        submitLabel="Next"
        onsubmit={async (pw) => {
          if (!(await svc.checkPassword(pw))) throw new Error('That isn’t the current password. Check caps lock and try again.');
          current = pw;
          step = 'change-next';
        }}
        oncancel={() => (step = 'idle')}
      />
    {:else if step === 'change-next'}
      <PasswordPrompt
        mode="new"
        title="Your new password"
        hint="Your recovery key keeps working. Other devices ask for the new password once."
        submitLabel="Change password"
        onsubmit={async (next) => {
          await svc.changePassword(next, current);
          current = '';
          finish('Password changed.');
        }}
        oncancel={() => ((current = ''), (step = 'idle'))}
      />
    {:else if step === 'recovery'}
      <PasswordPrompt
        mode="enter"
        title="Make a new recovery key"
        hint="The old key stops working. Enter your master password to go on."
        submitLabel="Make a new key"
        onsubmit={async (pw) => {
          freshKey = await svc.replaceRecovery(pw);
          step = 'show-key';
        }}
        oncancel={() => (step = 'idle')}
      />
    {:else if step === 'show-key'}
      <RecoveryKey code={freshKey} oncontinue={() => ((freshKey = ''), finish('New recovery key ready.'))} />
    {/if}
  </div>
{/if}
