// A responsive screenshot: AVIF with a WebP fallback at the widths scripts/optimize-media.mjs
// made, with its real size set so nothing moves while it loads.

import type { CSSProperties } from 'react';
import media from '@/data/media.json';
import { asset, cn } from '@/lib/utils';

type Name = keyof typeof media;

export function Picture({
  name,
  alt,
  sizes = '100vw',
  className,
  imgClassName,
  eager = false,
  style,
}: {
  name: Name;
  alt: string;
  sizes?: string;
  className?: string;
  imgClassName?: string;
  eager?: boolean;
  style?: CSSProperties;
}) {
  const m = media[name] as { w: number; h: number; widths: number[] };
  const set = (ext: string) => m.widths.map((w) => `${asset(`media/${name}-${w}.${ext}`)} ${w}w`).join(', ');
  const largest = m.widths[m.widths.length - 1];
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={set('webp')} sizes={sizes} />
      <img
        src={asset(`media/${name}-${largest}.webp`)}
        alt={alt}
        width={m.w}
        height={m.h}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className={cn('block h-auto w-full', imgClassName)}
        style={style}
        draggable={false}
      />
    </picture>
  );
}
