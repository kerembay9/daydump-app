import * as MediaLibrary from 'expo-media-library/legacy';
import { PhotoAsset } from '../types';

export const EVAL_ALBUM = process.env.EXPO_PUBLIC_EVAL_ALBUM || null;

/**
 * Shot with the phone's camera: Android keeps those under DCIM (Samsung also puts screenshots there).
 * ponytail: path heuristic, Android only; iOS ph:// URIs never match, so iOS indexes plain newest-first.
 */
export const isCameraPhoto = (uri: string) => /\/DCIM\/(?!Screenshots\/)/i.test(uri);

export class GalleryService {
  private static async evalAlbum(): Promise<MediaLibrary.Album | undefined> {
    if (!EVAL_ALBUM) return undefined;
    const album = await MediaLibrary.getAlbumAsync(EVAL_ALBUM);
    if (!album) throw new Error(`Eval album "${EVAL_ALBUM}" not found on device`);
    return album;
  }

  /** Every library photo (pruned), the input to the on-device index: camera shots newest first, then everything else newest first. */
  static async listLibraryPhotos(): Promise<PhotoAsset[]> {
    const album = await this.evalAlbum();
    const raw: MediaLibrary.Asset[] = [];
    let after: string | undefined;
    do {
      const page = await MediaLibrary.getAssetsAsync({
        album,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        first: 1000,
        after,
      });
      raw.push(...page.assets);
      after = page.hasNextPage ? page.endCursor : undefined;
    } while (after);
    // our own posted renders (Pictures/DayDump) are not photos to build dumps from
    const all = this.pruneAndCleanAssets(raw).filter((p) => !/\/Pictures\/DayDump\//i.test(p.uri));
    return [...all.filter((p) => isCameraPhoto(p.uri)), ...all.filter((p) => !isCameraPhoto(p.uri))];
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
