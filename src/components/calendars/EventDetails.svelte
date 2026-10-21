<script lang="ts">
  // A calendar event, in full: when, where, a big "Join" for its video meeting (Google Meet,
  // Zoom, Teams…), who's invited and how they answered, and the notes with working links.
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { accountLabel } from '../../lib/calendarBridge.svelte';
  import { initials, linkify, meetingOf, peopleLine, sortAttendees } from '../../lib/calendar/meeting';
  import { formatDuration, formatTime, MINUTE } from '../../lib/engine/time';
  import type { Attendee, Block } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { platform } from '../../lib/platform';
  import { clock } from '../../lib/stores/clock.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { skipEvent, toggleDone } from '../../lib/actions';

  let { block }: { block: Block } = $props();

  const ev = $derived(block.event!);
  const meet = $derived(meetingOf(ev));
  const people = $derived(sortAttendees(ev.attendees ?? []));
  const rm = $derived(view.reducedMotion);
  let allPeople = $state(false);
  let allNotes = $state(false);
  let copied = $state(false);

  const now = $derived(clock.now);
  const live = $derived(now >= block.startMs && now < block.endMs);
  const soon = $derived(!live && block.startMs > now && block.startMs - now <= 15 * MINUTE);
  const when = $derived(live ? `On now · ${formatDuration(block.endMs - now)} left` : soon ? `Starts in ${formatDuration(block.startMs - now)}` : block.endMs <= now ? 'Ended' : `In ${formatDuration(block.startMs - now)}`);
  const place = $derived(ev.location && !(meet && ev.location.includes(meet.url)) ? ev.location : '');
  const placeLink = $derived(/^https?:\/\//i.test(place) ? place : '');
  const notes = $derived(ev.description ?? '');
  const longNotes = $derived(notes.split('\n').length > 7 || notes.length > 420);

  const RSVP: Record<NonNullable<Attendee['status']>, { icon: string; label: string }> = {
    accepted: { icon: 'check', label: 'Coming' },
    tentative: { icon: 'circle-dashed', label: 'Maybe' },
    declined: { icon: 'x', label: 'Not coming' },
    needsAction: { icon: 'clock', label: 'No answer yet' },
  };
  /** A calm, stable colour per person. */
  const hue = (a: Attendee) => [...(a.email ?? a.name ?? '?')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

  async function copy() {
    if (!meet) return;
    try {
      await navigator.clipboard.writeText(meet.url);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard not available */
    }
  }
</script>

<div class="ed" style:--c={block.color}>
  <p class="title">{block.title}</p>
  <p class="when tnum">
    {formatTime(block.startMs, view.hour12)} – {formatTime(block.endMs, view.hour12)} · {formatDuration(block.endMs - block.startMs)}
    <span class="state" class:live class:soon>{when}</span>
  </p>
  <p class="cal"><i></i>{ev.calendarName ?? accountLabel(ev.accountId)}</p>

  <!-- What you did with it: kept here, the calendar itself stays as it is. -->
  <div class="mine">
    <button class="btn" class:btn-primary={!block.done} class:btn-soft={block.done} onclick={(e) => { const r = e.currentTarget.getBoundingClientRect(); toggleDone(block.key, { x: r.left + r.width / 2, y: r.top + r.height / 2 }); }} disabled={block.skipped}>
      <Icon name={block.done ? 'undo' : 'check'} size={14} stroke={2.3} /> {block.done ? 'Not done' : 'Done'}
    </button>
    <button class="btn btn-quiet" onclick={() => skipEvent(block.key)}>
      <Icon name={block.skipped ? 'undo' : 'skip'} size={14} /> {block.skipped ? 'Bring it back' : 'Skip it'}
    </button>
    <span class="mine-hint">{block.skipped ? 'Skipped · its time is free for plans' : block.done ? 'Done · it counts in your week' : 'Only in Daybloom; your calendar stays as it is'}</span>
  </div>

  {#if meet}
    <div class="join" in:fly={{ y: 6, duration: rm ? 0 : 260, easing: cubicOut }}>
      <button class="btn btn-primary jb" class:hot={live || soon} onclick={() => platform.openExternal(meet.url)}>
        <Icon name="video" size={16} stroke={2.2} /> Join {meet.label}
      </button>
      <button class="icon-btn" onclick={copy} title="Copy the link" aria-label="Copy the meeting link"><Icon name={copied ? 'check' : 'copy'} size={15} /></button>
    </div>
  {/if}

  {#if place}
    <p class="row">
      <Icon name="pin" size={14} />
      {#if placeLink}<button class="link" onclick={() => platform.openExternal(placeLink)}>{placeLink.replace(/^https?:\/\//, '')}</button>{:else}<span>{place}</span>{/if}
    </p>
  {/if}

  {#if people.length}
    <section>
      <h4>People <span>{peopleLine(people)}</span></h4>
      <ul class="people">
        {#each allPeople ? people : people.slice(0, 6) as a, i (a.email ?? a.name ?? i)}
          <li class:no={a.status === 'declined'} in:fly={{ y: 4, duration: rm ? 0 : 220, delay: rm ? 0 : Math.min(i, 8) * 30 }}>
            <span class="av" style:--h={hue(a)}>{initials(a)}</span>
            <span class="who">
              <b>{a.name ?? a.email}{#if a.self}<em> (you)</em>{/if}</b>
              {#if a.name && a.email}<small>{a.email}</small>{/if}
            </span>
            {#if a.organizer}<span class="tag">Organiser</span>{/if}
            <span class="rs" data-s={a.status} title={RSVP[a.status ?? 'needsAction'].label}><Icon name={RSVP[a.status ?? 'needsAction'].icon} size={12} stroke={2.4} /></span>
          </li>
        {/each}
      </ul>
      {#if people.length > 6}
        <button class="more" onclick={() => (allPeople = !allPeople)}>{allPeople ? 'Show fewer' : `Show all ${people.length}`}</button>
      {/if}
    </section>
  {/if}

  {#if notes}
    <section>
      <h4>Notes</h4>
      <p class="notes" class:clip={longNotes && !allNotes}>
        {#each linkify(notes) as part, i (i)}{#if part.href}<button class="link" onclick={() => platform.openExternal(part.href!)}>{part.text}</button>{:else}{part.text}{/if}{/each}
      </p>
      {#if longNotes}
        <button class="more" onclick={() => (allNotes = !allNotes)}>{allNotes ? 'Show less' : 'Show more'}</button>
      {/if}
    </section>
  {/if}

  <div class="foot">
    {#if ev.htmlLink}
      <button class="more" onclick={() => platform.openExternal(ev.htmlLink!)}>
        <Icon name="external" size={13} /> {ev.provider === 'google' ? 'Open in Google Calendar' : 'Open the event page'}
      </button>
    {/if}
    <p class="hint">Calendar events are read-only here. Change them in their calendar.</p>
  </div>
</div>

<style>
  .mine {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .mine-hint {
    flex-basis: 100%;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .ed {
    display: grid;
    gap: var(--s-3);
  }
  .title {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 500;
    line-height: 1.3;
  }
  .when {
    margin: -6px 0 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .state {
    padding: 1px 8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    background: var(--sunken);
    color: var(--ink-2);
  }
  .state.live {
    color: var(--ink);
    background: color-mix(in srgb, var(--signal) 18%, transparent);
  }
  .state.soon {
    color: var(--ink);
    background: color-mix(in srgb, var(--warm) 20%, transparent);
  }
  .cal {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: -4px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .cal i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }
  .join {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .jb {
    flex: 1;
    height: 42px;
    gap: 8px;
    font-size: var(--t-sm);
  }
  .jb.hot {
    background: color-mix(in srgb, var(--lume) 82%, var(--ink));
    color: var(--ink-inverse);
    box-shadow: 0 6px 18px -8px var(--lume);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
  .row :global(svg) {
    flex: none;
    color: var(--ink-3);
  }
  section {
    padding-top: var(--s-3);
    border-top: 1px solid var(--line);
  }
  h4 {
    margin: 0 0 8px;
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
  }
  h4 span {
    font-weight: 400;
    color: var(--ink-3);
    font-size: var(--t-xs);
    margin-left: 6px;
  }
  .people {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .people li {
    display: grid;
    grid-template-columns: 28px 1fr auto auto;
    align-items: center;
    gap: 8px;
    min-height: 34px;
  }
  .people li.no {
    opacity: 0.55;
  }
  .av {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 500;
    color: hsl(var(--h) 45% 28%);
    background: hsl(var(--h) 60% 88%);
  }
  :global([data-theme='dark']) .av {
    color: hsl(var(--h) 60% 86%);
    background: hsl(var(--h) 30% 26%);
  }
  .who {
    display: grid;
    min-width: 0;
  }
  .who b {
    font-weight: 400;
    font-size: var(--t-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .who em {
    font-style: normal;
    color: var(--ink-3);
  }
  .who small {
    font-size: var(--t-xs);
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    padding: 1px 7px;
    border-radius: var(--r-pill);
    font-size: 10.5px;
    color: var(--ink-2);
    background: var(--sunken);
  }
  .rs {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    color: var(--ink-3);
    background: var(--sunken);
  }
  .rs[data-s='accepted'] {
    color: var(--ink-inverse);
    background: var(--lume);
  }
  .rs[data-s='tentative'] {
    color: var(--ink);
    background: color-mix(in srgb, var(--warm) 30%, transparent);
  }
  .notes {
    margin: 0;
    font-family: var(--font-read);
    font-size: var(--t-sm);
    line-height: 1.55;
    color: var(--ink-2);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .notes.clip {
    display: -webkit-box;
    -webkit-line-clamp: 7;
    line-clamp: 7;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .link {
    padding: 0;
    font: inherit;
    color: var(--focus-ring);
    text-decoration: underline;
    text-underline-offset: 2px;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .more {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    padding: 4px 8px;
    margin-left: -8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
  }
  .more:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .foot {
    display: grid;
    gap: 4px;
    padding-top: var(--s-3);
    border-top: 1px solid var(--line);
  }
  .hint {
    margin: 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
</style>
