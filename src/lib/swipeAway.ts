// A Svelte action for a card a finger can swipe away, sideways or down: a phone's "not now".
// The card follows the finger; past a short distance (or after a quick flick) it slides out
// and calls `away`, otherwise it springs back. A tap still reaches its buttons; a swipe that
// moved never presses one. A mouse doesn't swipe.

import { haptic } from './haptics';

const FAR = 90;
const FLICK = 0.6; // px per ms

export function swipeAway(node: HTMLElement, away: () => void) {
  let onAway = away;
  let start: { x: number; y: number; t: number; id: number } | null = null;
  let moving = false;
  let swallow = false;

  const offset = (e: PointerEvent) => {
    const dx = e.clientX - start!.x;
    const dy = Math.max(0, e.clientY - start!.y); // down only: up is the page's
    return Math.abs(dx) > dy ? { side: true, d: dx } : { side: false, d: dy };
  };
  const settle = () => {
    node.style.transition = 'transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 200ms ease-out';
    node.style.transform = '';
    node.style.opacity = '';
  };

  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || start) return;
    start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    moving = false;
  };
  const move = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const o = offset(e);
    if (!moving) {
      if (Math.abs(o.d) < 10) return;
      moving = true;
      node.setPointerCapture(e.pointerId);
      node.style.transition = 'none';
    }
    node.style.transform = o.side ? `translateX(${o.d}px) rotate(${o.d / 45}deg)` : `translateY(${o.d}px)`;
    node.style.opacity = String(Math.max(0.25, 1 - Math.abs(o.d) / (o.side ? 280 : 220)));
  };
  const up = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const o = offset(e);
    const speed = Math.abs(o.d) / Math.max(1, performance.now() - start.t);
    start = null;
    if (!moving) return;
    moving = false;
    swallow = true;
    if (Math.abs(o.d) > FAR || (Math.abs(o.d) > 30 && speed > FLICK)) {
      node.style.transition = 'transform 200ms ease-in, opacity 200ms ease-in';
      node.style.transform = o.side ? `translateX(${Math.sign(o.d) * innerWidth}px)` : `translateY(${node.offsetHeight + 48}px)`;
      node.style.opacity = '0';
      haptic('tick');
      setTimeout(() => {
        onAway();
        // Still here (the card stayed, say): bring it back.
        setTimeout(() => node.isConnected && settle(), 120);
      }, 180);
    } else settle();
  };
  const cancel = () => {
    start = null;
    if (moving) settle();
    moving = false;
  };
  const click = (e: MouseEvent) => {
    if (!swallow) return;
    swallow = false;
    e.stopPropagation();
    e.preventDefault();
  };
  const tapped = () => (swallow = false);

  node.style.touchAction = 'none';
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointerdown', tapped, true);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('click', click, true);
  return {
    update(next: () => void) {
      onAway = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointerdown', tapped, true);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('click', click, true);
    },
  };
}
