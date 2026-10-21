// What a generative-UI component knows about the answer it belongs to: when it was given, so a
// card shown again later (after reopening the chat) can tell what it already did.

import { getContext, setContext } from 'svelte';

export interface Host {
  /** When the answer came (ms). */
  at: number;
}

const KEY = Symbol('daybloom-genui');

export const setHost = (h: Host) => setContext(KEY, h);
export const getHost = (): Host => getContext<Host | undefined>(KEY) ?? { at: 0 };
