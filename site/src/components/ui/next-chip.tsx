// "Next update": marks a feature that is merged but not in a release yet. It reads the
// "## Next" list in RELEASE_NOTES.md at build time, so the chip goes away by itself once the
// feature ships in a version (the Pages workflow rebuilds after each release).

import { NEXT_NAMES } from '@/lib/releaseNotes';
import { cn } from '@/lib/utils';

export function NextChip({ note, className }: { note: string; className?: string }) {
  if (!NEXT_NAMES.has(note)) return null;
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center rounded-full border border-line-strong px-2.5 text-[12px] font-medium whitespace-nowrap text-ink-2', className)} title="Merged, and coming in the next update of the app">
      Next update
    </span>
  );
}
