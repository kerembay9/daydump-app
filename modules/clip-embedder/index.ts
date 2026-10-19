import { requireOptionalNativeModule } from 'expo';

export type ClipEngine = 'gpu' | 'gpu-only' | 'ort' | 'xnnpack';

type ClipEmbedderModule = {
  /**
   * base64 little-endian Float32, uris.length * 512, L2-normalized; zero rows = undecodable photo.
   * thumb > 0: uris are content:// MediaStore uris, decoded from the cached thumbnail requested at thumb px.
   */
  embedImages(uris: string[], thumb?: number): Promise<string>;
  /** decode vs model time of the last embedImages call (LiteRT engines: modelMs = GPU busy, decodeMs = the rest of the wall time, cpuPhotos = photos ORT took); size = first decoded bitmap */
  lastEmbedTimings(): { decodeMs: number; modelMs: number; cpuPhotos?: number; size: string };
  /**
   * Benchmark knobs; rebuilds the vision model. engine: gpu (default; LiteRT GPU, vision.tflite, with ORT on the CPU taking photos once decoding is done) | gpu-only | ort | xnnpack (ONNX Runtime, vision.onnx).
   * model: files/models/vision_<model>.tflite|.onnx on the device, null = bundled. ok = false: LiteRT can't run here, ONNX Runtime is used.
   */
  configure(parallelDecode: boolean, engine: ClipEngine, model: string | null): Promise<{ loadMs: number; found: boolean; ok: boolean }>;
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
  loadGemma(gpu: boolean, visionGpu: boolean): Promise<number>;
  unloadGemma(): Promise<void>;
  /** side = shortest image side sent to the model, in px. */
  gemmaDescribe(uris: string[], prompt: string, side: number, maxTokens: number, thinking: boolean | null): Promise<GemmaResult>;
  /** Whether Play services already has the labeling model. */
  mlkitReady(): Promise<boolean>;
  /** Requests the model download; resolves true once usable (false after a 2 min timeout). */
  mlkitInstall(): Promise<boolean>;
  mlkitLabels(uri: string, side: number): Promise<MlkitResult>;
  addListener(event: 'onDownload', cb: (e: { bytes: number; total: number }) => void): { remove(): void };
};

/** Gemma 4 E2B (LiteRT-LM) + ML Kit labeling, for the benchmark screen only. Null on iOS / Expo Go. */
export const EdgeBench = requireOptionalNativeModule<EdgeBenchModule>('EdgeBench');
