// The widget's own window, grown sideways for a wing and back. The window gets wider by the
// wing's room, and for a wing on the left it also moves left by as much, so the dial stays
// exactly where it was on the screen (the page pins the dial to the side away from the wing:
// `pin` flips it in the same moment the window moves). A note in localStorage remembers a grown
// window, so a widget that was closed or quit with its wing out comes back at its own size: the
// window-state plugin saves whatever size the window last had. Desktop app only.

import type { Side } from './wing';

const KEY = 'daybloom-widget-wing';

/** A grown window: its side, how much it grew, and its own size before (physical pixels). */
export interface Grown {
  side: Side;
  grow: number;
  w: number;
  h: number;
}

function note(g: Grown | null) {
  try {
    if (g) localStorage.setItem(KEY, JSON.stringify(g));
    else localStorage.removeItem(KEY);
  } catch {
    /* no storage: nothing to remember */
  }
}

/** A window left grown last time (read before the first paint, so the dial starts pinned). */
export function leftGrown(): Grown | null {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return g && (g.side === 'left' || g.side === 'right') && g.grow > 0 && g.w > 0 && g.h > 0 ? g : null;
  } catch {
    return null;
  }
}

async function api() {
  const m = await import('@tauri-apps/api/window');
  return { ...m, win: m.getCurrentWindow() };
}

/** Free screen beside the window on each side, in CSS pixels (its display's work area), or null. */
export async function roomBeside(): Promise<{ left: number; right: number } | null> {
  try {
    const { currentMonitor, win } = await api();
    const [mon, pos, size, scale] = await Promise.all([currentMonitor(), win.outerPosition(), win.outerSize(), win.scaleFactor()]);
    if (!mon) return null;
    const area = mon.workArea ?? { position: mon.position, size: mon.size };
    return { left: (pos.x - area.position.x) / scale, right: (area.position.x + area.size.width - (pos.x + size.width)) / scale };
  } catch {
    return null;
  }
}

/**
 * Grow the window by `css` pixels on `side`. On the left the window also moves, and `pin`
 * runs right before it does (the page moves the dial over in the same moment).
 */
export async function growWindow(side: Side, css: number, pin: () => void): Promise<Grown> {
  const { win, PhysicalPosition, PhysicalSize } = await api();
  const [size, pos, scale] = await Promise.all([win.innerSize(), win.outerPosition(), win.scaleFactor()]);
  const g: Grown = { side, grow: Math.round(css * scale), w: size.width, h: size.height };
  note(g);
  if (side === 'left') {
    // One native step: move and grow together, so the dial doesn't jump for a frame.
    pin();
    if (!(await frame(pos.x - g.grow, pos.y, g.w + g.grow, g.h))) {
      await win.setSize(new PhysicalSize(g.w + g.grow, g.h));
      await win.setPosition(new PhysicalPosition(pos.x - g.grow, pos.y));
    }
    return g;
  }
  await win.setSize(new PhysicalSize(g.w + g.grow, g.h));
  return g;
}

/** Move and resize at once (the app's widget_frame command); false when it isn't there. */
async function frame(x: number, y: number, width: number, height: number): Promise<boolean> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('widget_frame', { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
    return true;
  } catch {
    return false;
  }
}

/** Back to its own size and place; `pin` runs right before a left-grown window moves back. */
export async function shrinkWindow(g: Grown, pin: () => void): Promise<void> {
  const { win, PhysicalPosition, PhysicalSize } = await api();
  if (g.side === 'left') {
    const pos = await win.outerPosition();
    pin();
    if (!(await frame(pos.x + g.grow, pos.y, g.w, g.h))) {
      await win.setPosition(new PhysicalPosition(pos.x + g.grow, pos.y));
      await win.setSize(new PhysicalSize(g.w, g.h));
    }
    note(null);
    return;
  }
  await win.setSize(new PhysicalSize(g.w, g.h));
  note(null);
}

/** On load: a window still grown from last time goes back to its own size (if it really is grown). */
export async function restoreWindow(g: Grown, pin: () => void): Promise<boolean> {
  try {
    const { win } = await api();
    const size = await win.innerSize();
    if (Math.abs(size.width - (g.w + g.grow)) <= 2 && Math.abs(size.height - g.h) <= 2) {
      await shrinkWindow(g, pin);
      return true;
    }
  } catch {
    /* leave it */
  }
  note(null);
  return false;
}
