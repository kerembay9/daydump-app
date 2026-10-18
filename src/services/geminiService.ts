import AsyncStorage from '@react-native-async-storage/async-storage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { PhotoAsset, CuratedCarousel, CarouselSlide, FrameStyle } from '../types';
import { GemmaService } from './gemmaService';

const STORAGE_KEYS = {
  GEMINI_API_KEY: '@daydump_gemini_api_key',
  AI_MODE: '@daydump_ai_mode',
};

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

  /**
   * Main Curation Entrypoint: Analyzes photos using real multimodal vision or on-device simulation
   */
  static async curateCarousel(
    photos: PhotoAsset[],
    userTheme?: string,
    requestedCount: number = 6
  ): Promise<CuratedCarousel> {
    if (!photos || photos.length === 0) {
      throw new Error('No photos available to curate');
    }

    // 1. First Priority: Check if On-Device Gemma E2B is available via MediaPipe!
    try {
      const gemmaStatus = await GemmaService.checkStatus();
      if (gemmaStatus.isAvailable) {
        console.log('[GeminiService] Found on-device Gemma weights at:', gemmaStatus.modelPath);
        return await GemmaService.generateCuratedCarousel(photos, userTheme, requestedCount);
      }
    } catch (err) {
      console.warn('[GeminiService] On-device Gemma execution error:', err);
    }

    const apiKey = await this.getApiKey();

    // 2. Second Priority: Cloud Multimodal Vision if key is configured
    if (apiKey && apiKey.trim().length > 10) {
      try {
        console.log('[GeminiService] Launching Deep Multimodal Vision Pipeline...');
        return await this.callGeminiMultimodalVision(photos, apiKey, userTheme, requestedCount);
      } catch (err) {
        console.warn('[GeminiService] Multimodal Vision call failed, using on-device engine fallback:', err);
      }
    }

    // 3. Fallback: On-device chronological simulation engine
    return this.runOnDeviceNanoEngine(photos, userTheme, requestedCount);
  }

  /**
   * Resizes and downscales candidate images to lightweight ~512px JPEG base64 strings.
   * This keeps upload size under 50KB per image, allowing sub-2-second vision analysis.
   */
  private static async preparePhotosForVision(
    photos: PhotoAsset[],
    maxCount: number = 8
  ): Promise<{ photo: PhotoAsset; base64: string; index: number }[]> {
    const candidates = photos.slice(0, maxCount);
    const prepared: { photo: PhotoAsset; base64: string; index: number }[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const p = candidates[i];
      try {
        const manipulated = await manipulateAsync(
          p.uri,
          [{ resize: { width: 512 } }],
          { compress: 0.65, format: SaveFormat.JPEG, base64: true }
        );

        if (manipulated.base64) {
          prepared.push({
            photo: p,
            base64: manipulated.base64,
            index: i,
          });
        }
      } catch (err) {
        console.warn(`[GeminiService] Failed to downscale image #${i}:`, err);
      }
    }

    return prepared;
  }

  /**
   * Real Multimodal Vision API Call:
   * Inspects the pixels of each photo to detect what/who is in them,
   * curates the optimal carousel arc, and writes custom captions referencing real visual details.
   */
  private static async callGeminiMultimodalVision(
    photos: PhotoAsset[],
    apiKey: string,
    userTheme?: string,
    requestedCount: number = 6
  ): Promise<CuratedCarousel> {
    const preparedImages = await this.preparePhotosForVision(photos, 8);
    if (preparedImages.length === 0) {
      return this.runOnDeviceNanoEngine(photos, userTheme, requestedCount);
    }

    const promptText = `
You are an expert social media creative director and visual storyteller.
I have provided ${preparedImages.length} actual photos from the user's camera roll, labeled Photo 0 to Photo ${preparedImages.length - 1}.

TASK:
1. LOOK CLOSELY AT THE ACTUAL PIXELS OF EACH PHOTO:
   - Identify WHAT is in the photo (specific objects, food, drinks, coffee, nature, architecture, textures, room vibe).
   - Identify WHO is in the photo (solo selfie, group of friends, couple, pet, candid person, or no people).
   - Note the lighting, mood, and aesthetic quality.

2. User's Theme Query: "${userTheme || 'Today in Frames'}".

3. Select the best ${requestedCount} photos that tell the most cohesive visual story.
   Sequence them in narrative Instagram Carousel order:
   - Slide 1: Cover / The Hook (visually striking anchor)
   - Slide 2: Atmosphere / Setting (sets the scene)
   - Slide 3: Close-up Detail (food, drink, texture, hands, object)
   - Slide 4: Candid / Person (emotion, human connection, selfie)
   - Slide 5: Movement / Action (dynamic activity, walking, street)
   - Slide 6: Outro / Memory (sunset, evening, cozy memory)

4. Write 3 DISTINCT CAPTIONS that EXPLICITLY reference the actual people, objects, food, or activities in the photos:
   - minimal: aesthetic lowercase caption with 1-2 emojis (e.g. "matcha lattes & windy walks ☕️🌿")
   - witty: humorous, relatable caption commenting on what is happening in the photos
   - story: poetic 2-sentence micro-journal describing the real day/moment captured

Respond ONLY with a strictly valid JSON object matching this schema:
{
  "themeTitle": "Catchy aesthetic 2-4 word title",
  "themeDescription": "One sentence explaining the story arc",
  "vibeTag": "Short 2-3 word aesthetic tag (e.g. Linen & Espresso / Golden Hour Sunset)",
  "selectedIndices": [photo_indices_in_order],
  "photoRoles": {
    "0": "Cover / The Hook",
    "1": "Atmosphere / Setting"
  },
  "photoVisualDescriptions": {
    "0": "What is in Photo 0 (e.g. Iced latte on wood table with sun flare)",
    "1": "What is in Photo 1 (e.g. Two friends laughing outside bakery)"
  },
  "captions": {
    "minimal": "...",
    "witty": "...",
    "story": "..."
  },
  "suggestedTags": ["#photodump", "#tag2", "#tag3"],
  "suggestedAudioVibe": "Artist / Genre sound match based on visual mood",
  "frameStyle": "film35mm"
}
`;

    // Construct Multimodal Request Parts
    const parts: any[] = [{ text: promptText }];

    for (const item of preparedImages) {
      parts.push({ text: `Photo ${item.index}:` });
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: item.base64,
        },
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );

    const data = await response.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawJson) {
      console.warn('[GeminiService] Multimodal API response missing candidate text:', data);
      throw new Error(data.error?.message || 'Invalid response from Gemini Multimodal API');
    }

    const parsed = JSON.parse(rawJson);

    const defaultRoles: CarouselSlide['role'][] = [
      'Cover / The Hook',
      'Atmosphere / Setting',
      'Close-up Detail',
      'Candid / Person',
      'Movement / Action',
      'Outro / Memory',
    ];

    const selectedIndices: number[] = Array.isArray(parsed.selectedIndices)
      ? parsed.selectedIndices
      : preparedImages.map((p) => p.index);

    const slides: CarouselSlide[] = [];
    selectedIndices.slice(0, requestedCount).forEach((photoIdx, i) => {
      const match = preparedImages.find((p) => p.index === photoIdx) || preparedImages[i];
      if (match) {
        const role =
          (parsed.photoRoles?.[String(photoIdx)] as CarouselSlide['role']) ||
          defaultRoles[i % defaultRoles.length];
        const visualDesc = parsed.photoVisualDescriptions?.[String(photoIdx)] || '';

        slides.push({
          id: `vision-slide-${match.photo.id}-${i}`,
          photo: match.photo,
          role,
          slideIndex: i + 1,
          subtitle: visualDesc || undefined,
        });
      }
    });

    return {
      id: `carousel-vision-${Date.now()}`,
      themeTitle: parsed.themeTitle || userTheme || 'Curated Story',
      themeDescription: parsed.themeDescription || 'Curated with Gemini 2.0 Multimodal Vision',
      vibeTag: parsed.vibeTag || 'Aesthetic',
      slides: slides.length > 0 ? slides : this.runOnDeviceNanoEngine(photos, userTheme, requestedCount).slides,
      captions: {
        minimal: parsed.captions?.minimal || 'pieces of the day ✨',
        witty: parsed.captions?.witty || 'camera roll caught me red-handed',
        story: parsed.captions?.story || 'Collected moments from the past few hours.',
      },
      suggestedTags: parsed.suggestedTags || ['#photodump', '#aesthetic'],
      suggestedAudioVibe: parsed.suggestedAudioVibe || 'Indie Warmth / Analog Tape',
      frameStyle: (parsed.frameStyle as FrameStyle) || 'film35mm',
      createdAt: Date.now(),
      isCustomTheme: !!userTheme,
    };
  }

  /**
   * On-Device Gemini Nano Engine Simulation (Offline / Zero-Config fallback)
   */
  static runOnDeviceNanoEngine(
    photos: PhotoAsset[],
    theme?: string,
    requestedCount: number = 6
  ): CuratedCarousel {
    const isCustom = !!(theme && theme.trim().length > 0);
    const themeQuery = theme?.trim() || 'Daily Moments';

    const sorted = [...photos].sort((a, b) => a.creationTime - b.creationTime);
    const count = Math.min(requestedCount, sorted.length);
    const selectedPhotos: PhotoAsset[] = [];
    const step = sorted.length / count;

    for (let i = 0; i < count; i++) {
      const index = Math.min(sorted.length - 1, Math.floor(i * step));
      selectedPhotos.push(sorted[index]);
    }

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
