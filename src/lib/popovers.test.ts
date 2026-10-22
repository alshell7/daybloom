import { describe, expect, it } from 'vitest';
import { popovers } from './popovers.svelte';

describe('popovers', () => {
  it('closes the newest first, and forgets one that closed itself', () => {
    const closed: string[] = [];
    const offZone = popovers.push(() => closed.push('zone'));
    const offMore = popovers.push(() => closed.push('more'));
    expect(popovers.open).toBe(true);
    expect(popovers.closeTop()).toBe(true);
    expect(closed).toEqual(['more']);
    offMore();
    offZone();
    expect(popovers.open).toBe(false);
    expect(popovers.closeTop()).toBe(false);
    expect(closed).toEqual(['more']);
  });
});
