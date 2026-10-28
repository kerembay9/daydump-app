import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { ClipEmbedder, type ModelPack, type PackState } from '../../modules/clip-embedder';

/** The model downloads (release builds get them from Play after the install, faces first; see ModelPacks.kt). */
export type Models = Record<ModelPack, PackState>;

const READY: PackState = { state: 'ready', progress: 1 };
// No native module (iOS / Expo Go): nothing to wait for, callers fall back as before.
let models: Models | null = ClipEmbedder ? null : { vision: READY, faces: READY, text: READY };
/** What the module last said; models is this as shown. */
let raw = models;
const subs = new Set<() => void>();
// One download at a time: a pack queued behind one that's waiting for Wi-Fi waits for Wi-Fi too.
const shown = (m: Models): Models => Object.values(m).some((s) => s.state === 'waiting')
  ? Object.fromEntries(Object.entries(m).map(([k, s]) => [k, s.state === 'queued' ? { ...s, state: 'waiting' } : s])) as Models
  : m;
const set = (m: Models) => { raw = m; models = shown(m); subs.forEach((f) => f()); };
// also restarts a download that failed
const refresh = () => ClipEmbedder?.modelState().then(set, (e) => console.warn('[models] state failed:', e));
/** The loading card's Try again (a failed pack otherwise restarts when the app comes back to the front). */
export const retryModels = () => { refresh(); };
/** The waiting card's button: Play's dialog to download now on mobile data (ModelPacks.askToDownload), then the new state. */
export const askToDownload = () => { ClipEmbedder?.askToDownload?.().then(refresh, (e) => console.warn('[models] ask failed:', e)); };

let started = false;
function start() {
  if (started || !ClipEmbedder) return;
  started = true;
  ClipEmbedder.addListener('onModels', ({ pack, ...s }) => { if (raw) set({ ...raw, [pack]: s }); });
  AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
  refresh();
}

const subscribe = (f: () => void) => { start(); subs.add(f); return () => { subs.delete(f); }; };

/** The current state outside React (null until the first arrives). */
export const modelsNow = () => models;

/** null until the first state arrives. want: the pack this screen needs, downloaded next after faces and vision. */
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
