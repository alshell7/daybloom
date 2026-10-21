// What's new, straight from the app's release notes (RELEASE_NOTES.md, read at build time).

import { ArrowUpRight, Wrench } from 'lucide-react';
import dates from '@/data/release-dates.json';
import { RELEASES_URL } from '@/lib/release';
import { NOTES } from '@/lib/releaseNotes';
import { SectionHead } from '../ui/section-head';
import { Timeline } from '../ui/timeline';

const D = dates as Record<string, string>;
const when = (v: string): string | null => (D[v] ? new Date(D[v]).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null);

function Item({ name, text }: { name: string; text: string }) {
  return (
    <li className="rounded-[16px] border border-line bg-raised px-4.5 py-3.5 shadow-rest">
      <p className="text-[15.5px] font-medium text-ink">{name}</p>
      <p className="mt-1 text-[14.5px] leading-[1.55] text-ink-2">{text}</p>
    </li>
  );
}

export function Changelog() {
  const data = NOTES.slice(0, 4).map((v) => {
    const fixes = v.groups.find((g) => g.title === 'Fixes');
    const main = v.groups.filter((g) => g.title !== 'Fixes');
    const next = v.version === 'Next';
    return {
      title: next ? 'Next' : v.version,
      aside: next ? 'In the next update' : when(v.version),
      content: (
        <div className="grid gap-6">
          {main.map((g) => (
            <div key={g.title}>
              <p className="mb-3 text-[13px] text-ink-3">{g.title === 'Addons' ? 'Addons' : 'New'}</p>
              <ul className="grid gap-3">
                {g.items.slice(0, 5).map((it) => (
                  <Item key={it.name} name={it.name} text={it.text} />
                ))}
              </ul>
              {g.items.length > 5 && (
                <details className="faq group mt-3">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-sunken px-3.5 py-1.5 dark:bg-raised dark:ring-1 dark:ring-line-strong text-[13.5px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                    {g.items.length - 5} more <span className="transition-transform duration-300 group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <ul className="grid gap-3 pt-3">
                    {g.items.slice(5).map((it) => (
                      <Item key={it.name} name={it.name} text={it.text} />
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
          {fixes && (
            <details className="faq group rounded-[16px] bg-sunken/70 px-4.5 py-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                <Wrench className="size-4" aria-hidden="true" />
                {fixes.items.length} {fixes.items.length === 1 ? 'fix' : 'fixes'}
                <span className="ml-auto text-ink-3 transition-transform duration-300 group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <ul className="grid gap-2.5 pt-3 pb-1">
                {fixes.items.map((it) => (
                  <li key={it.name} className="text-[14px] leading-[1.55] text-ink-2">
                    <span className="font-medium text-ink">{it.name}.</span> {it.text}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ),
    };
  });
  return (
    <section id="whats-new" aria-labelledby="whats-new-title" className="py-20 sm:py-28">
      <div className="container-page">
        <div className="mb-14 flex flex-wrap items-end justify-between gap-6 md:mb-20">
          <SectionHead id="whats-new-title" title="What's new." lead="Daybloom updates often, and tells you what each update brings before you install it." />
          <a href={RELEASES_URL} className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-4 py-2 text-[14px] font-medium dark:bg-raised dark:ring-1 dark:ring-line-strong text-ink hover:bg-[color-mix(in_srgb,var(--sunken),var(--ink)_6%)]">
            All releases <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </div>
        <Timeline data={data} />
      </div>
    </section>
  );
}
