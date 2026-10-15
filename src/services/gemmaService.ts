import { NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { PhotoAsset, CuratedCarousel, CarouselSlide, FrameStyle } from '../types';

const { GemmaEdgeModule } = NativeModules;

export interface GemmaModelStatus {
  isAvailable: boolean;
  isLoaded: boolean;
  modelPath?: string;
  fileSizeMB?: number;
  fileName?: string;
}

export class GemmaService {
  /**
   * Check if Gemma model weights (.bin or .task) exist on device
   */
  static async checkStatus(): Promise<GemmaModelStatus> {
    if (Platform.OS !== 'android' || !GemmaEdgeModule) {
      return { isAvailable: false, isLoaded: false };
    }

    try {
      return await GemmaEdgeModule.checkModelStatus();
    } catch (e) {
      console.warn('[GemmaService] checkStatus error:', e);
      return { isAvailable: false, isLoaded: false };
    }
  }

  /**
   * Load Gemma weights into device GPU memory
   */
  static async loadModel(customPath?: string): Promise<boolean> {
    if (Platform.OS !== 'android' || !GemmaEdgeModule) return false;

    try {
      const res = await GemmaEdgeModule.loadModel(customPath || null);
      return !!res.success;
    } catch (e) {
      console.warn('[GemmaService] loadModel error:', e);
      return false;
    }
  }

  /**
   * Download quantized Gemma weights directly onto the device with progress callbacks
   */
  static async downloadModelWeights(
    modelUrl: string,
    onProgress: (ratio: number, writtenBytes: number, totalBytes: number) => void
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    if (Platform.OS !== 'android') {
      return { success: false, error: 'On-device Gemma requires Android GPU' };
    }

    try {
      const targetPath = `${FileSystem.documentDirectory}gemma-2b-it-gpu-int4.bin`;
      const downloadResumable = FileSystem.createDownloadResumable(
        modelUrl,
        targetPath,
        {},
        (downloadProgress) => {
          const ratio =
            downloadProgress.totalBytesExpectedToWrite > 0
              ? downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
              : 0;
          onProgress(ratio, downloadProgress.totalBytesWritten, downloadProgress.totalBytesExpectedToWrite);
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (result?.uri) {
        // Load the downloaded weights immediately
        const loaded = await this.loadModel(result.uri);
        return { success: loaded, path: result.uri };
      }
      return { success: false, error: 'Download could not complete' };
    } catch (err: any) {
      console.warn('[GemmaService] Download weights error:', err);
      return { success: false, error: err.message || 'Download error' };
    }
  }

  /**
   * Run 100% On-Device Gemma Inference (Zero Cloud, Zero API Keys)
   */
  static async generateCuratedCarousel(
    photos: PhotoAsset[],
    userTheme?: string,
    requestedCount: number = 6
  ): Promise<CuratedCarousel> {
    if (Platform.OS !== 'android' || !GemmaEdgeModule) {
      throw new Error('On-device Gemma is only available on Android');
    }

    const count = Math.min(requestedCount, photos.length);
    const sortedPhotos = [...photos].sort((a, b) => a.creationTime - b.creationTime);
    const candidatePhotos = sortedPhotos.slice(0, count);

    // Build photo summaries (timestamps, aspect ratios, filenames)
    const photoSummaries = candidatePhotos
      .map((p, idx) => {
        const timeStr = new Date(p.creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `Photo ${idx}: taken at ${timeStr}, aspect: ${p.width}x${p.height}`;
      })
      .join('\n');

    const prompt = `
<start_of_turn>user
You are an Instagram creative director and visual storyteller.
Theme requested: "${userTheme || 'Today in Frames'}"
I have ${candidatePhotos.length} photos taken today:
${photoSummaries}

TASK:
Curate these into a 6-slide Instagram carousel story.
Assign each photo a role: 'Cover / The Hook', 'Atmosphere / Setting', 'Close-up Detail', 'Candid / Person', 'Movement / Action', 'Outro / Memory'.
Write 3 captions:
1. minimal: aesthetic lowercase with 1 emoji
2. witty: funny relatable comment
3. story: 2-sentence poetic journal entry

Respond ONLY with valid JSON:
{
  "themeTitle": "Short Catchy Title",
  "themeDescription": "One sentence summary",
  "vibeTag": "Aesthetic / Film / Golden Hour",
  "photoRoles": ["Cover / The Hook", "Atmosphere / Setting", "Close-up Detail", "Candid / Person", "Movement / Action", "Outro / Memory"],
  "captions": {
    "minimal": "...",
    "witty": "...",
    "story": "..."
  },
  "suggestedTags": ["#photodump", "#tag2", "#tag3"],
  "suggestedAudioVibe": "Artist / Genre sound match"
}
<end_of_turn>
<start_of_turn>model
`;

    const result = await GemmaEdgeModule.generateStory(prompt);
    const rawText = result.text || '';

    // Extract JSON block from Gemma output
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from Gemma response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const defaultRoles: CarouselSlide['role'][] = [
      'Cover / The Hook',
      'Atmosphere / Setting',
      'Close-up Detail',
      'Candid / Person',
      'Movement / Action',
      'Outro / Memory',
    ];

    const slides: CarouselSlide[] = candidatePhotos.map((photo, i) => ({
      id: `gemma-slide-${photo.id}-${i}`,
      photo,
      role: (parsed.photoRoles?.[i] as CarouselSlide['role']) || defaultRoles[i % defaultRoles.length],
      slideIndex: i + 1,
      subtitle: `Gemma On-Device: ${parsed.photoRoles?.[i] || defaultRoles[i % defaultRoles.length]}`,
    }));

    return {
      id: `carousel-gemma-${Date.now()}`,
      themeTitle: parsed.themeTitle || userTheme || 'On-Device Story',
      themeDescription: parsed.themeDescription || 'Curated 100% locally with on-device Gemma E2B',
      vibeTag: parsed.vibeTag || 'On-Device Vibe',
      slides,
      captions: {
        minimal: parsed.captions?.minimal || 'captured in the moment 🎞️',
        witty: parsed.captions?.witty || 'proof that i existed today',
        story: parsed.captions?.story || 'Collected moments from the past few hours.',
      },
      suggestedTags: parsed.suggestedTags || ['#photodump', '#ondeviceai'],
      suggestedAudioVibe: parsed.suggestedAudioVibe || 'Analog Acoustic Warmth',
      frameStyle: 'film35mm',
      createdAt: Date.now(),
      isCustomTheme: !!userTheme,
    };
  }
}
