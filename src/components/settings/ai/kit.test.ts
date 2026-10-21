import { describe, expect, it } from 'vitest';
import { headersText, missing, parseHeaders, serviceState, spring } from './kit';

describe('serviceState', () => {
  it('is not set up without a model or a key', () => {
    expect(serviceState('openai', undefined, false)).toBe('none');
    expect(serviceState('openai', { model: '' }, true)).toBe('none');
    expect(serviceState('openai', { model: 'gpt-5-mini' }, false)).toBe('none');
  });
  it('waits for your OK, then is connected', () => {
    expect(serviceState('openai', { model: 'gpt-5-mini' }, true)).toBe('consent');
    expect(serviceState('openai', { model: 'gpt-5-mini', consent: 1 }, true)).toBe('on');
  });
  it('lets a custom service go without a key', () => {
    expect(serviceState('custom', { model: 'llama', consent: 1 }, false)).toBe('on');
  });
});

describe('missing', () => {
  it('names what a service still needs', () => {
    expect(missing('openai', undefined, false)).toEqual(['a key', 'a model']);
    expect(missing('cloudflare', { model: 'm', accountId: 'nope' }, true)).toEqual(['your account ID']);
    expect(missing('cloudflare', { model: 'm', accountId: 'a'.repeat(32) }, true)).toEqual([]);
    expect(missing('custom', { model: 'm' }, false)).toEqual(['an address']);
    expect(missing('custom', { model: 'm', baseUrl: 'http://localhost:11434/v1' }, false)).toEqual([]);
  });
});

describe('headers', () => {
  it('reads "Name: value" lines and writes them back', () => {
    const h = parseHeaders('X-Org: acme\n  bad line\nX-Team :  blue  \n');
    expect(h).toEqual({ 'X-Org': 'acme', 'X-Team': 'blue' });
    expect(headersText(h)).toBe('X-Org: acme\nX-Team: blue');
    expect(headersText(undefined)).toBe('');
  });
});

describe('spring', () => {
  it('starts at 0, overshoots a little and settles at 1', () => {
    expect(spring(0)).toBe(0);
    expect(spring(1)).toBe(1);
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => spring(i / 100)));
    expect(peak).toBeGreaterThan(1.03);
    expect(peak).toBeLessThan(1.12);
    expect(Math.abs(spring(0.98) - 1)).toBeLessThan(0.01);
  });
});
