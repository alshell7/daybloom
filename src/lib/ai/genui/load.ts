// The generative-UI renderer (components/genui/GenUi.svelte and the whole library), loaded with
// the rest of the generative-UI chunk (index.ts) the first time it's needed, and kept.

type GenUi = (typeof import('./index'))['GenUi'];

let loading: Promise<{ default: GenUi }> | null = null;

export function loadGenUi(): Promise<{ default: GenUi }> {
  loading ??= import('./index').then(
    (m) => ({ default: m.GenUi }),
    (e) => {
      loading = null;
      throw e;
    },
  );
  return loading;
}
