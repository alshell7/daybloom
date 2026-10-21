// The generative-UI code as one lazy chunk: the prompt and the check (prompt.ts) that a
// conversation needs, and the renderer (GenUi.svelte) that draws an answer's UI. Everything
// imports this with import(), so none of it (zod, OpenUI, the components) loads at startup;
// it comes in with the first AI answer. One entry on purpose: split in two, the bundler put
// its shared runtime into the OpenUI chunk and the app loaded that chunk at startup.

export { checkUi, uiPrompt } from './prompt';
export { default as GenUi } from '../../../components/genui/GenUi.svelte';
