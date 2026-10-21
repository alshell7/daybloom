// What the top bar decided last (TopBar.svelte writes it), so Settings › Screen › Top bar can
// say what is waiting in More at this window size.

export const barLive = $state<{ folded: string[]; week: string | null; zone: string | null }>({ folded: [], week: null, zone: null });
