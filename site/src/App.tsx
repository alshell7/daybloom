import { Suspense, type ReactNode } from 'react';
import { useReveal } from './hooks/useReveal';
import { DockNav } from './components/DockNav';
import { Header } from './components/Header';
import { Addons } from './components/sections/Addons';
import { AI } from './components/sections/AI';
import { Alef } from './components/sections/Alef';
import { Changelog } from './components/sections/Changelog';
import { Closing, Footer } from './components/sections/Closing';
import { Faq } from './components/sections/Faq';
import { Features } from './components/sections/Features';
import { Focus } from './components/sections/Focus';
import { Hero } from './components/sections/Hero';
import { Install } from './components/sections/Install';
import { Privacy } from './components/sections/Privacy';
import { ProductShot } from './components/sections/ProductShot';
import { Statement } from './components/sections/Statement';
import { Themes } from './components/sections/Themes';
import { Views } from './components/sections/Views';
import { Waqt } from './components/sections/Waqt';

/** Each part below the first screen hydrates on its own, so no single task blocks the page. */
function Part({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

export function App() {
  useReveal();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-ink-inverse">
        Skip to the content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <Part>
          <ProductShot />
        </Part>
        <Part>
          <Statement />
        </Part>
        <Part>
          <Features />
        </Part>
        <Part>
          <Addons />
        </Part>
        <Part>
          <Alef />
        </Part>
        <Part>
          <AI />
        </Part>
        <Part>
          <Waqt />
        </Part>
        <Part>
          <Views />
        </Part>
        <Part>
          <Focus />
        </Part>
        <Part>
          <Themes />
        </Part>
        <Part>
          <Privacy />
        </Part>
        <Part>
          <Install />
        </Part>
        <Part>
          <Changelog />
        </Part>
        <Part>
          <Faq />
        </Part>
        <Part>
          <Closing />
        </Part>
      </main>
      <Part>
        <Footer />
        <DockNav />
      </Part>
    </>
  );
}
