// Post / Save only from Posted Preview. Pure orchestration (native steps come in as deps) so selfcheck can test it.
import type { Dump } from './dumps';
import type { ShareTarget } from '../../modules/clip-embedder';
import { clipText } from './captions';
import { isDumpId } from './dumpLabels';

export type PostDeps = {
  /** dump -> rendered slide JPGs (file://), in order */
  exportSlides(d: Dump): Promise<string[]>;
  /** into the "DayDump" album */
  saveToAlbum(uris: string[]): Promise<void>;
  copy(text: string): Promise<void>;
  /** opens the app (or the chooser); resolves with the package that got it or 'chooser' */
  share(uris: string[], caption: string, target: ShareTarget): Promise<string>;
  /** a story preview has no dump yet: its draft (made now) */
  persist(d: Dump): Promise<Dump>;
  markPosted(id: string, platform: string | null, caption: string): Promise<unknown>;
};

/**
 * Render -> album -> caption on the clipboard -> share to IG / TikTok. Android can't see whether the post went out,
 * so the dump is marked Posted once the share opened; via the chooser (app not installed) without a platform.
 * An album failure doesn't stop the post (saved = false); nor does a draft/mark failure after the share opened
 * (marked = false). A failure before the share throws and nothing is marked.
 */
export async function postDump(x: PostDeps, d: Dump, caption: string, tags: string[], target: ShareTarget) {
  const uris = await x.exportSlides(d);
  const saved = await x.saveToAlbum(uris).then(() => true, (e) => (console.warn('[post] album save failed:', e), false));
  await x.copy(clipText(caption, tags));
  const to = await x.share(uris, caption, target);
  // The app is open now: a failure from here on mustn't read as "couldn't open" (the user would post twice).
  let id = d.id;
  const marked = await (async () => {
    if (!isDumpId(id)) id = (await x.persist(d)).id;
    await x.markPosted(id, to === 'chooser' ? null : target, caption);
  })().then(() => true, (e) => (console.warn('[post] mark posted failed:', e), false));
  return { to, saved, marked, slides: uris.length, id };
}

/** Save only: render and save to the album; not posted. Returns the slide count. */
export async function saveOnly(x: Pick<PostDeps, 'exportSlides' | 'saveToAlbum'>, d: Dump) {
  const uris = await x.exportSlides(d);
  await x.saveToAlbum(uris);
  return uris.length;
}
