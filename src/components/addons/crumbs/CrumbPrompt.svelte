<script lang="ts">
  // "Where did you leave off?" — a small card that rises at the foot of the rail when you step
  // away from a task. One line now saves a lot of "what was I doing?" later. Type it or say it;
  // Enter keeps it, Esc lets it go. Thoughts you parked during the session wait here too.
  import { tick } from 'svelte';
  import { backOut, cubicOut } from 'svelte/easing';
  import { fade, fly, scale, slide } from 'svelte/transition';
  import { crumbs } from '../../../lib/addons/crumbs/crumbs.svelte';
  import Icon from '../../../lib/Icon.svelte';
  import { shownTitle } from '../../../lib/privacy';
  import { sounds } from '../../../lib/sound';
  import { settings } from '../../../lib/stores/settings.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import { voice } from '../../../lib/voice/voice.svelte';
  import LiveWords from '../../voice/LiveWords.svelte';
  import MicButton from '../../voice/MicButton.svelte';

  const EXAMPLES = [
    'Halfway through part 2 · next: check the numbers',
    'Waiting on Sam’s reply · then send the draft',
    'Stuck on the intro · try writing the end first',
    'Done the outline · next: the first paragraph',
  ];

  const ask = $derived(crumbs.asking);
  const rm = $derived(view.reducedMotion);
  let text = $state('');
  let field: HTMLTextAreaElement | undefined = $state();
  let saved = $state(false);
  let ex = $state(0);
  const parked = $derived(ask ? crumbs.parkedSince(ask.parkedSince) : []);
  // Toasts rise above the card while it is up.
  let cardH = $state(0);
  $effect(() => {
    view.dockLift = ask && cardH ? cardH + 10 : 0;
    return () => (view.dockLift = 0);
  });

  // A fresh card each time: empty field, focus in it, a new example.
  let shownFor = '';
  $effect(() => {
    const key = ask ? `${ask.taskId}:${ask.parkedSince}:${ask.reason}` : '';
    if (key === shownFor) return;
    shownFor = key;
    if (!ask) return;
    text = '';
    saved = false;
    ex = (ex + 1) % EXAMPLES.length;
    void tick().then(() => field?.focus());
  });

  // Dictation into the field.
  const dictating = $derived(voice.surface === 'note' && (voice.phase === 'listening' || voice.phase === 'finishing'));
  let usedFinal = '';
  $effect(() => {
    if (voice.surface !== 'note' || voice.phase !== 'idle' || !voice.final || voice.final === usedFinal) return;
    usedFinal = voice.final;
    text = text ? `${text} ${voice.final}` : voice.final;
    field?.focus();
  });

  function save() {
    if (!ask) return;
    const c = crumbs.add(ask.taskId, text, ask.reason);
    if (!c) return close();
    if (settings.value.sound) sounds.tick();
    saved = true;
    setTimeout(close, rm ? 500 : 1300);
  }
  function close() {
    crumbs.dismiss();
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }
  function allToBacklog() {
    const n = crumbs.toBacklog(parked.map((p) => p.id));
    if (n) view.say(`${n === 1 ? 'Your parked thought is' : `${n} parked thoughts are`} in the backlog`);
  }
</script>

{#if ask}
  <div class="crumb" bind:clientHeight={cardH} style:--c={ask.color} role="dialog" aria-label="Where did you leave off?" in:fly={{ y: 18, duration: rm ? 0 : 380, easing: cubicOut }} out:fade={{ duration: rm ? 0 : 200 }}>
    {#if saved}
      <div class="saved" in:fade={{ duration: rm ? 0 : 180 }}>
        <span class="pin drop" in:scale={{ start: 0.3, duration: rm ? 0 : 520, easing: backOut }}><Icon name="pin" size={15} stroke={2.2} /></span>
        <p>Saved. It will be waiting for you on <b>{shownTitle(ask.title, 'focus')}</b>.</p>
      </div>
    {:else}
      <header>
        <span class="pin" in:scale={{ start: 0.4, duration: rm ? 0 : 480, delay: rm ? 0 : 120, easing: backOut }}><Icon name="pin" size={15} stroke={2.2} /></span>
        <div class="hd">
          <h3>Where did you leave off?</h3>
          <p><i class="dot"></i>{shownTitle(ask.title, 'focus')}</p>
        </div>
        <button class="icon-btn x" onclick={close} aria-label="Skip"><Icon name="x" size={15} /></button>
      </header>

      <div class="box" data-voice="note">
        <textarea
          bind:this={field}
          bind:value={text}
          class:hearing={dictating}
          rows="2"
          maxlength="500"
          placeholder={EXAMPLES[ex]}
          aria-label="Where you left off"
          onkeydown={key}
        ></textarea>
        {#if dictating}<span class="words"><LiveWords placeholder="Listening… say where you were" /></span>{/if}
        <span class="mic"><MicButton surface="note" size={28} label="Say it" /></span>
      </div>

      {#if parked.length}
        <div class="parked" transition:slide={{ duration: rm ? 0 : 200 }}>
          <p class="ph">You parked {parked.length === 1 ? 'a thought' : `${parked.length} thoughts`}</p>
          <ul>
            {#each parked as p (p.id)}
              <li out:slide={{ duration: rm ? 0 : 160 }}>
                <span>{p.text}</span>
                <button class="mini" onclick={() => crumbs.toBacklog([p.id])} title="Send to the backlog"><Icon name="inbox" size={13} /></button>
                <button class="mini" onclick={() => crumbs.letGo([p.id])} title="Let it go"><Icon name="x" size={13} /></button>
              </li>
            {/each}
          </ul>
          {#if parked.length > 1}<button class="link" onclick={allToBacklog}><Icon name="inbox" size={12} /> All to the backlog</button>{/if}
        </div>
      {/if}

      <div class="actions">
        <button class="btn btn-quiet" onclick={close}>Skip</button>
        <button class="btn btn-primary" onclick={save} disabled={!text.trim()}><kbd>⏎</kbd> Leave it</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .crumb {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 60;
    width: min(380px, calc(100vw - 32px));
    padding: 14px;
    border-radius: var(--r-lg);
    background: var(--raised);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-3);
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 10px;
  }
  .pin {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: 50%;
    color: #b07e06;
    background: color-mix(in srgb, #b07e06 16%, transparent);
  }
  :global([data-theme='dark']) .pin {
    color: #e2b44a;
    background: color-mix(in srgb, #e2b44a 16%, transparent);
  }
  .hd {
    flex: 1;
    min-width: 0;
  }
  h3 {
    margin: 2px 0 1px;
    font-size: var(--t-md);
    font-weight: 500;
  }
  .hd p {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--c);
  }
  .x {
    width: 28px;
    height: 28px;
    margin: -2px -4px 0 0;
  }
  .box {
    position: relative;
  }
  textarea {
    display: block;
    width: 100%;
    min-height: 64px;
    padding: 10px 42px 10px 12px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    font: inherit;
    font-family: var(--font-read);
    font-size: var(--t-sm);
    line-height: 1.45;
    color: var(--ink);
    resize: none;
    outline: none;
    transition:
      border-color var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }
  textarea:focus {
    border-color: color-mix(in srgb, #b07e06 60%, var(--line-strong));
    box-shadow: 0 0 0 3px color-mix(in srgb, #b07e06 16%, transparent);
  }
  textarea::placeholder {
    color: var(--ink-3);
  }
  textarea.hearing {
    color: transparent;
  }
  .words {
    position: absolute;
    left: 13px;
    right: 44px;
    top: 10px;
    height: 20px;
  }
  .mic {
    position: absolute;
    right: 7px;
    top: 7px;
  }
  .parked {
    margin-top: 10px;
    padding: 8px 10px;
    border-radius: var(--r-sm);
    background: var(--sunken);
  }
  .ph {
    margin: 0 0 4px;
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-3);
  }
  .parked ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .parked li {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 28px;
    font-size: var(--t-sm);
  }
  .parked li span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mini {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    color: var(--ink-3);
  }
  .mini:hover {
    background: var(--raised);
    color: var(--ink);
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 2px;
    padding: 2px 6px;
    margin-left: -6px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
  }
  .link:hover {
    background: var(--raised);
    color: var(--ink);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
  .actions .btn {
    height: 34px;
    gap: 6px;
  }
  .actions kbd {
    font-family: var(--font-ui);
    font-size: 11px;
    opacity: 0.7;
  }
  .saved {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
  }
  .saved p {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .saved b {
    font-weight: 500;
    color: var(--ink);
  }
</style>
