import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = '@daydump_has_completed_onboarding';
const PERMISSION_PRIMER_SEEN_KEY = '@daydump_permission_primer_seen';

export class OnboardingService {
  /**
   * Check if user has completed the onboarding flow
   */
  static async hasCompletedOnboarding(): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem(ONBOARDING_KEY);
      return val === 'true';
    } catch (e) {
      console.warn('Error checking onboarding status:', e);
      return false;
    }
  }

  /**
   * Mark onboarding as completed
   */
  static async setOnboardingCompleted(): Promise<void> {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch (e) {
      console.warn('Error setting onboarding status:', e);
    }
  }

  /**
   * Reset onboarding (useful for testing and dev settings)
   */
  static async resetOnboarding(): Promise<void> {
    try {
      await AsyncStorage.removeItem(ONBOARDING_KEY);
      await AsyncStorage.removeItem(PERMISSION_PRIMER_SEEN_KEY);
    } catch (e) {
      console.warn('Error resetting onboarding:', e);
    }
  }
}
