import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { ClipEmbedder, type ModelPack, type PackState } from '../../modules/clip-embedder';

/** The model downloads (release builds get them from Play after the install, vision first; see ModelPacks.kt). */
export type Models = Record<ModelPack, PackState>;

const READY: PackState = { state: 'ready', progress: 1 };
// No native module (iOS / Expo Go): nothing to wait for, callers fall back as before.
let models: Models | null = ClipEmbedder ? null : { vision: READY, faces: READY, text: READY };
const subs = new Set<() => void>();
const set = (m: Models) => { models = m; subs.forEach((f) => f()); };
// also restarts a download that failed
const refresh = () => ClipEmbedder?.modelState().then(set, (e) => console.warn('[models] state failed:', e));

let started = false;
function start() {
  if (started || !ClipEmbedder) return;
  started = true;
  ClipEmbedder.addListener('onModels', ({ pack, ...s }) => { if (models) set({ ...models, [pack]: s }); });
  AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
  refresh();
}

const subscribe = (f: () => void) => { start(); subs.add(f); return () => { subs.delete(f); }; };

/** The current state outside React (null until the first arrives). */
export const modelsNow = () => models;

/** null until the first state arrives. want: the pack this screen needs, downloaded next after vision. */
export const useModels = (want?: ModelPack) => {
  useEffect(() => { if (want) ClipEmbedder?.wantModel?.(want); }, [want]);
  return useSyncExternalStore(subscribe, () => models);
};

/** Resolves once the pack is on the phone (never, on an install without Play). */
export const whenReady = (p: ModelPack) => new Promise<void>((resolve) => {
  const check = () => { if (models?.[p].state === 'ready') { subs.delete(check); resolve(); } };
  subscribe(check);
  check();
});
