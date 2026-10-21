// The planner itself, tilting flat as it scrolls in: drag between its light and dark look,
// or play the 74-second film (with sound, from promo/).

import { useRef, useState } from 'react';
import { Play, X } from 'lucide-react';
import { asset } from '@/lib/utils';
import { Compare } from '../ui/compare';
import { ContainerScroll } from '../ui/container-scroll';
import { Picture } from '../ui/picture';
import { SectionHead } from '../ui/section-head';

export function ProductShot() {
  const [film, setFilm] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  return (
    <section aria-labelledby="planner-title" className="relative pt-4 pb-24 sm:pb-32">
      <div className="container-page">
        <SectionHead
          id="planner-title"
          center
          title="Your whole day, in one look."
          lead="The planner puts the dial beside your timeline. What is now, how long is left and what comes next read in a second. Drag the handle to see it in light and in dark."
        />
        <ContainerScroll className="mx-auto mt-12 max-w-[1080px] sm:mt-16">
          <div className="overflow-hidden rounded-[22px] bg-raised shadow-lift ring-1 ring-line">
            {film ? (
              <video
                ref={video}
                className="block aspect-video w-full bg-black"
                src={asset('media/film.mp4')}
                poster={asset('media/film-poster.webp')}
                controls
                autoPlay
                playsInline
                preload="none"
                aria-label="A 74-second film about Daybloom, with music: the dial builds itself, a block is planned by sweeping the dial, the planner, widget, focus and themes, Alef, free time around meetings and salah, the world clock, Board and Gantt, a month of dials, alarms, Trash and privacy."
              />
            ) : (
              <Compare
                label="Compare the light and the dark planner"
                className="rounded-[22px]"
                first={<Picture name="hero-light" sizes="(min-width: 1120px) 1080px, 100vw" alt="The Daybloom planner in the light Fog theme. A dial shows the day as coloured arcs, and a timeline on the right lists the blocks." />}
                second={<Picture name="hero-dark" sizes="(min-width: 1120px) 1080px, 100vw" alt="The same planner in the dark Midnight theme." />}
              />
            )}
          </div>
        </ContainerScroll>
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setFilm((f) => !f)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-sunken px-4 text-[14px] font-medium text-ink dark:bg-raised dark:ring-1 dark:ring-line-strong transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--sunken),var(--ink)_6%)] active:scale-[0.97]"
          >
            {film ? <X className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            {film ? 'Close the film' : 'Watch the 74-second film'}
          </button>
        </div>
      </div>
    </section>
  );
}
