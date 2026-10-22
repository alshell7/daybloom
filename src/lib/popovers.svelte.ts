// The small popovers that open in place (the zone picker, the backlog's quick add, More):
// the phone's back gesture and Esc close the newest one first, before any panel.

import { untrack } from 'svelte';

const stack = $state<(() => void)[]>([]);

export const popovers = {
  get open() {
    return stack.length > 0;
  },
  /** Register an open popover's close; returns the unregister. */
  push(close: () => void): () => void {
    // Untracked: a popover's own effect registers it and mustn't re-run as the stack changes.
    untrack(() => stack.push(close));
    return () =>
      untrack(() => {
        const i = stack.lastIndexOf(close);
        if (i >= 0) stack.splice(i, 1);
      });
  },
  /** Close the newest popover; false if none is open. */
  closeTop(): boolean {
    const close = stack.at(-1);
    if (!close) return false;
    close();
    return true;
  },
};
