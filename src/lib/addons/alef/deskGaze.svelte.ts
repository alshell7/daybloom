// Where the pointer is on the whole desktop, so Alef's eyes can follow it outside its window
// (the planner's dial or the widget). The OS tells any app where its cursor is without asking
// for a permission (macOS: NSEvent.mouseLocation; Windows: GetCursorPos), through Tauri's
// `cursorPosition`. It is asked only while a face is showing and its window is visible, quickly
// while the pointer moves and rarely once it rests, so it costs next to nothing.

import { platform } from '../../platform';

type Point = { x: number; y: number };

class DeskGaze {
  /** The pointer on the desktop, in physical pixels (null outside the native app). */
  pos = $state<Point | null>(null);
  /** The top-left of this window's page on the desktop, in physical pixels. */
  origin = $state<Point | null>(null);

  #users = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #still = 0;
  #off: (() => void)[] = [];

  /** A face starts watching; returns the stop. */
  use(): () => void {
    if (!platform.isNative) return () => {};
    if (this.#users++ === 0) void this.#start();
    return () => {
      if (--this.#users === 0) this.#stop();
    };
  }

  async #start() {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const place = async () => {
      try {
        const p = await win.innerPosition();
        this.origin = { x: p.x, y: p.y };
      } catch {
        this.origin = null;
      }
    };
    await place();
    this.#off.push(await win.onMoved(() => void place()), await win.onResized(() => void place()));
    const wake = () => {
      if (!document.hidden && !this.#timer && this.#users) this.#tick();
    };
    document.addEventListener('visibilitychange', wake);
    this.#off.push(() => document.removeEventListener('visibilitychange', wake));
    this.#tick();
  }

  #stop() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#off.forEach((f) => f());
    this.#off = [];
    this.pos = null;
  }

  #tick = async () => {
    this.#timer = null;
    if (!this.#users || document.hidden) return;
    let moved = false;
    try {
      const { cursorPosition } = await import('@tauri-apps/api/window');
      const p = await cursorPosition();
      moved = !this.pos || Math.abs(p.x - this.pos.x) + Math.abs(p.y - this.pos.y) > 2;
      if (moved) this.pos = { x: p.x, y: p.y };
    } catch {
      /* not allowed or not native: the eyes keep to the window */
    }
    this.#still = moved ? 0 : this.#still + 1;
    if (!this.#users) return;
    // Quick while it moves; slower as it rests (2 s of rest, then 10 s).
    const ms = this.#still === 0 ? 90 : this.#still < 20 ? 220 : this.#still < 60 ? 600 : 1200;
    this.#timer = setTimeout(this.#tick, ms);
  };
}

export const deskGaze = new DeskGaze();

/**
 * Where a face at `rect` (page px) should look for a pointer at `pos` (desktop px): −1..1 each
 * way, stronger the farther it is (full at about four faces away). Null when it's on the face.
 */
export function lookToward(pos: Point, origin: Point, rect: { left: number; top: number; width: number; height: number }, dpr: number): Point | null {
  const cx = origin.x + (rect.left + rect.width / 2) * dpr;
  const cy = origin.y + (rect.top + rect.height / 2) * dpr;
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  const d = Math.hypot(dx, dy);
  const size = Math.max(40, rect.width * dpr);
  if (d < size * 0.25) return null;
  const k = Math.min(1, d / (size * 4));
  return { x: (dx / d) * k, y: (dy / d) * k * 0.85 };
}
