import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Alert } from 'react-native';
import { CarouselSlide } from '../types';

export class ShareService {
  /**
   * Copy caption to clipboard with haptic feedback
   */
  static async copyCaptionToClipboard(caption: string, tags: string[] = []): Promise<boolean> {
    try {
      const fullText = tags.length > 0 ? `${caption}\n\n${tags.join(' ')}` : caption;
      await Clipboard.setStringAsync(fullText);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    } catch (e) {
      console.warn('Failed to copy caption:', e);
      return false;
    }
  }

  /**
   * Share rendered card image (or raw photo) to Instagram / System Share
   */
  static async shareImage(imageUri: string, caption: string, tags: string[] = []): Promise<void> {
    try {
      // 1. Copy caption to clipboard so creator can paste directly in Instagram
      await this.copyCaptionToClipboard(caption, tags);

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing Unavailable', 'Sharing is not supported on this platform/device.');
        return;
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // 2. Open Share Sheet with the rendered framed card
      await Sharing.shareAsync(imageUri, {
        dialogTitle: 'Share to Instagram Feed or Story',
        mimeType: 'image/jpeg',
        UTI: 'public.jpeg',
      });
    } catch (err: any) {
      console.warn('Error sharing slide:', err);
      Alert.alert('Notice', 'Caption copied to clipboard! You can paste it directly when sharing.');
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  static async shareSlide(slide: CarouselSlide, caption: string): Promise<void> {
    await this.shareImage(slide.photo.uri, caption);
  }

  /**
   * Save a single rendered slide into the device photo library
   */
  static async saveSlideToGallery(imageUri: string): Promise<boolean> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please grant photo library access in Settings to save cards.');
        return false;
      }

      const asset = await MediaLibrary.createAssetAsync(imageUri);
      const album = await MediaLibrary.getAlbumAsync('DayDump');
      if (album == null) {
        await MediaLibrary.createAlbumAsync('DayDump', asset, false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    } catch (e) {
      console.warn('Failed to save slide to gallery:', e);
      return false;
    }
  }

  /**
   * Save all rendered carousel slides sequentially into the "DayDump" album
   * and automatically copy captions & tags to clipboard.
   */
  static async saveAllSlidesToAlbum(
    imageUris: string[],
    caption: string,
    tags: string[] = []
  ): Promise<number> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please grant photo library access in Settings to save the album.');
        return 0;
      }

      // Copy caption + hashtags immediately
      await this.copyCaptionToClipboard(caption, tags);

      let savedCount = 0;
      const assets: any[] = [];

      for (const uri of imageUris) {
        if (!uri) continue;
        const asset = await MediaLibrary.createAssetAsync(uri);
        assets.push(asset);
        savedCount++;
      }

      if (assets.length > 0) {
        const album = await MediaLibrary.getAlbumAsync('DayDump');
        if (album == null) {
          const createdAlbum = await MediaLibrary.createAlbumAsync('DayDump', assets[0], false);
          if (assets.length > 1 && createdAlbum) {
            await MediaLibrary.addAssetsToAlbumAsync(assets.slice(1), createdAlbum, false);
          }
        } else {
          await MediaLibrary.addAssetsToAlbumAsync(assets, album, false);
        }
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return savedCount;
    } catch (e) {
      console.warn('Error saving all slides to album:', e);
      return 0;
    }
  }
}
