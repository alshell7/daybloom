// The close: one more look at the promise and the download, then the footer.

import { REPO_URL, RELEASES_URL } from '@/lib/release';
import { asset } from '@/lib/utils';
import { DownloadButtons } from '../DownloadButtons';
import { GithubMark } from '../ui/github-mark';

export function Closing() {
  return (
    <section aria-labelledby="close-title" className="relative overflow-clip py-28 sm:py-36">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 size-[70vmax] -translate-1/2 rounded-full bg-[radial-gradient(closest-side,var(--wash-a),transparent)] opacity-60" />
      </div>
      <div className="container-page grid justify-items-center text-center">
        <img src={asset('favicon.svg')} alt="" width={88} height={88} className="size-[88px] drop-shadow-[0_10px_24px_rgb(21_28_42/0.2)]" loading="lazy" />
        <h2 id="close-title" className="mt-8 max-w-[14ch] text-[clamp(40px,6.6vw,84px)] leading-[0.98] font-[340] tracking-[-0.04em] text-ink">
          Make today visible.
        </h2>
        <p className="mt-6 max-w-[44ch] text-[18px] leading-[1.55] text-ink-2">See what is now, how long is left and what comes next, at a glance, all day.</p>
        <DownloadButtons className="mt-10 items-center" center />
      </div>
    </section>
  );
}

export function Footer() {
  const year = 2026;
  return (
    <footer className="border-t border-line">
      <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-10 py-12 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <a href="#top" className="inline-flex items-center gap-2.5 text-[17px] font-medium text-ink">
            <img src={asset('favicon.svg')} alt="" width={28} height={28} className="size-7" loading="lazy" />
            Daybloom
          </a>
          <p className="mt-3 max-w-[46ch] text-[14px] leading-[1.6] text-ink-3">A visual day planner and timer for macOS, Windows and Android. Made with care for calm, clear days.</p>
          <p className="mt-6 text-[12.5px] leading-[1.7] text-ink-3">
            © {year} Daybloom · MIT licence. Icons by <a className="underline underline-offset-2 hover:text-ink" href="https://lucide.dev">Lucide</a> (ISC). On-device models by{' '}
            <a className="underline underline-offset-2 hover:text-ink" href="https://cactuscompute.com">Cactus Compute</a> (Apache-2.0). Interface pieces adapted from Magic UI, Aceternity UI, React Bits and Fumadocs:{' '}
            <a className="underline underline-offset-2 hover:text-ink" href={`${REPO_URL}/blob/main/site/THIRD_PARTY.md`}>
              notices
            </a>
            .
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2.5 text-[14px] sm:grid-cols-3 md:grid-cols-[repeat(3,auto)]">
          <a className="text-ink-2 hover:text-ink" href="#features">Features</a>
          <a className="text-ink-2 hover:text-ink" href="#install">Install</a>
          <a className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink" href={REPO_URL}>
            <GithubMark className="size-3.5" /> GitHub
          </a>
          <a className="text-ink-2 hover:text-ink" href="#alef">Alef</a>
          <a className="text-ink-2 hover:text-ink" href="#whats-new">What's new</a>
          <a className="text-ink-2 hover:text-ink" href={RELEASES_URL}>Releases</a>
          <a className="text-ink-2 hover:text-ink" href="#privacy">Privacy</a>
          <a className="text-ink-2 hover:text-ink" href="#faq">FAQ</a>
          <a className="text-ink-2 hover:text-ink" href={`${REPO_URL}#guide`}>The guide</a>
        </nav>
      </div>
    </footer>
  );
}
