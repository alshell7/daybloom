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

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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
  return JSON.stringify({
    v: 1,
    finish: { face: f.face, bezel: f.bezel, ink: f.ink, track: f.track, signal: f.signal, lume: f.lume, rim: f.rim, dark: f.dark },
    ground: css('--ground') || f.face,
    ink: css('--ink') || f.ink,
    ink2: css('--ink-2') || f.ink,
    blocks,
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

/** Ticks and button presses from the widgets, done while the planner was closed. */
async function takePending() {
  const p = await deviceCall<{ done: string[]; intent?: { action: string; key: string } }>('widgetPending').catch(() => null);
  for (const key of p?.done ?? []) {
    const b = blockFor(key);
    if (b && !b.done) toggleDone(key);
  }
  if (p?.intent) act(p.intent);
}

function act(i: { action: string; key: string }) {
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
    document.removeEventListener('visibilitychange', onVisible);
    stop();
  };
}
