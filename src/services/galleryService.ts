import * as MediaLibrary from 'expo-media-library/legacy';
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

export class GalleryService {
  /**
   * Request gallery permissions from user
   */
  static async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      return status === 'granted';
    } catch (e) {
      console.warn('[GalleryService] Permissions check failed:', e);
      return false;
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
        mediaType: MediaLibrary.MediaType.photo,
        createdAfter: startOfDay.getTime(),
        sortBy: [MediaLibrary.SortBy.creationTime],
        first: limit,
      });

      if (assets.assets.length === 0) {
        // If user took no photos today yet, look at the last 48 hours
        const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
        const recentAssets = await MediaLibrary.getAssetsAsync({
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
        mediaType: MediaLibrary.MediaType.photo,
        createdAfter,
        createdBefore,
        sortBy: [MediaLibrary.SortBy.creationTime],
        first: limit,
      });

      if (assets.assets.length === 0) {
        // Fallback to recent assets if date specific search returned 0
        const recent = await MediaLibrary.getAssetsAsync({
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
  private static pruneAndCleanAssets(rawAssets: MediaLibrary.Asset[]): PhotoAsset[] {
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
