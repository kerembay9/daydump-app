import { requireOptionalNativeModule } from 'expo';

type ClipEmbedderModule = {
  /** base64 little-endian Float32, uris.length * 512, L2-normalized; zero rows = undecodable photo */
  embedImages(uris: string[]): Promise<string>;
  embedTexts(texts: string[]): Promise<string>;
  tokenize(text: string): Promise<number[]>;
  /** vecs: base64 Float32 n*512 -> flat n*k vocab ids + scores, best first per vector */
  topConcepts(vecs: string, k: number): Promise<{ ids: number[]; scores: number[] }>;
  conceptNames(): Promise<string[]>;
};

/** null on iOS / Expo Go: callers fall back to non-CLIP behavior. */
export const ClipEmbedder = requireOptionalNativeModule<ClipEmbedderModule>('ClipEmbedder');
