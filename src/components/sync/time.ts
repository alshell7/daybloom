import { clock } from '../../lib/stores/clock.svelte';

/** "just now", "12 min ago", "yesterday" — reactive through the clock. */
export function ago(ms: number | null | undefined): string {
  if (!ms) return 'not yet';
  const s = Math.max(0, Math.round((clock.now - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong.');
