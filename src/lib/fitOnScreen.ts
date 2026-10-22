// A Svelte action for a popover hung under a button (position: absolute, a left or right edge
// set): on a narrow screen it can run past the side of the window, and the browser may then
// scroll the whole page sideways to show a field in it. This slides it back inside, 16 px from
// each side. It uses the `translate` property, which adds to any `transform` an open/close
// transition animates, and measures the layout box, which those transitions don't change.

const MARGIN = 16;

export function fitOnScreen(node: HTMLElement) {
  const fit = () => {
    const parent = node.offsetParent as HTMLElement | null;
    const base = parent ? parent.getBoundingClientRect().left + parent.clientLeft : 0;
    const left = base + node.offsetLeft;
    const right = left + node.offsetWidth;
    let dx = 0;
    if (right > innerWidth - MARGIN) dx = innerWidth - MARGIN - right;
    if (left + dx < MARGIN) dx = MARGIN - left;
    node.style.translate = dx ? `${Math.round(dx)}px 0` : '';
  };
  fit();
  addEventListener('resize', fit);
  return {
    destroy() {
      removeEventListener('resize', fit);
    },
  };
}
