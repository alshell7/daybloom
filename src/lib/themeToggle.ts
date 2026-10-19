import { flushSync } from 'svelte';
import { settings } from './stores/settings.svelte';
import { view } from './stores/view.svelte';

/**
 * Flip light ↔ dark. The new theme spreads out from `from` as a growing circle
 * (View Transitions where the webview supports them, a plain swap elsewhere).
 */
export function toggleTheme(from?: Element | null) {
  const next = view.dark ? 'light' : 'dark';
  const apply = () => {
    settings.value.theme = next;
    document.documentElement.dataset.theme = next;
    flushSync();
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  if (!doc.startViewTransition || view.reducedMotion) return apply();
  const r = from?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : innerWidth / 2;
  const y = r ? r.top + r.height / 2 : 0;
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  doc.startViewTransition(apply).ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 620, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  });
}
