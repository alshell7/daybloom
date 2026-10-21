// The face of the dial: the wall clock in a small chip, the time left as the big number, and
// what it is for (the app's Readout.svelte). The last five minutes count in seconds.

import { nowState, SLEEP, WAKE, type Block } from '@/lib/day';
import { ICONS } from '@/lib/icons';
import { formatClockCountdown, formatDuration, formatTime, MINUTE } from '@/lib/time';
import { Rolling } from './Rolling';

export function Readout({ blocks, now, hour12, calm }: { blocks: Block[]; now: number | null; hour12: boolean; calm: boolean }) {
  if (now == null) {
    // Before the page knows the visitor's clock (prerender): a quiet placeholder of the same size.
    return (
      <div className="grid justify-items-center gap-[1.2cqi] opacity-0" aria-hidden="true">
        <span className="readout-clock">00:00</span>
        <span className="readout-big">00m</span>
        <span className="readout-title">Daybloom</span>
        <span className="readout-sub">a visual day planner</span>
      </div>
    );
  }
  const s = nowState(blocks, now);
  const fine = s.remainingMs < (s.current ? 5 * MINUTE : MINUTE);
  const big = s.current || s.next ? (fine ? formatClockCountdown(s.remainingMs) : formatDuration(s.remainingMs)) : formatTime(now, hour12);
  const m = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const night = m >= SLEEP || m < WAKE;
  const title = s.current ? s.current.title : s.next ? (night ? 'Sleep time' : 'Free time') : 'Nothing else planned';
  const sub = s.current ? (s.next ? `then ${s.next.title}` : 'last one today') : s.next ? `until ${s.next.title}` : '';
  const Icon = s.current ? ICONS[s.current.icon] : null;
  return (
    <div className="grid justify-items-center gap-[1.1cqi]" aria-live="polite">
      <span className="readout-clock tnum" aria-label={`It's ${formatTime(now, hour12)}`}>
        <Rolling text={formatTime(now, hour12)} calm={calm} />
      </span>
      <span className="readout-big tnum">
        <Rolling text={big} calm={calm} />
      </span>
      <span key={title} className="readout-title">
        {Icon && <Icon aria-hidden="true" className="size-[1.1em] shrink-0" strokeWidth={2} />}
        <span className="truncate">{title}</span>
      </span>
      {sub && <span className="readout-sub truncate">{sub}</span>}
    </div>
  );
}
