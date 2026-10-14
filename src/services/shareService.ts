import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Alert, Platform } from 'react-native';
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
   * Share active carousel slide to Instagram / System Share
   */
  static async shareSlide(slide: CarouselSlide, caption: string): Promise<void> {
    try {
      // 1. Copy caption to clipboard first so user can paste it right into Instagram
      await this.copyCaptionToClipboard(caption);

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing Unavailable', 'Sharing is not supported on this platform/device.');
        return;
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // 2. Open Share Sheet
      await Sharing.shareAsync(slide.photo.uri, {
        dialogTitle: 'Share to Instagram Feed or Story',
        mimeType: 'image/jpeg',
        UTI: 'public.jpeg',
      });
    } catch (err: any) {
      console.warn('Error sharing slide:', err);
      Alert.alert('Export Notice', 'Caption copied to clipboard! You can paste it directly when sharing.');
    }
  }
}
