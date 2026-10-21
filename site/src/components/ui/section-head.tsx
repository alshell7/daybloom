import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A section's heading and lead. No kicker above it: the heading carries itself. */
export function SectionHead({ title, lead, className, center = false, id }: { title: ReactNode; lead?: ReactNode; className?: string; center?: boolean; id?: string }) {
  return (
    <div className={cn('max-w-[760px]', center && 'mx-auto text-center', className)}>
      <h2 id={id} className="text-[clamp(34px,4.8vw,58px)] leading-[1.03] font-[360] tracking-[-0.04em] text-ink">
        {title}
      </h2>
      {lead && <p className={cn('mt-5 max-w-[58ch] text-[clamp(17px,1.6vw,19.5px)] leading-[1.55] text-ink-2', center && 'mx-auto')}>{lead}</p>}
    </div>
  );
}
