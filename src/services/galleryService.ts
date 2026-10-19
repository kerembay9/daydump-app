import * as MediaLibrary from 'expo-media-library/legacy';
import * as ImagePicker from 'expo-image-picker';
import { PhotoAsset } from '../types';

// High-aesthetic fallback photos for simulator testing or when camera roll is empty
export const SAMPLE_AESTHETIC_PHOTOS: PhotoAsset[] = [
  {
    id: 'sample-1',
    uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
    creationTime: Date.now() - 1000 * 60 * 60 * 8,
    width: 1200,
    height: 1500,
    mediaType: 'photo',
    aestheticScore: 0.95,
  },
  {
    id: 'sample-2',
    uri: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
    creationTime: Date.now() - 1000 * 60 * 60 * 6,
    width: 1200,
    height: 1500,
    mediaType: 'photo',
    aestheticScore: 0.92,
  },
  {
    id: 'sample-3',
    uri: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80',
    creationTime: Date.now() - 1000 * 60 * 60 * 5,
    width: 1200,
    height: 1500,
    mediaType: 'photo',
    aestheticScore: 0.88,
  },
  {
    id: 'sample-4',
    uri: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80',
    creationTime: Date.now() - 1000 * 60 * 60 * 4,
    width: 1200,
    height: 1500,
    mediaType: 'photo',
    aestheticScore: 0.91,
  },
  {
    id: 'sample-5',
    uri: 'https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?auto=format&fit=crop&w=1200&q=80',
    creationTime: Date.now() - 1000 * 60 * 60 * 2,
    width: 1200,
    height: 1500,
    mediaType: 'photo',
    aestheticScore: 0.89,
  },
  {
    id: 'sample-6',
    uri: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
    creationTime: Date.now() - 1000 * 60 * 60 * 1,
    width: 1200,
    height: 1500,
    mediaType: 'photo',
    aestheticScore: 0.94,
  },
  {
    id: 'sample-7',
    uri: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1200&q=80',
    creationTime: Date.now() - 1000 * 60 * 60 * 10,
    width: 1200,
    height: 1500,
    mediaType: 'photo',
    aestheticScore: 0.87,
  },
  {
    id: 'sample-8',
    uri: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1200&q=80',
    creationTime: Date.now() - 1000 * 60 * 60 * 12,
    width: 1200,
    height: 1500,
    mediaType: 'photo',
    aestheticScore: 0.90,
  },
];

/** Validation mode: EXPO_PUBLIC_EVAL_ALBUM="DayDump Eval" restricts every gallery read to that album. */
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
    const all = this.pruneAndCleanAssets(raw);
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
   * Launch system photo picker to let user select photos directly
   * (Works 100% reliably in Expo Go and Android 13/14 without broad storage permissions)
   */
  static async pickPhotosFromGallery(): Promise<PhotoAsset[]> {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return [];
      }

      return result.assets.map((asset, idx) => ({
        id: asset.assetId || `picked-${Date.now()}-${idx}`,
        uri: asset.uri,
        filename: asset.fileName || `photo-${idx}.jpg`,
        creationTime: Date.now() - idx * 1000 * 60 * 30,
        width: asset.width || 1200,
        height: asset.height || 1500,
        mediaType: 'photo',
      }));
    } catch (e) {
      console.warn('[GalleryService] Image picker failed:', e);
      return [];
    }
  }

  /**
   * Fetch photos of "today" (from midnight to current time)
   */
  static async fetchTodaysPhotos(limit: number = 30): Promise<PhotoAsset[]> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      console.log('[GalleryService] No permission, returning sample photos');
      return SAMPLE_AESTHETIC_PHOTOS;
    }

    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const assets = await MediaLibrary.getAssetsAsync({
        album: await this.evalAlbum(),
        mediaType: MediaLibrary.MediaType.photo,
        createdAfter: startOfDay.getTime(),
        sortBy: [MediaLibrary.SortBy.creationTime],
        first: limit,
      });

      if (assets.assets.length === 0) {
        // If user took no photos today yet, look at the last 48 hours
        const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
        const recentAssets = await MediaLibrary.getAssetsAsync({
          album: await this.evalAlbum(),
          mediaType: MediaLibrary.MediaType.photo,
          createdAfter: twoDaysAgo,
          sortBy: [MediaLibrary.SortBy.creationTime],
          first: limit,
        });

        if (recentAssets.assets.length === 0) {
          return SAMPLE_AESTHETIC_PHOTOS;
        }
        return this.pruneAndCleanAssets(recentAssets.assets);
      }

      return this.pruneAndCleanAssets(assets.assets);
    } catch (err) {
      console.warn('[GalleryService] Error fetching today photos:', err);
      return SAMPLE_AESTHETIC_PHOTOS;
    }
  }

  /**
   * Fetch photos matching a specific theme or time range (e.g. December, Summer)
   */
  static async fetchPhotosForTheme(themeQuery: string, limit: number = 40): Promise<PhotoAsset[]> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      return SAMPLE_AESTHETIC_PHOTOS;
    }

    try {
      const queryLower = themeQuery.toLowerCase();
      let createdAfter: number | undefined;
      let createdBefore: number | undefined;

      // Smart Date Parsing for queries like "december" or "summer"
      const now = new Date();
      const currentYear = now.getFullYear();

      if (queryLower.includes('december')) {
        // If currently before December, target last year's December
        const targetYear = now.getMonth() >= 11 ? currentYear : currentYear - 1;
        createdAfter = new Date(targetYear, 11, 1).getTime();
        createdBefore = new Date(targetYear, 11, 31, 23, 59, 59).getTime();
      } else if (queryLower.includes('summer')) {
        // June 1 to August 31
        const targetYear = now.getMonth() >= 8 ? currentYear : currentYear - 1;
        createdAfter = new Date(targetYear, 5, 1).getTime();
        createdBefore = new Date(targetYear, 7, 31, 23, 59, 59).getTime();
      } else if (queryLower.includes('week') || queryLower.includes('weekend')) {
        // Past 7 days
        createdAfter = Date.now() - 7 * 24 * 60 * 60 * 1000;
      }

      const assets = await MediaLibrary.getAssetsAsync({
        album: await this.evalAlbum(),
        mediaType: MediaLibrary.MediaType.photo,
        createdAfter,
        createdBefore,
        sortBy: [MediaLibrary.SortBy.creationTime],
        first: limit,
      });

      if (assets.assets.length === 0) {
        // Fallback to recent assets if date specific search returned 0
        const recent = await MediaLibrary.getAssetsAsync({
          album: await this.evalAlbum(),
          mediaType: MediaLibrary.MediaType.photo,
          first: limit,
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
        return recent.assets.length > 0 ? this.pruneAndCleanAssets(recent.assets) : SAMPLE_AESTHETIC_PHOTOS;
      }

      return this.pruneAndCleanAssets(assets.assets);
    } catch (err) {
      console.warn('[GalleryService] Error fetching theme photos:', err);
      return SAMPLE_AESTHETIC_PHOTOS;
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
        creationTime: asset.creationTime,
        width: asset.width,
        height: asset.height,
        mediaType: asset.mediaType,
      });
    }

    return cleaned;
  }
}
