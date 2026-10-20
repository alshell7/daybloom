<script lang="ts">
  // Waqt: a window onto the sky of your day. The gradient follows where the sun is (night, dawn,
  // day, golden afternoon, dusk); the sun glides along the day's arc past each prayer; the next
  // prayer and its jamaat are a glance away. Below: today's prayers to mark, the week as pearls,
  // and the settings, folded away.
  import { tick } from 'svelte';
  import { backOut, cubicOut } from 'svelte/easing';
  import { fade, fly, scale, slide } from 'svelte/transition';
  import { countryName, guessPlace, searchPlaces, suggestedFor, type Place } from '../../../lib/addons/waqt/places';
  import { compass, parseHHMM, qibla, type PrayerSlot } from '../../../lib/addons/waqt/times';
  import { METHODS, PRAYERS, PRAYER_ICON, PRAYER_NAME, type JamaatRule, type PrayerId } from '../../../lib/addons/waqt/types';
  import { sunProgress, waqt, waqtFile } from '../../../lib/addons/waqt/waqt.svelte';
  import { addDays, formatDuration, formatTime, isoOf, MINUTE } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import { sounds } from '../../../lib/sound';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { settings } from '../../../lib/stores/settings.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import Panel from '../../Panel.svelte';
  import Segmented from '../../Segmented.svelte';

  const open = $derived(view.sheet?.kind === 'waqt');
  const rm = $derived(view.reducedMotion);
  const s = $derived(waqtFile.value.settings);
  const today = $derived(isoOf(clock.minute));
  const day = $derived(waqt.ready ? waqt.day(today) : null);
  const now = $derived(clock.now);
  const cur = $derived(waqt.ready ? waqt.current(now) : null);
  const next = $derived(waqt.ready ? waqt.next(now) : null);
  const hij = $derived(waqt.hijri(clock.minute));
  const ramadan = $derived(hij?.month === 9);
  const marks = $derived(waqt.marks(today));
  const dur = (ms: number) => formatDuration(Math.max(MINUTE, Math.round(ms / MINUTE) * MINUTE));
  const hm = (ms: number) => formatTime(ms, view.hour12);

  // ---- the sky
  type Phase = 'night' | 'dawn' | 'day' | 'golden' | 'dusk';
  const phase = $derived.by((): Phase => {
    if (!day) return 'day';
    const [fajr, , asr, maghrib, isha] = day.prayers;
    if (now < fajr.at || now >= isha.at) return 'night';
    if (now < day.sunrise) return 'dawn';
    if (now < asr.at) return 'day';
    if (now < maghrib.at) return 'golden';
    return 'dusk';
  });
  const sun = $derived(sunProgress(day, now));
  // The day arc: a half ellipse from the left horizon (sunrise) to the right (Maghrib).
  const W = 320;
  const H = 120;
  const arcPt = (t: number): [number, number] => [20 + t * (W - 40), H - 14 - Math.sin(Math.PI * t) * (H - 34)];
  const along = (ms: number) => {
    if (!day) return 0;
    const set = day.prayers[3].at;
    return (ms - day.sunrise) / (set - day.sunrise);
  };
  const arcD = Array.from({ length: 41 }, (_, i) => arcPt(i / 40))
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const STARS = Array.from({ length: 22 }, (_, i) => ({ x: (i * 73) % 100, y: (i * 37) % 62, r: i % 3 ? 1 : 1.6, d: (i % 7) * 90 }));

  // ---- the headline
  const lead = $derived.by(() => {
    if (cur) {
      const left = cur.end - now;
      return { name: cur.name, line: `now · ${dur(left)} left`, sub: cur.jamaat && cur.jamaat > now ? `Jamaat at ${hm(cur.jamaat)} · in ${dur(cur.jamaat - now)}` : `until ${hm(cur.end)}` };
    }
    if (next) return { name: next.name, line: `in ${dur(next.at - now)}`, sub: `Adhan at ${hm(next.at)}${next.jamaat ? ` · jamaat ${hm(next.jamaat)}` : ''}` };
    return { name: 'Waqt', line: '', sub: '' };
  });

  // ---- marking
  function mark(p: PrayerSlot) {
    const v = waqt.cycle(today, p.id);
    if (v && settings.value.sound) sounds.tick();
  }
  const week = $derived(Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)));
  const wd = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' });

  // ---- place
  let q = $state('');
  let locating = $state(false);
  let locError = $state('');
  let coordsOpen = $state(false);
  let lat = $state('');
  let lng = $state('');
  const found = $derived(searchPlaces(q));
  const guess = $derived(guessPlace(clock.zone || Intl.DateTimeFormat().resolvedOptions().timeZone));
  function choose(p: { name: string; country: string; lat: number; lng: number }, keepMethod = false) {
    waqtFile.value.settings.place = { name: p.name, country: p.country, lat: p.lat, lng: p.lng };
    if (!keepMethod) {
      const m = suggestedFor(p.country);
      waqtFile.value.settings.method = m.method;
      waqtFile.value.settings.madhab = m.madhab;
    }
    q = '';
    changing = false;
    if (settings.value.sound) sounds.done();
  }
  function locate() {
    locError = '';
    if (!('geolocation' in navigator)) {
      locError = 'This computer didn’t share a location. Pick a city instead.';
      return;
    }
    locating = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating = false;
        const { latitude, longitude } = pos.coords;
        choose({ name: 'My location', country: guess?.country ?? '', lat: +latitude.toFixed(4), lng: +longitude.toFixed(4) });
      },
      () => {
        locating = false;
        locError = 'This computer didn’t share a location. Pick a city instead.';
      },
      { timeout: 9000, maximumAge: 3_600_000 },
    );
  }
  function useCoords() {
    const a = Number(lat.replace(',', '.'));
    const b = Number(lng.replace(',', '.'));
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) {
      locError = 'Latitude goes from −90 to 90, longitude from −180 to 180.';
      return;
    }
    choose({ name: `${a.toFixed(2)}, ${b.toFixed(2)}`, country: guess?.country ?? '', lat: a, lng: b });
  }
  let changing = $state(false);
  let searchBox: HTMLInputElement | undefined = $state();
  async function change() {
    changing = true;
    await tick();
    searchBox?.focus();
  }

  // ---- settings sections
  let openSec = $state<string>('');
  const toggle = (k: string) => (openSec = openSec === k ? '' : k);
  const qib = $derived(s.place ? qibla(s.place.lat, s.place.lng) : 0);
  function setRule(id: PrayerId, r: Partial<JamaatRule>) {
    waqtFile.value.settings.jamaat.rules[id] = { ...s.jamaat.rules[id], ...r };
  }
  function setManual(id: PrayerId, v: string) {
    const m = { ...s.manual };
    if (parseHHMM(v) != null) m[id] = v;
    else delete m[id];
    waqtFile.value.settings.manual = m;
  }
</script>

{#if open}
  <Panel title="Waqt" onclose={() => (view.sheet = null)} accent="#25976A" wide>
    <div class="wq">
      {#if !waqt.ready || changing}
        <section class="where" in:fade={{ duration: rm ? 0 : 240 }}>
          <svg class="crescent" viewBox="0 0 64 64" aria-hidden="true">
            <path class="moon" d="M40 10a22 22 0 1 0 14 38A18 18 0 1 1 40 10z" />
            <path class="star" d="M48 18l1.8 4 4.2.4-3.2 2.8 1 4.2-3.8-2.3-3.8 2.3 1-4.2-3.2-2.8 4.2-.4z" />
          </svg>
          <h3>{waqt.ready ? 'Change your place' : 'Where do you pray?'}</h3>
          <p class="lead">Waqt works out the salah times for your place, on this computer. Your place goes only to your own GitHub repo, and only when sync is on.</p>
          <input bind:this={searchBox} class="field search" bind:value={q} placeholder="Search a city" aria-label="Search a city" />
          {#if found.length}
            <ul class="found" transition:slide={{ duration: rm ? 0 : 160 }}>
              {#each found as p (p.name + p.country)}
                <li><button onclick={() => choose(p)}><Icon name="pin" size={13} /> {p.name}<small>{countryName(p.country)}</small></button></li>
              {/each}
            </ul>
          {:else if guess && !q}
            <button class="guess" onclick={() => choose(guess as Place)}><Icon name="pin" size={13} /> {guess.name}, {countryName(guess.country)}?</button>
          {/if}
          <div class="alt">
            <button class="btn btn-soft" onclick={locate} disabled={locating}><Icon name="globe" size={14} /> {locating ? 'Finding you…' : 'Use my location'}</button>
            <button class="btn btn-quiet" onclick={() => (coordsOpen = !coordsOpen)}>Enter coordinates</button>
            {#if waqt.ready}<button class="btn btn-quiet" onclick={() => (changing = false)}>Cancel</button>{/if}
          </div>
          {#if coordsOpen}
            <div class="coords" transition:slide={{ duration: rm ? 0 : 160 }}>
              <input class="field" bind:value={lat} placeholder="Latitude, e.g. 17.385" aria-label="Latitude" inputmode="decimal" />
              <input class="field" bind:value={lng} placeholder="Longitude, e.g. 78.487" aria-label="Longitude" inputmode="decimal" />
              <button class="btn btn-primary" onclick={useCoords}>Use</button>
            </div>
          {/if}
          {#if locError}<p class="err">{locError}</p>{/if}
        </section>
      {:else if day}
        <!-- the sky -->
        <section class="sky {phase}" aria-label="Salah now">
          {#key phase}<div class="wash" in:fade={{ duration: rm ? 0 : 900 }}></div>{/key}
          {#if phase === 'night' || phase === 'dusk' || phase === 'dawn'}
            <div class="stars" aria-hidden="true">
              {#each STARS as st, i (i)}<i style:left={`${st.x}%`} style:top={`${st.y}%`} style:--r={`${st.r}px`} style:--d={`${st.d}ms`}></i>{/each}
            </div>
          {/if}
          <div class="top">
            <button class="place" onclick={change} title="Change your place"><Icon name="pin" size={12} /> {s.place?.name}</button>
            {#if hij}<span class="hijri tnum">{hij.day} {hij.name} {hij.year}</span>{/if}
          </div>
          <div class="now">
            {#key lead.name}<h3 in:fly={{ y: 8, duration: rm ? 0 : 420, easing: cubicOut }}>{lead.name}</h3>{/key}
            <p class="when tnum">{lead.line}</p>
            <p class="sub tnum">{lead.sub}</p>
          </div>
          <svg class="arc" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            <path d={arcD} class="path" />
            <line x1="8" y1={H - 14} x2={W - 8} y2={H - 14} class="horizon" />
            {#each day.prayers.filter((p) => p.id === 'dhuhr' || p.id === 'asr') as p (p.id)}
              {@const pt = arcPt(Math.min(1, Math.max(0, along(p.at))))}
              <circle cx={pt[0]} cy={pt[1]} r="3.5" class="pt" class:lit={cur?.id === p.id} />
              {#if sun == null || Math.abs(along(p.at) - sun) > 0.09}
                <text x={pt[0]} y={pt[1] + 16} class="lbl" text-anchor="middle">{p.name}</text>
              {/if}
            {/each}
            <text x="20" y={H - 2} class="lbl" text-anchor="start">Fajr {hm(day.prayers[0].at)}</text>
            <text x={W - 20} y={H - 2} class="lbl" text-anchor="end">Maghrib {hm(day.prayers[3].at)}</text>
            {#if sun != null}
              {@const pt = arcPt(sun)}
              <g class="sun" style:transform={`translate(${pt[0]}px, ${pt[1]}px)`}>
                <circle r="13" class="glow" />
                <circle r="6.5" class="disc" />
              </g>
            {/if}
          </svg>
          {#if ramadan}
            <div class="ramadan" in:fly={{ y: 6, duration: rm ? 0 : 300 }}>
              <span><Icon name="moon" size={12} /> Ramadan</span>
              <span class="tnum">Suhoor ends {hm(day.prayers[0].at)}</span>
              <span class="tnum">Iftar {hm(day.prayers[3].at)}{day.prayers[3].at > now ? ` · in ${dur(day.prayers[3].at - now)}` : ''}</span>
            </div>
          {/if}
        </section>

        <!-- today -->
        <section class="today">
          <ul>
            {#each day.prayers as p, i (p.id)}
              {@const m = marks[p.id]}
              {@const past = p.end < now}
              <li class:cur={cur?.id === p.id} class:past in:fly={{ y: 6, duration: rm ? 0 : 280, delay: rm ? 0 : i * 45, easing: cubicOut }}>
                <span class="ic"><Icon name={PRAYER_ICON[p.id]} size={15} stroke={2} /></span>
                <span class="nm">{p.name}{#if cur?.id === p.id}<em>now</em>{/if}</span>
                <span class="tm tnum">{hm(p.at)}</span>
                <span class="jm tnum">{p.jamaat ? `jamaat ${hm(p.jamaat)}` : ''}</span>
                <button
                  class="pearl"
                  class:prayed={m === 'prayed'}
                  class:jamaat={m === 'jamaat'}
                  onclick={() => mark(p)}
                  aria-label={`${p.name}: ${m === 'jamaat' ? 'prayed in jamaat' : m === 'prayed' ? 'prayed' : 'not marked'}. Change`}
                  title={m === 'jamaat' ? 'Prayed in jamaat · tap to clear' : m === 'prayed' ? 'Prayed · tap again for jamaat' : 'Mark as prayed'}
                >
                  {#key m}
                    {#if m}<span class="fill" in:scale={{ start: 0.2, duration: rm ? 0 : 420, easing: backOut }}></span>{/if}
                  {/key}
                  {#if m === 'jamaat'}<span class="ring" aria-hidden="true"></span>{/if}
                </button>
              </li>
              {#if p.id === 'fajr'}
                <li class="sunrise" class:past={day.sunrise < now}>
                  <span class="ic"><Icon name="sun" size={14} stroke={1.8} /></span>
                  <span class="nm">Sunrise</span>
                  <span class="tm tnum">{hm(day.sunrise)}</span>
                  <span class="jm"></span>
                  <span class="pearl-space"></span>
                </li>
              {/if}
            {/each}
          </ul>
          <div class="week" role="img" aria-label="This week’s marked prayers">
            {#each week as d (d)}
              {@const mk = waqt.marks(d)}
              <div class="col" class:today={d === today}>
                {#each PRAYERS as id (id)}<i class:prayed={mk[id] === 'prayed'} class:jamaat={mk[id] === 'jamaat'}></i>{/each}
                <span>{wd(d)}</span>
              </div>
            {/each}
          </div>
        </section>

        <!-- settings, folded -->
        <section class="settings">
          <button class="sec" onclick={() => toggle('place')} aria-expanded={openSec === 'place'}>
            <Icon name="globe" size={15} /> <span>Place and method</span><small>{s.place?.name} · {METHODS.find((m) => m.id === s.method)?.label}</small><i class="chev" class:up={openSec === 'place'}><Icon name="chevron-down" size={14} /></i>
          </button>
          {#if openSec === 'place'}
            <div class="body" transition:slide={{ duration: rm ? 0 : 220, easing: cubicOut }}>
              <div class="row"><span>Place</span><button class="btn btn-soft sm" onclick={change}><Icon name="pin" size={13} /> {s.place?.name}{s.place?.country ? `, ${countryName(s.place.country)}` : ''}</button></div>
              <label class="row"><span>Method</span>
                <select class="field" bind:value={waqtFile.value.settings.method}>{#each METHODS as m (m.id)}<option value={m.id}>{m.label}</option>{/each}</select>
              </label>
              <div class="row"><span>Asr</span>
                <Segmented label="Asr" value={s.madhab} options={[{ value: 'shafi', label: 'Standard' }, { value: 'hanafi', label: 'Hanafi' }]} onchange={(v) => (waqtFile.value.settings.madhab = v)} />
              </div>
              {#if s.place && Math.abs(s.place.lat) > 45}
                <label class="row"><span>Far north or south</span>
                  <select class="field" bind:value={waqtFile.value.settings.highLat}>
                    <option value="auto">Recommended</option><option value="middle">Middle of the night</option><option value="seventh">One seventh of the night</option><option value="angle">Twilight angle</option>
                  </select>
                </label>
              {/if}
              <div class="qibla">
                <svg viewBox="0 0 64 64" aria-hidden="true">
                  <circle cx="32" cy="32" r="28" class="dial" />
                  <text x="32" y="12" class="n">N</text>
                  <g style:transform={`rotate(${qib}deg)`} class="needle"><path d="M32 10 37 32 32 29 27 32z" /><circle cx="32" cy="32" r="3" /></g>
                </svg>
                <p><b class="tnum">Qibla {Math.round(qib)}°</b> {compass(qib)} from true north</p>
              </div>
            </div>
          {/if}

          <button class="sec" onclick={() => toggle('mosque')} aria-expanded={openSec === 'mosque'}>
            <Icon name="clock" size={15} /> <span>Your mosque’s times</span><small>{Object.keys(s.manual).length ? `${Object.keys(s.manual).length} fixed` : 'calculated'}</small><i class="chev" class:up={openSec === 'mosque'}><Icon name="chevron-down" size={14} /></i>
          </button>
          {#if openSec === 'mosque'}
            <div class="body" transition:slide={{ duration: rm ? 0 : 220, easing: cubicOut }}>
              <p class="hint">Nudge a calculated time by a few minutes, or type your mosque’s time to use it every day.</p>
              {#each day.prayers as p (p.id)}
                <div class="adj">
                  <span class="an">{PRAYER_NAME[p.id]}</span>
                  <span class="stepper">
                    <button class="icon-btn" onclick={() => (waqtFile.value.settings.adjust[p.id] = s.adjust[p.id] - 1)} disabled={!!s.manual[p.id]} aria-label="One minute earlier">−</button>
                    <span class="tnum">{hm(p.at)}{#if s.adjust[p.id] && !s.manual[p.id]}<small> {s.adjust[p.id] > 0 ? '+' : ''}{s.adjust[p.id]}m</small>{/if}</span>
                    <button class="icon-btn" onclick={() => (waqtFile.value.settings.adjust[p.id] = s.adjust[p.id] + 1)} disabled={!!s.manual[p.id]} aria-label="One minute later">+</button>
                  </span>
                  <input class="field fixed tnum" type="time" value={s.manual[p.id] ?? ''} onchange={(e) => setManual(p.id, e.currentTarget.value)} aria-label={`${PRAYER_NAME[p.id]} fixed time`} title="Your mosque’s time (clear it to go back to the calculated one)" />
                </div>
              {/each}
            </div>
          {/if}

          <button class="sec" onclick={() => toggle('jamaat')} aria-expanded={openSec === 'jamaat'}>
            <Icon name="users" size={15} /> <span>Jamaat and Jumu’ah</span><small>{s.jamaat.on ? 'on' : 'off'}{s.jamaat.jumuah.on ? ' · Jumu’ah' : ''}</small><i class="chev" class:up={openSec === 'jamaat'}><Icon name="chevron-down" size={14} /></i>
          </button>
          {#if openSec === 'jamaat'}
            <div class="body" transition:slide={{ duration: rm ? 0 : 220, easing: cubicOut }}>
              <label class="row"><span>I pray in jamaat at the mosque</span><input type="checkbox" class="switch" bind:checked={waqtFile.value.settings.jamaat.on} /></label>
              {#if s.jamaat.on}
                {#each PRAYERS as id (id)}
                  {@const r = s.jamaat.rules[id]}
                  <div class="jrow" transition:slide={{ duration: rm ? 0 : 160 }}>
                    <span class="an">{PRAYER_NAME[id]}</span>
                    <select class="field" value={r.mode} onchange={(e) => setRule(id, { mode: e.currentTarget.value as JamaatRule['mode'] })} aria-label={`${PRAYER_NAME[id]} jamaat`}>
                      <option value="off">No jamaat</option><option value="after">After the adhan</option><option value="at">At a set time</option>
                    </select>
                    {#if r.mode === 'after'}
                      <span class="mins"><input class="field tnum" type="number" min="0" max="180" value={r.after} onchange={(e) => setRule(id, { after: Math.max(0, +e.currentTarget.value || 0) })} aria-label="Minutes after the adhan" /> min</span>
                    {:else if r.mode === 'at'}
                      <input class="field tnum" type="time" value={r.at} onchange={(e) => setRule(id, { at: e.currentTarget.value })} aria-label="Jamaat time" />
                    {/if}
                  </div>
                {/each}
              {/if}
              <label class="row"><span>Jumu’ah on Fridays</span><input type="checkbox" class="switch" bind:checked={waqtFile.value.settings.jamaat.jumuah.on} /></label>
              {#if s.jamaat.jumuah.on}
                <div class="jrow" transition:slide={{ duration: rm ? 0 : 160 }}>
                  <span class="an">Jumu’ah</span>
                  <input class="field tnum" type="time" bind:value={waqtFile.value.settings.jamaat.jumuah.at} aria-label="Jumu’ah time" />
                  <span class="mins"><input class="field tnum" type="number" min="10" max="120" bind:value={waqtFile.value.settings.jamaat.jumuah.minutes} aria-label="Jumu’ah length" /> min</span>
                </div>
              {/if}
            </div>
          {/if}

          <button class="sec" onclick={() => toggle('remind')} aria-expanded={openSec === 'remind'}>
            <Icon name="bell" size={15} /> <span>Reminders</span><small>{s.remind.before ? `${s.remind.before}m before` : 'at adhan'}{s.remind.sound ? ' · sound' : ''}</small><i class="chev" class:up={openSec === 'remind'}><Icon name="chevron-down" size={14} /></i>
          </button>
          {#if openSec === 'remind'}
            <div class="body" transition:slide={{ duration: rm ? 0 : 220, easing: cubicOut }}>
              <div class="row"><span>Before the adhan</span>
                <Segmented label="Before the adhan" value={String(s.remind.before)} options={[{ value: '0', label: 'Off' }, { value: '5', label: '5m' }, { value: '10', label: '10m' }, { value: '15', label: '15m' }, { value: '30', label: '30m' }]} onchange={(v) => (waqtFile.value.settings.remind.before = +v)} />
              </div>
              <label class="row"><span>At the adhan</span><input type="checkbox" class="switch" bind:checked={waqtFile.value.settings.remind.atAdhan} /></label>
              {#if s.jamaat.on || s.jamaat.jumuah.on}
                <div class="row"><span>Before jamaat</span>
                  <Segmented label="Before jamaat" value={String(s.remind.beforeJamaat)} options={[{ value: '0', label: 'Off' }, { value: '5', label: '5m' }, { value: '10', label: '10m' }, { value: '15', label: '15m' }, { value: '20', label: '20m' }]} onchange={(v) => (waqtFile.value.settings.remind.beforeJamaat = +v)} />
                </div>
              {/if}
              <label class="row"><span>A gentle sound at the adhan</span><input type="checkbox" class="switch" bind:checked={waqtFile.value.settings.remind.sound} /></label>
              <button class="link" onclick={() => sounds.adhan()}><Icon name="volume" size={13} /> Hear it</button>
            </div>
          {/if}

          <button class="sec" onclick={() => toggle('dial')} aria-expanded={openSec === 'dial'}>
            <Icon name="dial" size={15} /> <span>On the dial and in your day</span><small>{s.dial.blocks ? `${s.dial.minutes}m kept free` : 'times only'}</small><i class="chev" class:up={openSec === 'dial'}><Icon name="chevron-down" size={14} /></i>
          </button>
          {#if openSec === 'dial'}
            <div class="body" transition:slide={{ duration: rm ? 0 : 220, easing: cubicOut }}>
              <label class="row"><span>Show the salah times on the dial</span><input type="checkbox" class="switch" bind:checked={waqtFile.value.settings.dial.track} /></label>
              <label class="row"><span>Keep time free for each salah</span><input type="checkbox" class="switch" bind:checked={waqtFile.value.settings.dial.blocks} /></label>
              {#if s.dial.blocks}
                <div class="row"><span>Time to keep</span>
                  <Segmented label="Time to keep" value={String(s.dial.minutes)} options={[{ value: '10', label: '10m' }, { value: '15', label: '15m' }, { value: '20', label: '20m' }, { value: '30', label: '30m' }]} onchange={(v) => (waqtFile.value.settings.dial.minutes = +v)} />
                </div>
                <p class="hint">The time is kept at jamaat if you pray in jamaat, else at the adhan. Your plans and free-time suggestions make room for it.</p>
              {/if}
            </div>
          {/if}
        </section>
      {/if}
    </div>
  </Panel>
{/if}

<style>
  .wq {
    --green: #25976a;
  }
  :global([data-theme='dark']) .wq {
    --green: #4fd39a;
  }
  section {
    padding-bottom: var(--s-4);
  }

  /* ---- first run */
  .where {
    display: grid;
    gap: var(--s-3);
    justify-items: start;
  }
  .crescent {
    width: 56px;
    height: 56px;
  }
  .crescent .moon {
    fill: color-mix(in srgb, var(--green) 22%, transparent);
    stroke: var(--green);
    stroke-width: 2;
    stroke-dasharray: 160;
    animation: draw 1.4s var(--ease-out) both;
  }
  .crescent .star {
    fill: var(--green);
    transform-origin: 48px 24px;
    animation: twinkle 900ms var(--ease-settle) 900ms both;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 160;
      fill-opacity: 0;
    }
  }
  @keyframes twinkle {
    from {
      transform: scale(0) rotate(-40deg);
      opacity: 0;
    }
  }
  h3 {
    margin: 0;
    font-size: var(--t-lg);
    font-weight: 500;
  }
  .lead {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.5;
    color: var(--ink-3);
  }
  .search {
    width: 100%;
  }
  .found {
    list-style: none;
    margin: 0;
    padding: 4px;
    width: 100%;
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .found button,
  .guess {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border-radius: var(--r-sm);
    font-size: var(--t-sm);
    text-align: left;
  }
  .found button:hover,
  .guess:hover {
    background: var(--sunken);
  }
  .found small {
    margin-left: auto;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .guess {
    width: auto;
    color: var(--ink-2);
    box-shadow: inset 0 0 0 1px var(--line);
    border-radius: var(--r-pill);
  }
  .alt,
  .coords {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .coords .field {
    width: 150px;
  }
  .err {
    margin: 0;
    font-size: var(--t-xs);
    color: var(--danger);
  }

  /* ---- the sky */
  .sky {
    --ink-sky: #10172a;
    --ink-sky-2: rgb(16 23 42 / 0.66);
    position: relative;
    overflow: hidden;
    padding: 14px 16px 12px;
    margin-bottom: var(--s-4);
    border-radius: var(--r-lg);
    color: var(--ink-sky);
    isolation: isolate;
  }
  .sky.night,
  .sky.dawn,
  .sky.dusk {
    --ink-sky: #f4f1ff;
    --ink-sky-2: rgb(244 241 255 / 0.72);
  }
  .wash {
    position: absolute;
    inset: 0;
    z-index: -1;
  }
  .night .wash {
    background: radial-gradient(120% 90% at 70% 0%, #2a2f6b 0%, #141836 55%, #0b0e22 100%);
  }
  .dawn .wash {
    background: linear-gradient(180deg, #2a2f6b 0%, #6d4a8c 52%, #e58c8a 100%);
  }
  .day .wash {
    background: linear-gradient(180deg, #bfdcff 0%, #e4f0ff 60%, #fbf6ea 100%);
  }
  .golden .wash {
    background: linear-gradient(180deg, #ffe2a8 0%, #ffd08a 45%, #f6b57c 100%);
  }
  .dusk .wash {
    background: linear-gradient(180deg, #3a2c6e 0%, #a5507c 55%, #f08a5d 100%);
  }
  .stars {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
  }
  .stars i {
    position: absolute;
    width: calc(var(--r) * 2);
    height: calc(var(--r) * 2);
    border-radius: 50%;
    background: white;
    opacity: 0.7;
    animation: star-in 1.6s var(--ease-out) var(--d) both;
  }
  @keyframes star-in {
    from {
      opacity: 0;
      transform: scale(0.2);
    }
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--t-xs);
  }
  .place {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px 3px 6px;
    border-radius: var(--r-pill);
    color: var(--ink-sky);
    background: color-mix(in srgb, var(--ink-sky) 10%, transparent);
  }
  .place:hover {
    background: color-mix(in srgb, var(--ink-sky) 18%, transparent);
  }
  .hijri {
    color: var(--ink-sky-2);
  }
  .now {
    margin: 10px 2px 0;
  }
  .now h3 {
    font-size: 30px;
    font-weight: 400;
    letter-spacing: -0.02em;
    line-height: 1.1;
    color: var(--ink-sky);
  }
  .when {
    margin: 2px 0 0;
    font-size: var(--t-md);
    font-weight: 500;
  }
  .sub {
    margin: 2px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-sky-2);
  }
  .arc {
    display: block;
    width: 100%;
    height: auto;
    margin-top: 6px;
    overflow: visible;
  }
  .arc .path {
    fill: none;
    stroke: var(--ink-sky-2);
    stroke-width: 1.5;
    stroke-dasharray: 2 5;
    stroke-linecap: round;
  }
  .arc .horizon {
    stroke: var(--ink-sky-2);
    stroke-width: 1;
    opacity: 0.6;
  }
  .arc .pt {
    fill: var(--ink-sky-2);
  }
  .arc .pt.lit {
    fill: var(--ink-sky);
  }
  .arc .lbl {
    font-size: 10px;
    fill: var(--ink-sky-2);
    font-variant-numeric: tabular-nums;
  }
  .sun {
    transition: transform 1s var(--ease-out);
  }
  .sun .glow {
    fill: #fff3c4;
    opacity: 0.55;
  }
  .sun .disc {
    fill: #ffcf4a;
    stroke: #fff6d8;
    stroke-width: 2;
  }
  .ramadan {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    margin-top: 6px;
    font-size: var(--t-xs);
    color: var(--ink-sky);
  }
  .ramadan span:first-child {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 600;
  }

  /* ---- today */
  .today ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .today li {
    display: grid;
    grid-template-columns: 30px 1fr auto auto 34px;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 6px 0 4px;
    border-radius: var(--r-md);
    transition: background var(--dur-2) var(--ease-out);
  }
  .today li.cur {
    background: color-mix(in srgb, var(--green) 10%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--green) 30%, transparent);
  }
  .today li.past .nm,
  .today li.past .tm {
    color: var(--ink-3);
  }
  .ic {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    color: var(--green);
    background: color-mix(in srgb, var(--green) 13%, transparent);
  }
  .sunrise .ic {
    color: var(--ink-3);
    background: var(--sunken);
  }
  .sunrise .nm,
  .sunrise .tm {
    color: var(--ink-3);
    font-size: var(--t-sm);
  }
  .nm {
    font-size: var(--t-md);
    font-weight: 500;
  }
  .nm em {
    margin-left: 8px;
    padding: 1px 7px;
    border-radius: var(--r-pill);
    font-style: normal;
    font-size: 10.5px;
    font-weight: 600;
    color: white;
    background: var(--green);
    vertical-align: 2px;
  }
  .tm {
    font-size: var(--t-md);
  }
  .jm {
    min-width: 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .pearl {
    position: relative;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--green) 45%, var(--line));
    transition: transform var(--dur-1) var(--ease-out);
  }
  .pearl:hover {
    transform: scale(1.08);
  }
  .pearl:active {
    transform: scale(0.9);
  }
  .pearl .fill {
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--green) 40%, white), var(--green));
  }
  .pearl.jamaat {
    box-shadow: inset 0 0 0 2px var(--green);
  }
  .pearl .ring {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--green) 55%, transparent);
  }
  .pearl-space {
    width: 26px;
  }
  .week {
    display: flex;
    justify-content: space-between;
    margin-top: var(--s-3);
    padding: 10px 12px 6px;
    border-radius: var(--r-md);
    background: var(--surface);
  }
  .col {
    display: grid;
    justify-items: center;
    gap: 4px;
  }
  .col i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--line-strong);
  }
  .col i.prayed,
  .col i.jamaat {
    background: var(--green);
    box-shadow: none;
  }
  .col i.jamaat {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--green) 30%, transparent);
  }
  .col span {
    margin-top: 2px;
    font-size: 10.5px;
    color: var(--ink-3);
  }
  .col.today span {
    color: var(--ink);
    font-weight: 600;
  }

  /* ---- settings */
  .settings {
    border-top: 1px solid var(--line);
    padding-top: var(--s-2);
  }
  .sec {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    padding: 0 6px;
    border-radius: var(--r-sm);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink);
    text-align: left;
  }
  .sec:hover {
    background: var(--sunken);
  }
  .sec small {
    margin-left: auto;
    max-width: 50%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 400;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .chev {
    display: grid;
    color: var(--ink-3);
    transition: transform var(--dur-3) var(--ease-out);
  }
  .chev.up {
    transform: rotate(180deg);
  }
  .body {
    display: grid;
    gap: 8px;
    padding: 4px 6px var(--s-3) 30px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 38px;
    font-size: var(--t-sm);
  }
  .row select {
    max-width: 62%;
  }
  .sm {
    height: 30px;
    padding: 0 10px;
    gap: 6px;
  }
  .hint {
    margin: 0;
    font-size: var(--t-xs);
    line-height: 1.5;
    color: var(--ink-3);
  }
  .adj,
  .jrow {
    display: grid;
    grid-template-columns: 74px 1fr auto;
    align-items: center;
    gap: 8px;
    font-size: var(--t-sm);
  }
  .an {
    font-weight: 500;
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .stepper small {
    color: var(--ink-3);
  }
  .fixed {
    width: 118px;
    height: 32px;
  }
  .jrow select {
    height: 32px;
  }
  .jrow .field[type='time'] {
    width: 118px;
    height: 32px;
  }
  .mins {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .mins input {
    width: 64px;
    height: 32px;
  }
  .link {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
  }
  .link:hover {
    background: var(--sunken);
  }
  .qibla {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .qibla svg {
    width: 56px;
    height: 56px;
  }
  .qibla .dial {
    fill: var(--surface);
    stroke: var(--line-strong);
  }
  .qibla .n {
    font-size: 8px;
    text-anchor: middle;
    fill: var(--ink-3);
  }
  .qibla .needle {
    transform-origin: 32px 32px;
    fill: var(--green);
    transition: transform 900ms var(--ease-settle);
  }
  .qibla p {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .qibla b {
    font-weight: 600;
    color: var(--ink);
  }
  :global([data-motion='calm']) .wq .stars i,
  :global([data-motion='calm']) .wq .crescent * {
    animation: none;
  }
</style>
