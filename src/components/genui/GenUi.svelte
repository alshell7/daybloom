<script lang="ts">
  // An AI answer's UI: its OpenUI Lang drawn with Daybloom's component library
  // (lib/ai/genui/library.ts). Loaded lazily, so it costs nothing until the first answer with
  // UI. A quick reply continues the conversation through `onask`; a component that can't draw
  // draws nothing (each sits in its own boundary), so the words above always stand alone.
  import { BuiltinActionType, Renderer, type ActionEvent } from '@openuidev/svelte-lang';
  import { setHost } from '../../lib/ai/genui/host';
  import { library } from '../../lib/ai/genui/library';

  let { source, at = 0, onask }: { source: string; at?: number; onask?: (text: string) => void } = $props();
  setHost({
    get at() {
      return at;
    },
  });

  function onAction(e: ActionEvent) {
    if (e.type !== BuiltinActionType.ContinueConversation) return;
    const text = e.humanFriendlyMessage?.trim();
    if (text) onask?.(text.slice(0, 600));
  }
</script>

<svelte:boundary onerror={(e) => console.warn('[daybloom] genui', e)}>
  <div class="genui">
    <Renderer response={source} {library} {onAction} />
  </div>
  {#snippet failed()}{/snippet}
</svelte:boundary>

<style>
  .genui {
    display: grid;
    min-width: 0;
  }
  .genui:empty {
    display: none;
  }
</style>
