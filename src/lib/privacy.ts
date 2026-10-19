// Privacy mode helpers. The windows themselves are protected natively (privacy.rs); this
// is the second layer: block names can be swapped for their category on surfaces other
// people might see (the widget, the screen-cue HUD and the menu bar).

import { CATEGORIES } from './engine/categories';
import type { CategoryId } from './engine/types';
import { settings } from './stores/settings.svelte';

export function hidingNames(): boolean {
  return settings.value.privacy.on && settings.value.privacy.hideNames;
}

/** The title to show on a shared surface. */
export function shownTitle(title: string, category: CategoryId): string {
  if (!hidingNames()) return title;
  const c = CATEGORIES.find((x) => x.id === category);
  return c ? c.label : 'Block';
}
