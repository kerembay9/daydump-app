// The native side of Post / Save only (services/post.ts runs the steps).
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library/legacy';
import { shareImages } from '../../modules/clip-embedder';
import { draftForStory, markPosted } from './dumps';
import { exportSlides } from './slides';
import { storyById } from './stories';
import type { Story } from './stories';
import type { PostDeps } from './post';

export const ALBUM = 'PicDump';

/** Rendered slides (file://) into the PicDump album (Pictures/PicDump), in order. */
export async function saveToAlbum(uris: string[]): Promise<void> {
  if (!uris.length) return;
  const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  if (status !== 'granted') throw new Error('No photo library access');
  let rest = uris;
  let album = await MediaLibrary.getAlbumAsync(ALBUM);
  // An Android album can't be empty: make it with the first slide written straight into it.
  if (!album) [album, rest] = [await MediaLibrary.createAlbumAsync(ALBUM, undefined, false, uris[0]), uris.slice(1)];
  for (const u of rest) await MediaLibrary.createAssetAsync(u, album);
}

/** Real deps for postDump / saveOnly; stories resolve a story preview to its draft. */
export const postDeps = (stories: Story[]): PostDeps => ({
  exportSlides: (d, hd) => exportSlides(d, { highRes: hd }),
  saveToAlbum,
  copy: async (text) => { await Clipboard.setStringAsync(text); },
  share: shareImages,
  persist: async (d) => {
    const s = storyById(stories, d.storyId ?? d.id);
    if (!s) throw new Error('story gone');
    return draftForStory(s);
  },
  markPosted,
});
