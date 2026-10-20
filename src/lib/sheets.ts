// The open panels' own close functions, newest last: Esc closes the top one through it, so a
// sheet can tidy up first (a block swept but never named goes away quietly).

const closers: (() => void)[] = [];

/** Register a panel's close; returns the unregister. */
export function pushCloser(fn: () => void): () => void {
  closers.push(fn);
  return () => {
    const i = closers.lastIndexOf(fn);
    if (i >= 0) closers.splice(i, 1);
  };
}

/** Close the top panel; false if none is open. */
export function closeTopSheet(): boolean {
  const fn = closers.at(-1);
  if (!fn) return false;
  fn();
  return true;
}
