// Adapted from Magic UI's Shimmer Button (MIT, magicui.design/docs/components/shimmer-button):
// a light travels round the edge of the pill. Changed for Daybloom: it is a link (downloads are
// links), it wears the ink fill of the primary button, and the spark is one compositor-only
// loop that stops under reduced motion and off screen.

import { forwardRef, type AnchorHTMLAttributes, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export interface ShimmerLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  shimmerColor?: string;
  shimmerDuration?: string;
  /** "soft" is the quiet secondary pill: same shape and size, no light. */
  tone?: 'ink' | 'soft';
}

export const ShimmerLink = forwardRef<HTMLAnchorElement, ShimmerLinkProps>(function ShimmerLink(
  { shimmerColor = 'var(--ink-inverse)', shimmerDuration = '3.2s', tone = 'ink', className, children, style, ...props },
  ref,
) {
  return (
    <a
      ref={ref}
      style={{ '--spread': '90deg', '--shimmer-color': shimmerColor, '--speed': shimmerDuration, '--cut': '1.5px', ...style } as CSSProperties}
      className={cn(
        'group motion-loop relative isolate z-0 inline-flex items-center justify-center gap-2 overflow-hidden rounded-full font-medium whitespace-nowrap',
        tone === 'ink' ? 'bg-ink text-ink-inverse' : 'bg-sunken text-ink dark:bg-raised dark:ring-1 dark:ring-line-strong',
        'transition-[transform,box-shadow] duration-200 [transition-timing-function:var(--ease-out)] hover:shadow-float active:scale-[0.97]',
        className,
      )}
      {...props}
    >
      {/* The light travels only while you point at the button (no loop at rest). */}
      <span className={cn('shimmer-spark absolute inset-0 -z-30 overflow-visible opacity-0 blur-[2px] transition-opacity duration-300 [container-type:size] group-hover:opacity-100 group-focus-visible:opacity-100', tone === 'soft' && 'hidden')} aria-hidden="true">
        <span className="absolute inset-0 aspect-square h-[100cqh] animate-shimmer-slide">
          <span className="absolute -inset-full w-auto rotate-0 animate-spin-around [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))]" />
        </span>
      </span>
      {children}
      {tone === 'ink' && (
        <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_-8px_10px_rgb(255_255_255/0.12)] transition-shadow duration-300 group-hover:shadow-[inset_0_-6px_10px_rgb(255_255_255/0.22)]" aria-hidden="true" />
      )}
      <span
        className={cn(
          'absolute inset-(--cut) -z-20 rounded-full transition-colors duration-200',
          tone === 'ink' ? 'bg-ink group-hover:bg-[color-mix(in_srgb,var(--ink),var(--signal)_12%)]' : 'bg-sunken group-hover:bg-[color-mix(in_srgb,var(--sunken),var(--ink)_7%)] dark:bg-raised dark:group-hover:bg-[color-mix(in_srgb,var(--raised),var(--ink)_7%)]',
        )}
        aria-hidden="true"
      />
    </a>
  );
});
