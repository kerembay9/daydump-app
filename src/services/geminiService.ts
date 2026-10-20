import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  GEMINI_API_KEY: '@daydump_gemini_api_key',
};

// ponytail: only stores the dev-tools key; nothing reads it since the redesign (curation moved on-device).
export class GeminiService {
  /**
   * Set and save custom Gemini API key for Multimodal Vision
   */
  static async setApiKey(key: string): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, key.trim());
  }

  static async getApiKey(): Promise<string | null> {
    return await AsyncStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY);
  }
}
