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

export type GemmaResult = { ms: number; prepMs: number; text: string; ttftMs: number; prefillTokens: number; prefillTps: number; decodeTokens: number; decodeTps: number };
export type MlkitResult = { ms: number; labels: { text: string; conf: number }[] };

type EdgeBenchModule = {
  gemmaFile(): Promise<{ path: string; bytes: number; partial: number }>;
  /** Resumes a partial download; progress arrives as onDownload events. */
  downloadGemma(url: string): Promise<string>;
  deleteGemma(): Promise<void>;
  /** Returns load time in ms. */
  loadGemma(gpu: boolean): Promise<number>;
  unloadGemma(): Promise<void>;
  /** side = shortest image side sent to the model, in px. */
  gemmaDescribe(uris: string[], prompt: string, side: number, maxTokens: number, thinking: boolean | null): Promise<GemmaResult>;
  mlkitLabels(uri: string, side: number): Promise<MlkitResult>;
  addListener(event: 'onDownload', cb: (e: { bytes: number; total: number }) => void): { remove(): void };
};

/** Gemma 4 E2B (LiteRT-LM) + ML Kit labeling, for the benchmark screen only. Null on iOS / Expo Go. */
export const EdgeBench = requireOptionalNativeModule<EdgeBenchModule>('EdgeBench');
