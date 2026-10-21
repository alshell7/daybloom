import { describe, expect, it } from 'vitest';
import { migrateAlef } from '../../addons/alef/alef.svelte';

describe('genui: Alef keeps an answer’s UI with the recent chat', () => {
  it('keeps UI source on remembered messages', () => {
    const ui = 'root = Stack([c])\nc = Choices(["Yes", "No"])';
    const f = migrateAlef({ recent: [{ who: 'alef', text: 'Pick one.', at: 1, ui }] });
    expect(f.recent?.[0]).toEqual({ who: 'alef', text: 'Pick one.', at: 1, ui });
  });

  it('drops UI that is not a string or too long', () => {
    const f = migrateAlef({ recent: [{ who: 'alef', text: 'A', at: 1, ui: 42 }, { who: 'alef', text: 'B', at: 2, ui: 'x'.repeat(7000) }] });
    expect(f.recent?.map((m) => 'ui' in m)).toEqual([false, false]);
  });
});
