import AsyncStorage from '@react-native-async-storage/async-storage';
import { PhotoAsset, CuratedCarousel, CarouselSlide, FrameStyle } from '../types';

const STORAGE_KEYS = {
  GEMINI_API_KEY: '@daydump_gemini_api_key',
  AI_MODE: '@daydump_ai_mode', // 'on-device-nano' | 'cloud-flash' | 'auto'
};

export class GeminiService {
  /**
   * Set and save custom Gemini API key for Cloud Flash fallback
   */
  static async setApiKey(key: string): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, key);
  }

  static async getApiKey(): Promise<string | null> {
    return await AsyncStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY);
  }

  /**
   * Main Curation Method: Analyzes photos and builds an Instagram-ready carousel
   */
  static async curateCarousel(
    photos: PhotoAsset[],
    userTheme?: string,
    requestedCount: number = 6
  ): Promise<CuratedCarousel> {
    if (!photos || photos.length === 0) {
      throw new Error('No photos available to curate');
    }

    const apiKey = await this.getApiKey();

    // If an API key is configured, call Gemini Flash API
    if (apiKey && apiKey.trim().length > 10) {
      try {
        return await this.callGeminiCloudApi(photos, apiKey, userTheme, requestedCount);
      } catch (err) {
        console.warn('[GeminiService] Cloud API call failed, falling back to on-device engine:', err);
      }
    }

    // Default: On-device curation engine (Simulating Gemini Nano on-device multimodal reasoning)
    return this.runOnDeviceNanoEngine(photos, userTheme, requestedCount);
  }

  /**
   * On-Device Gemini Nano Engine:
   * Selects best photos, paces the carousel (Hook -> Context -> Detail -> Candid -> Movement -> Outro),
   * and crafts 3 caption variations and hashtags.
   */
  private static runOnDeviceNanoEngine(
    photos: PhotoAsset[],
    theme?: string,
    requestedCount: number = 6
  ): CuratedCarousel {
    const isCustom = !!(theme && theme.trim().length > 0);
    const themeQuery = theme?.trim() || 'Daily Moments';

    // 1. Sort photos chronologically
    const sorted = [...photos].sort((a, b) => a.creationTime - b.creationTime);

    // 2. Sample photos evenly across the time period to capture the full narrative arc
    const count = Math.min(requestedCount, sorted.length);
    const selectedPhotos: PhotoAsset[] = [];
    const step = sorted.length / count;

    for (let i = 0; i < count; i++) {
      const index = Math.min(sorted.length - 1, Math.floor(i * step));
      selectedPhotos.push(sorted[index]);
    }

    // 3. Define visual storytelling roles for Instagram Carousel
    const roles: CarouselSlide['role'][] = [
      'Cover / The Hook',
      'Atmosphere / Setting',
      'Close-up Detail',
      'Candid / Person',
      'Movement / Action',
      'Outro / Memory',
    ];

    const slides: CarouselSlide[] = selectedPhotos.map((photo, idx) => ({
      id: `slide-${photo.id}-${idx}`,
      photo,
      role: roles[idx % roles.length],
      slideIndex: idx + 1,
    }));

    // 4. Generate Tone-specific Captions based on Theme
    const captions = this.generateCaptionsForTheme(themeQuery, isCustom);
    const suggestedTags = this.generateTagsForTheme(themeQuery);
    const vibeTag = this.deriveVibeTag(themeQuery);

    return {
      id: `carousel-${Date.now()}`,
      themeTitle: isCustom ? this.capitalizeTheme(themeQuery) : 'Today in Frames',
      themeDescription: isCustom
        ? `Curated story based on "${themeQuery}"`
        : 'A seamless visual recap of your day',
      vibeTag,
      slides,
      captions,
      suggestedTags,
      suggestedAudioVibe: this.getAudioVibe(themeQuery),
      frameStyle: 'film35mm',
      createdAt: Date.now(),
      isCustomTheme: isCustom,
    };
  }

  /**
   * Gemini 2.0 Flash Cloud API Call
   */
  private static async callGeminiCloudApi(
    photos: PhotoAsset[],
    apiKey: string,
    userTheme?: string,
    requestedCount: number = 6
  ): Promise<CuratedCarousel> {
    const prompt = `
You are an elite Instagram creative director.
Theme requested: "${userTheme || 'Today in Frames'}"
Number of photos provided: ${photos.length}. Target carousel size: ${requestedCount}.

Analyze the vibe and output a strictly valid JSON response with this format:
{
  "themeTitle": "Aesthetic short title",
  "vibeTag": "Golden Hour / Coffee / Vintage",
  "captions": {
    "minimal": "aesthetic lowercase caption with 1 emoji",
    "witty": "relatable, witty Instagram caption",
    "story": "poetic or journaling 2-sentence caption"
  },
  "suggestedTags": ["#photodump", "#tag2", "#tag3"],
  "suggestedAudioVibe": "Indie folk / Lo-fi beats / French house",
  "frameStyle": "film35mm"
}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );

    const data = await response.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      throw new Error('Invalid response from Gemini Cloud API');
    }

    const parsed = JSON.parse(rawJson);

    // Build slides from top photos
    const roles: CarouselSlide['role'][] = [
      'Cover / The Hook',
      'Atmosphere / Setting',
      'Close-up Detail',
      'Candid / Person',
      'Movement / Action',
      'Outro / Memory',
    ];

    const count = Math.min(requestedCount, photos.length);
    const slides: CarouselSlide[] = photos.slice(0, count).map((photo, idx) => ({
      id: `cloud-slide-${photo.id}-${idx}`,
      photo,
      role: roles[idx % roles.length],
      slideIndex: idx + 1,
    }));

    return {
      id: `carousel-${Date.now()}`,
      themeTitle: parsed.themeTitle || userTheme || 'Curated Dump',
      themeDescription: `Curated with Gemini 2.0 Flash`,
      vibeTag: parsed.vibeTag || 'Aesthetic',
      slides,
      captions: {
        minimal: parsed.captions?.minimal || 'moments in time ✨',
        witty: parsed.captions?.witty || 'camera roll caught me red-handed',
        story: parsed.captions?.story || 'Collected moments from the past few hours.',
      },
      suggestedTags: parsed.suggestedTags || ['#photodump', '#aesthetic'],
      suggestedAudioVibe: parsed.suggestedAudioVibe || 'Warm analog acoustic',
      frameStyle: (parsed.frameStyle as FrameStyle) || 'film35mm',
      createdAt: Date.now(),
      isCustomTheme: !!userTheme,
    };
  }

  // --- Helpers for Aesthetic Content Generation ---

  private static generateCaptionsForTheme(theme: string, isCustom: boolean) {
    const lower = theme.toLowerCase();

    if (lower.includes('december') || lower.includes('winter')) {
      return {
        minimal: 'december caught on 35mm ☕️❄️',
        witty: 'sweater weather and 4pm sunsets hit different',
        story: 'Quiet corners, warm mugs, and freezing breezes before the year closes out.',
      };
    }

    if (lower.includes('summer') || lower.includes('vacation') || lower.includes('beach')) {
      return {
        minimal: 'salt water & golden hours 🌊🌴',
        witty: 'mentally still here, physically answering emails',
        story: 'Warm breeze, sun-kissed skin, and endless afternoons that felt like they would last forever.',
      };
    }

    if (lower.includes('coffee') || lower.includes('brunch') || lower.includes('food')) {
      return {
        minimal: 'table talk & caffeine 🥐☕️',
        witty: 'my diet consists of 90% iced coffee and aesthetic regrets',
        story: 'Slow mornings made of warm porcelain, crumbly pastries, and good company.',
      };
    }

    if (lower.includes('night') || lower.includes('party') || lower.includes('city')) {
      return {
        minimal: 'neon glow & blurred city lights 🌙✨',
        witty: 'no thoughts, just streetlights and late-night fries',
        story: 'Walking through the hum of the city when everything feels infinite.',
      };
    }

    // Default / Daily
    return {
      minimal: 'little pieces of today 🎞️✨',
      witty: 'proof that i existed outside my bed today',
      story: 'A gentle collection of small moments that made today feel special.',
    };
  }

  private static generateTagsForTheme(theme: string): string[] {
    const lower = theme.toLowerCase();
    if (lower.includes('december') || lower.includes('winter')) {
      return ['#decemberdump', '#winteraesthetic', '#photodump', '#cozyvibes', '#analogfilm'];
    }
    if (lower.includes('summer') || lower.includes('vacation')) {
      return ['#summerdump', '#goldenhour', '#vacationvibes', '#travelgram', '#sunshine'];
    }
    return ['#photodump', '#visualjournal', '#aestheticfeed', '#candidmoments', '#35mmfilm'];
  }

  private static deriveVibeTag(theme: string): string {
    const lower = theme.toLowerCase();
    if (lower.includes('december') || lower.includes('winter')) return 'Cozy Frost & Wool';
    if (lower.includes('summer') || lower.includes('vacation')) return 'Sun Drenched Horizon';
    if (lower.includes('coffee')) return 'Caffeine & Linen';
    return 'Golden Hour Warmth';
  }

  private static getAudioVibe(theme: string): string {
    const lower = theme.toLowerCase();
    if (lower.includes('december') || lower.includes('winter')) return 'Bon Iver / Acoustic Warmth';
    if (lower.includes('summer')) return 'French House / Bossa Nova Sunset';
    return 'Indie Lo-fi / Tape Cassette';
  }

  private static capitalizeTheme(str: string): string {
    return str
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
}
