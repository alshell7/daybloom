// One shared heartbeat. `now` ticks every second (cheap: only readouts read it);
// `minute` changes once a minute and drives the heavier block derivations.

class Clock {
  now = $state(Date.now());
  minute = $state(floorMinute(Date.now()));
  /** Optional debug offset so the UI can be previewed at any time of day. */
  offset = $state(0);
  /** The zone the wall clock is read in; deriveds read this so a zone change recomputes them. */
  zone = $state('');
  private handle: ReturnType<typeof setTimeout> | null = null;

  start() {
    if (this.handle) return;
    const tick = () => {
      const t = Date.now() + this.offset;
      this.now = t;
      const m = floorMinute(t);
      if (m !== this.minute) this.minute = m;
      // Re-align to the next wall-clock second so the readout never drifts. A hidden
      // window (the planner closed to the tray) only needs a beat every 5 s.
      const step = typeof document !== 'undefined' && document.hidden ? 5000 : 1000;
      this.handle = setTimeout(tick, step - (Date.now() % step) + 5);
    };
    tick();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (this.handle) clearTimeout(this.handle);
        tick();
      });
    }
  }

  /** Jump the clock (dev/preview). */
  setOffset(ms: number) {
    this.offset = ms;
    this.now = Date.now() + ms;
    this.minute = floorMinute(this.now);
  }
}

function floorMinute(t: number) {
  return t - (t % 60_000);
}

export const clock = new Clock();
