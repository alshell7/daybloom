// Phone only (main window): the home-screen widgets' snapshot (Widgets.kt) — the blocks for
// the next day, the dial's colours, and Alef's face drawn by the same eye renderer as the
// app — sent when any of it changes. Android redraws the widgets from it as time passes. What
// happened on a widget while the planner was closed (a block ticked, "Start 2 min") is
// applied here when it opens.

import { untrack } from 'svelte';
import { alef } from '../addons/alef/alef.svelte';
import { ACTS } from '../addons/alef/behaviors';
import { drawEyes, eyeOf } from '../addons/alef/eyes';
import { restPose } from '../addons/alef/face';
import { isOn } from '../addons/registry';
import { toggleDone } from '../actions';
import { openItems } from '../backlog';
import { blocksInRange } from '../engine/blocks';
import { MINUTE } from '../engine/time';
import type { Block } from '../engine/types';
import { platform } from '../platform';
import { shownTitle } from '../privacy';
import { clock } from '../stores/clock.svelte';
import { settings } from '../stores/settings.svelte';
import { taskFile } from '../stores/tasks.svelte';
import { timer } from '../stores/timer.svelte';
import { view } from '../stores/view.svelte';
import { deviceCall } from './device.svelte';

const HOUR = 60 * MINUTE;

/** Alef's face as a PNG (base64), drawn once by the app's own eyes on a transparent canvas. */
function faces(): { face: string; sleep: string; well: string } | null {
  if (!isOn('alef')) return null;
  const pal = alef.screenFor(view.finish);
  const draw = (pose: { l: any; r: any }) => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 200;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    drawEyes(ctx, [eyeOf(pose.l, -1), eyeOf(pose.r, 1)], { scale: (c.width / 200) * 1.05, color: pal.eye, glow: 0.6 * pal.glow, scratch: document.createElement('canvas'), shadow: pal.dark ? null : 'rgba(20, 28, 42, 0.2)' });
    return c.toDataURL('image/png').split(',')[1] ?? '';
  };
  const asleep = ACTS.sleeping.poses.reduce((a, p) => (p.hold > a.hold ? p : a), ACTS.sleeping.poses[0]);
  return { face: draw(restPose(alef.affect)), sleep: draw(asleep), well: pal.well };
}

/** A theme colour as #rrggbb (Android reads only that): any CSS colour goes through a canvas. */
function css(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw || /^#[0-9a-f]{6}$/i.test(raw)) return raw;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#000000';
    ctx.fillStyle = raw;
    const v = String(ctx.fillStyle);
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
    return m ? `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}` : '';
  } catch {
    return '';
  }
}

async function snapshot(): Promise<string> {
  const now = clock.now;
  const blocks = blocksInRange(taskFile.value.tasks, view.events, now - HOUR, now + 26 * HOUR, view.finish.dark)
    .filter((b) => !b.floating && !b.skipped)
    .map((b) => ({ k: b.key, s: b.startMs, e: b.endMs, c: b.color, t: shownTitle(b.title, b.category), done: b.done, own: b.kind === 'task' }));
  const f = view.finish;
  let a: ReturnType<typeof faces> = null;
  try {
    a = faces();
  } catch {
    a = null;
  }
  const cur = view.now.current;
  const next = view.now.next;
  // The Backlog widget: Next first, then by priority and your order.
  const open = openItems(taskFile.value.tasks);
  const rank = (l?: string | null) => (l === 'next' ? 0 : l === 'inbox' || !l ? 1 : 2);
  const top = [...open].sort((a, z) => rank(a.list) - rank(z.list) || (a.priority ?? 9) - (z.priority ?? 9) || (a.order ?? 0) - (z.order ?? 0)).slice(0, 4);
  return JSON.stringify({
    v: 1,
    finish: { face: f.face, bezel: f.bezel, ink: f.ink, track: f.track, signal: f.signal, lume: f.lume, rim: f.rim, dark: f.dark },
    ground: css('--ground') || f.face,
    ink: css('--ink') || f.ink,
    ink2: css('--ink-2') || f.ink,
    blocks,
    backlog: {
      n: open.length,
      items: top.map((t) => ({ t: shownTitle(t.title, t.category), l: t.list === 'next' ? 'Next' : t.list === 'someday' ? 'Someday' : 'Inbox', p: t.priority ?? 0 })),
    },
    alef: a && {
      ...a,
      name: 'Alef',
      line: cur && cur.kind === 'task' ? `“${shownTitle(cur.title, cur.category)}” is on. Two minutes is a perfect start.` : '',
      idle: next ? `Next: ${shownTitle(next.title, next.category)}. I'm here when you need a hand.` : 'A quiet stretch. Rest counts too.',
    },
  });
}

function blockFor(key: string): Block | null {
  return view.todayBlocks.find((b) => b.key === key) ?? null;
}

/** Lines added from the Backlog widget's quick-add card: into the backlog (Inbox, or as written). */
async function takeCaptures() {
  const r = await deviceCall<{ items: { text: string; at: number }[] }>('capturePending').catch(() => null);
  const items = r?.items ?? [];
  if (!items.length) return;
  const { backlog } = await import('../backlog');
  let n = 0;
  for (const it of items.sort((a, z) => a.at - z.at)) n += backlog.capture(String(it.text ?? ''), 'inbox').length;
  if (n) view.say(n === 1 ? 'Added from your home screen to the backlog' : `${n} added from your home screen to the backlog`);
}

/** Ticks and button presses from the widgets, done while the planner was closed. */
async function takePending() {
  void takeCaptures();
  const p = await deviceCall<{ done: string[]; intent?: { action: string; key: string; text?: string } }>('widgetPending').catch(() => null);
  for (const key of p?.done ?? []) {
    const b = blockFor(key);
    if (b && !b.done) toggleDone(key);
  }
  if (p?.intent) act(p.intent);
}

function act(i: { action: string; key: string; text?: string }) {
  // Quick capture from anywhere (share, the tile, the app icon, the Backlog widget): Jot.
  if (i.action === 'capture' || i.action === 'jot' || i.action === 'jotVoice') {
    view.sheet = { kind: 'jot', text: i.text ?? '', voice: i.action === 'jotVoice' };
    return;
  }
  if (i.action === 'add') {
    view.sheet = null;
    // Give the planner a frame to show the field.
    setTimeout(() => dispatchEvent(new CustomEvent('daybloom:capture', { detail: { text: i.text ?? '' } })), 250);
    return;
  }
  if (i.action === 'backlog') {
    view.sheet = { kind: 'backlog' };
    return;
  }
  if (i.action === 'focus') {
    if (timer.active) view.focus = true;
    else view.sheet = { kind: 'focus' };
    return;
  }
  if (i.action !== 'start2') return;
  const b = i.key ? blockFor(i.key) : null;
  void import('../starter.svelte').then(({ starter }) => {
    if (b && !timer.active) starter.start(b);
  });
}

export function startWidgets(): () => void {
  if (!platform.isMobile) return () => {};
  let sent = '';
  let pending: ReturnType<typeof setTimeout> | null = null;

  async function push() {
    pending = null;
    const data = await snapshot();
    if (data === sent) return;
    sent = data;
    await deviceCall('widgets', { data }).catch((e) => {
      sent = '';
      console.warn('[daybloom] widgets', e);
    });
  }
  const soon = () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => void push(), 2000);
  };

  const onIntent = (e: Event) => act((e as CustomEvent).detail);
  const onVisible = () => {
    if (document.visibilityState === 'visible') void takePending();
  };
  addEventListener('daybloom:intent', onIntent);
  const onQuick = () => void takeCaptures().then(() => soon());
  addEventListener('daybloom:quick-added', onQuick);
  document.addEventListener('visibilitychange', onVisible);

  const stop = $effect.root(() => {
    $effect(() => {
      void JSON.stringify(taskFile.value.tasks);
      void view.events.length;
      void view.finish.id;
      void view.dark;
      void settings.value.privacy.on;
      void view.now.current?.key;
      void Math.floor(clock.minute / (30 * MINUTE));
      untrack(soon);
    });
    // Alef's mood: when it moves a step, the widget's face follows (not every frame).
    $effect(() => {
      if (!isOn('alef')) return;
      void Math.round(alef.affect.v * 4);
      void Math.round(alef.affect.a * 4);
      untrack(soon);
    });
  });

  void takePending().then(push);
  return () => {
    if (pending) clearTimeout(pending);
    removeEventListener('daybloom:intent', onIntent);
    removeEventListener('daybloom:quick-added', onQuick);
    document.removeEventListener('visibilitychange', onVisible);
    stop();
  };
}
