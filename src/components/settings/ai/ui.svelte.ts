// What Settings › AI's pieces share while you use it: which service's setup is open, which
// picker is open (one at a time), and the models a service listed, so a feature's picker can
// offer them too. Nothing here is saved.

import type { ProviderId } from '../../../lib/ai/providers';
import { view } from '../../../lib/stores/view.svelte';

class AiUi {
  /** The service whose setup is open on the page. */
  open = $state<ProviderId | null>(null);
  /** The open picker ("feature:skill"). */
  picker = $state<string | null>(null);
  /** Models each service listed when asked. */
  models = $state<Partial<Record<ProviderId, string[]>>>({});
  /** Bumped to bring the open setup into view; `revealed` is the last one the page handled. */
  reveal = $state(0);
  revealed = 0;

  /** Open a service's setup on Settings › AI (from anywhere) and bring it into view. */
  setUp(id: ProviderId) {
    this.open = id;
    this.picker = null;
    this.reveal++;
    if (view.sheet?.kind !== 'settings') view.sheet = { kind: 'settings', section: 'ai' };
  }
}

export const aiUi = new AiUi();
