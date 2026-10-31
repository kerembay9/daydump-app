import * as MediaLibrary from 'expo-media-library/legacy';
import { PhotoAsset } from '../types';

export const EVAL_ALBUM = process.env.EXPO_PUBLIC_EVAL_ALBUM || null;

/**
 * Shot with the phone's camera: Android keeps those under DCIM (Samsung also puts screenshots there).
 * ponytail: path heuristic, Android only; iOS ph:// URIs never match, so iOS indexes plain newest-first.
 */
export const isCameraPhoto = (uri: string) => /\/DCIM\/(?!Screenshots\/)/i.test(uri);
/** In a Screenshots folder (Pictures/ or DCIM/). Same Android-only path heuristic as isCameraPhoto. */
export const isScreenshot = (uri: string) => /\/Screenshots\//i.test(uri);
// our own posted renders (Pictures/PicDump or legacy DayDump) are not photos to build dumps from
const notOurs = (p: PhotoAsset) => !/\/Pictures\/(PicDump|DayDump)\//i.test(p.uri);

export class GalleryService {
  private static async evalAlbum(): Promise<MediaLibrary.Album | undefined> {
    if (!EVAL_ALBUM) return undefined;
    const album = await MediaLibrary.getAlbumAsync(EVAL_ALBUM);
    if (!album) throw new Error(`Eval album "${EVAL_ALBUM}" not found on device`);
    return album;
  }

  /** Every library photo (pruned; with limit, the newest pages holding that many camera shots), the input to the on-device index: camera shots newest first, then everything else newest first. */
  static async listLibraryPhotos(limit?: number): Promise<PhotoAsset[]> {
    const raw: MediaLibrary.Asset[] = [];
    // limit: stop listing once that many camera shots are in (the newest pages), so a 100k library isn't read to the end for them
    for await (const page of this.rawPages()) {
      raw.push(...page);
      if (limit && raw.filter((a) => isCameraPhoto(a.uri)).length >= limit) break;
    }
    const all = this.pruneAndCleanAssets(raw).filter(notOurs);
    return [...all.filter((p) => isCameraPhoto(p.uri)), ...all.filter((p) => !isCameraPhoto(p.uri))];
  }

  /** The library newest first, 1000 at a time and pruned per page, so a scan of a big library can start before it's all listed. */
  static async *photoPages(): AsyncGenerator<PhotoAsset[]> {
    for await (const page of this.rawPages()) yield this.pruneAndCleanAssets(page).filter(notOurs);
  }

  private static async *rawPages(): AsyncGenerator<MediaLibrary.Asset[]> {
    const album = await this.evalAlbum();
    let after: string | undefined;
    do {
      const page = await MediaLibrary.getAssetsAsync({
        album,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        first: 1000,
        after,
      });
      yield page.assets;
      after = page.hasNextPage ? page.endCursor : undefined;
    } while (after);
  }

  /** Photo access now, without asking: granted (all or selected photos), only selected ones (Android 14+), and whether Android still shows its dialog. */
  static async checkPermissions(): Promise<{ granted: boolean; limited: boolean; canAskAgain: boolean }> {
    const r = await MediaLibrary.getPermissionsAsync(false, ['photo']);
    const limited = r.accessPrivileges === 'limited';
    return { granted: r.status === 'granted' || limited, limited, canAskAgain: r.canAskAgain };
  }

  /**
   * Request gallery permissions from user
   */
  static async requestPermissions(): Promise<boolean> {
    try {
      // Explicitly request ONLY 'photo' permission so Android does not reject due to undeclared AUDIO permission
      const response = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      return response.status === 'granted' || (response as any).accessPrivileges === 'limited';
    } catch (e) {
      console.warn('[GalleryService] Permissions check failed:', e);
      return false;
    }
  }

  /**
   * Tier 1: Fast Heuristic Pruning & Deduplication
   * Discards burst duplicates (shots taken < 2.5s apart), very narrow screenshots, etc.
   */
  static pruneAndCleanAssets(rawAssets: MediaLibrary.Asset[]): PhotoAsset[] {
    const cleaned: PhotoAsset[] = [];
    let lastTime = 0;

    for (const asset of rawAssets) {
      // 1. Skip extreme aspect ratios (e.g. ultra long screenshots)
      const ratio = asset.width / Math.max(1, asset.height);
      if (ratio < 0.4 || ratio > 2.5) {
        continue;
      }

      // 2. Burst deduplication (if shots within 2500ms, keep only the first/sharpest)
      if (lastTime > 0 && Math.abs(asset.creationTime - lastTime) < 2500) {
        continue;
      }

      lastTime = asset.creationTime;
      cleaned.push({
        id: asset.id,
        uri: asset.uri,
        filename: asset.filename,
        creationTime: asset.creationTime || asset.modificationTime, // WhatsApp images have no date taken
        width: asset.width,
        height: asset.height,
        mediaType: asset.mediaType,
      });
    }

    return cleaned;
  }
}
