<script lang="ts">
  import { fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { celebrateBadges, suggest } from '../lib/actions';
  import { blockKey, blocksInRange, freeGaps } from '../lib/engine/blocks';
  import { categoryColor } from '../lib/engine/categories';
  import { describeRecurrence } from '../lib/engine/recurrence';
  import { addDays, atMinutes, formatDayShort, formatDuration, formatMinutes, MINUTE, minutesOfDay, startOfDayMs } from '../lib/engine/time';
  import Icon from '../lib/Icon.svelte';
  import { parseQuick } from '../lib/quickadd';
  import { sounds } from '../lib/sound';
  import { clock } from '../lib/stores/clock.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { taskFile, tasks } from '../lib/stores/tasks.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { voice } from '../lib/voice/voice.svelte';
  import LiveWords from './voice/LiveWords.svelte';
  import MicButton from './voice/MicButton.svelte';
  import { isOn } from '../lib/addons/registry';
  import { realityHint } from '../lib/addons/reality/reality.svelte';

  // Type a block the way you'd say it: "gym 5pm 45m", "meds every day 8am". Or say it: the
  // mic dictates into the field, the preview reads it live, and Enter adds it.
  let text = $state('');
  let focused = $state(false);
  let input: HTMLInputElement | undefined = $state();

  const EXAMPLES = ['gym 5pm 45m', 'meds every day 8am', 'call mom tomorrow 6pm', 'deep work 9–11:30am', 'standup weekdays 9:30 15m', 'return parcel later'];
  let ex = $state(0);
  $effect(() => {
    if (focused || text) return;
    const id = setInterval(() => (ex = (ex + 1) % EXAMPLES.length), 3800);
    return () => clearInterval(id);
  });

  // Dictation: live words flow into the field; the final text stays for a look before Enter.
  const dictating = $derived(voice.surface === 'quickadd' && (voice.phase === 'listening' || voice.phase === 'finishing'));
  let usedFinal = '';
  $effect(() => {
    if (dictating) text = voice.live;
  });
  $effect(() => {
    if (voice.surface !== 'quickadd' || voice.phase !== 'idle' || !voice.final || voice.final === usedFinal) return;
    usedFinal = voice.final;
    text = voice.final;
    input?.focus();
  });

  const parsed = $derived(text.trim() ? parseQuick(text, clock.now, Math.floor(minutesOfDay(clock.now))) : null);
  const hint = $derived(parsed && parsed.title ? suggest(parsed.title) : null);
  const icon = $derived(hint?.icon ?? 'plus');
  const color = $derived(categoryColor(hint?.category ?? 'focus', view.finish.dark));

  // Where it will land when no time was given: the next free gap of that length.
  const plan = $derived.by(() => {
    if (!parsed) return null;
    const duration = parsed.duration ?? 30;
    if (parsed.date === null) return { date: null, start: null, duration };
    const date = parsed.date;
    if (parsed.anytime) return { date, start: null, duration };
    if (parsed.start != null) return { date, start: parsed.start, duration };
    const from = date === view.today ? Math.ceil(clock.now / (5 * MINUTE)) * 5 * MINUTE : atMinutes(date, settings.value.wake);
    const end = startOfDayMs(addDays(date, 1));
    const busy = blocksInRange(taskFile.value.tasks, view.events, startOfDayMs(date), end);
    const gap = freeGaps(busy, from, end, duration * MINUTE).find((g) => g.endMs - g.startMs >= duration * MINUTE);
    return { date, start: Math.round(minutesOfDay(gap ? gap.startMs : from)), duration };
  });

  // Reality check addon: what blocks like this usually take.
  const usually = $derived(isOn('reality') && parsed?.title && plan ? realityHint({ title: parsed.title, category: hint?.category ?? 'focus', minutes: plan.duration }) : null);

  const when = $derived.by(() => {
    if (!plan) return '';
    if (plan.date === null) return 'Later';
    const day = plan.date === view.today ? 'Today' : plan.date === addDays(view.today, 1) ? 'Tomorrow' : (() => { const d = formatDayShort(plan.date!); return `${d.dow} ${d.day}`; })();
    if (plan.start == null) return `${day} · anytime`;
    return `${day} ${formatMinutes(plan.start, view.hour12)}`;
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!parsed || !plan) return;
    const title = parsed.title || 'Untitled block';
    const t = tasks.create({
      title,
      date: plan.date,
      start: plan.start,
      duration: plan.duration,
      recurrence: parsed.recurrence,
      icon: hint?.icon,
      category: hint?.category,
      alerts: [5],
      ...(parsed.alarm && plan.start != null ? { alarm: {} } : {}),
    });
    sounds.tick();
    const r = input?.getBoundingClientRect();
    if (r) view.spark(r.left + 24, r.top + r.height / 2, color, false, when);
    if (plan.date) {
      view.setDate(plan.date);
      view.selected = blockKey(t.id, plan.date);
    }
    text = '';
    celebrateBadges();
  }
</script>

<form
  class="quick"
  class:active={focused || !!text || dictating}
  class:hearing={dictating}
  onsubmit={submit}
  style:--c={color}
  style:--lvl={dictating ? voice.level : 0}
  data-voice="quickadd"
>
  <span class="lead">
    {#key icon}
      <span class="ico" in:scale={{ start: 0.4, duration: view.reducedMotion ? 0 : 320, easing: cubicOut }}>
        <Icon name={icon} size={16} stroke={2.1} />
      </span>
    {/key}
  </span>
  {#if dictating}
    <span class="words"><LiveWords placeholder="Listening… say the block" /></span>
  {/if}
  <input
    bind:this={input}
    bind:value={text}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    onkeydown={(e) => e.key === 'Escape' && ((text = ''), input?.blur())}
    aria-label="Quick add a block"
    autocomplete="off"
    spellcheck="false"
  />
  {#if !text && !dictating}
    {#key ex}
      <span class="ph" in:fly={{ y: 8, duration: view.reducedMotion ? 0 : 360, easing: cubicOut }} out:fly={{ y: -8, duration: view.reducedMotion ? 0 : 220 }} aria-hidden="true">
        {dictating ? 'Listening… say the block' : focused ? 'Type a block… then Enter' : `Try “${EXAMPLES[ex]}”`}
      </span>
    {/key}
  {/if}
  <MicButton surface="quickadd" size={28} label="Say a block" />
  {#if text && !dictating}
    <kbd class="enter" in:scale={{ start: 0.6, duration: 180 }}><Icon name="corner" size={12} /></kbd>
  {/if}
</form>

{#if parsed && plan}
  <div class="preview" in:fly={{ y: -6, duration: view.reducedMotion ? 0 : 220, easing: cubicOut }} style:--c={color}>
    <span class="chip strong"><i></i>{parsed.title || 'Untitled'}</span>
    <span class="chip">{when}</span>
    {#if plan.start != null}<span class="chip">{formatDuration(plan.duration * MINUTE)}</span>{/if}
    {#if parsed.recurrence}<span class="chip"><Icon name="repeat" size={11} /> {describeRecurrence(parsed.recurrence, plan.date)}</span>{/if}
    {#if usually}<span class="chip usually" title="Reality check: how long blocks like this usually take"><Icon name="hourglass" size={11} /> usually ~{formatDuration(usually.minutes * MINUTE)}</span>{/if}
  </div>
{/if}

<style>
  .quick {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    height: 42px;
    padding: 0 var(--s-2) 0 6px;
    border-radius: var(--r-md);
    background: var(--raised);
    border: 1px solid var(--line);
    transition:
      border-color var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }
  .quick.active {
    border-color: color-mix(in srgb, var(--c) 60%, var(--line));
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 14%, transparent);
  }
  /* Dictating: the words are drawn by LiveWords; the ring swells with your voice. */
  .quick.hearing input {
    color: transparent;
    caret-color: transparent;
  }
  .quick::after {
    content: '';
    position: absolute;
    inset: -5px;
    border-radius: calc(var(--r-md) + 5px);
    border: 2px solid color-mix(in srgb, var(--c) 45%, transparent);
    opacity: 0;
    pointer-events: none;
  }
  .quick.hearing::after {
    opacity: calc(0.15 + var(--lvl) * 0.85);
    transform: scale(calc(1 + var(--lvl) * 0.012));
  }
  .words {
    position: absolute;
    left: 44px;
    right: 44px;
    top: 0;
    bottom: 0;
  }
  .lead {
    display: grid;
    width: 30px;
    height: 30px;
    flex: none;
  }
  .ico {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--c) 18%, transparent);
    color: var(--c);
    transition: background var(--dur-3) var(--ease-out), color var(--dur-3) var(--ease-out);
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    background: transparent;
    outline: none;
    font-size: var(--t-sm);
  }
  .ph {
    position: absolute;
    left: 44px;
    right: 12px;
    top: 50%;
    margin-top: -0.7em;
    font-size: var(--t-sm);
    color: var(--ink-3);
    pointer-events: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .enter {
    display: grid;
    place-items: center;
    width: 24px;
    height: 22px;
    border-radius: 6px;
    border: 1px solid var(--line-strong);
    color: var(--ink-3);
  }
  .preview {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: var(--s-2) 0 0 2px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 9px;
    border-radius: var(--r-pill);
    background: var(--sunken);
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .chip.usually {
    color: var(--ink-2);
    background: color-mix(in srgb, #8670e6 12%, var(--sunken));
  }
  .chip.strong {
    color: var(--ink);
    font-weight: 500;
  }
  .chip i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }
</style>
