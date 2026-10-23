import { requireOptionalNativeModule } from 'expo';

export type ClipEngine = 'gpu-only' | 'cpu8' | 'gpu-cpu8';

type ClipEmbedderModule = {
  /**
   * base64 little-endian Float32, uris.length * 512, L2-normalized; zero rows = undecodable photo.
   * thumb > 0: uris are content:// MediaStore uris, decoded from the cached thumbnail requested at thumb px.
   */
  embedImages(uris: string[], thumb?: number): Promise<string>;
  /** decode vs model time of the last embedImages call (LiteRT engines: modelMs = GPU busy, decodeMs = the rest of the wall time, cpuPhotos = photos the CPU took); size = first decoded bitmap */
  lastEmbedTimings(): { decodeMs: number; modelMs: number; cpuPhotos?: number; size: string };
  /**
   * Benchmark knobs; rebuilds the vision model. engine: gpu-cpu8 (default; LiteRT GPU, vision.tflite, with LiteRT CPU dynamic int8, vision_dw8.tflite, taking photos once decoding is done) | gpu-only | cpu8 (LiteRT CPU dynamic int8 alone; also gpu-cpu8 without a usable GPU).
   * model: files/models/vision_<model>.tflite on the device, null = bundled. ok = false: LiteRT can't run here (embedImages will throw).
   */
  configure(parallelDecode: boolean, engine: ClipEngine, model: string | null): Promise<{ loadMs: number; found: boolean; ok: boolean }>;
  /** Rejects while the text model hasn't arrived (modelState), except for the selfie finder's fixed phrases. */
  embedTexts(texts: string[]): Promise<string>;
  /**
   * Release builds download the big models from Play after the install, one pack at a time: vision (embedImages, topConcepts),
   * then the one wantModel last asked for, then faces (faces with embed), then text (embedTexts). Debug builds have them all.
   * Calls needing a missing one reject (and want it). Updates come as onModels events. Also restarts a download that failed.
   */
  modelState(): Promise<Record<ModelPack, PackState>>;
  /** A screen needs this pack: it downloads right after vision, ahead of the other (not ahead of one already downloading). */
  wantModel?(pack: ModelPack): void;
  tokenize(text: string): Promise<number[]>;
  /** vecs: base64 Float32 n*512 -> flat n*k vocab ids + scores, best first per vector */
  topConcepts(vecs: string, k: number): Promise<{ ids: number[]; scores: number[] }>;
  conceptNames(): Promise<string[]>;
  /** Indexing pauses until ms from now (called on every touch, so scrolling stays smooth while it runs). */
  holdIndexing(ms: number): void;
  /**
   * YuNet 320 faces per photo (bundled), best first; embed adds SFace vectors (~10 ms/face more, and a sharper decode).
   * thumb > 0 (without embed): uris are content:// MediaStore uris, decoded from the cached thumbnail requested at thumb px.
   */
  faces(uris: string[], minScore: number, embed: boolean, thumb?: number): Promise<FaceScan[]>;
  /**
   * The selfie finder's check: faces (embed as there) and CLIP vectors (as embedImages) of the same photos, each decoded once,
   * CLIP on a CPU model of its own (vision_dw8), not queued behind indexing or its hold. Without the vision pack: vecs is ""
   * and the bundled gate scores each photo instead: reject, its P(document, screen or pet); gateVecs, its 1024-d feature
   * (base64 Float32, n x 1024); sharp, the single face's Laplacian variance (0: not one face).
   */
  selfieCheck(uris: string[], minScore: number, embed: boolean): Promise<{ scans: FaceScan[]; vecs: string; reject: number[]; gateVecs: string; sharp: number[] }>;
  /** Loads the models faces and selfieCheck use (CLIP, or the gate before the vision pack), so the selfie finder's first look doesn't wait for them. */
  warmSelfie(): Promise<void>;
  /**
   * Indexing outside JS (BackgroundIndex.kt): replaces the worker's todo and starts it. fast: now, as a foreground service
   * with a progress notification (call while the app is on screen). Otherwise once the phone charges.
   */
  scheduleBackgroundIndex(ids: string[], uris: string[], model: string, fast: boolean): Promise<void>;
  cancelBackgroundIndex(): Promise<void>;
  /** Stops a fast run; the rest continues on the next charge or resumeBackgroundIndex(). */
  pauseBackgroundIndex(): Promise<void>;
  /** Fast mode for the paused todo. Call while the app is on screen. */
  resumeBackgroundIndex(): Promise<void>;
  /** idle = nothing queued. batteryPct: what the rest costs in fast mode (null while charging). canFast: fast mode would keep running (charging, or battery above 20% and notifications allowed). */
  backgroundIndexStatus(): Promise<{
    state: 'running' | 'slow' | 'paused' | 'lowbattery' | 'done' | 'idle';
    total: number; left: number; charging: boolean; notify: boolean; batteryPct: number | null; msPerPhoto: number | null; canFast: boolean;
  }>;
  /** Removes and returns up to limit photos the worker finished; concepts is the JSON photoIndex.ts stores. */
  takeBackgroundResults(limit: number): Promise<{ model: string | null; rows: { id: string; emb: string; concepts: string; lat: number | null; lon: number | null }[] }>;
  /** The 8 PM recap (DailyRecap.kt): a job re-enqueued daily, posting today's cover photo once 3+ camera photos exist. */
  scheduleDailyRecap(): Promise<void>;
  cancelDailyRecap(): Promise<void>;
  /** Posts the recap now, even with under 3 photos today (test button). */
  postDailyRecap(): Promise<void>;
  /** Today's dump cover, shown in tonight's recap; kept only for the day it was set. */
  setRecapCover(uri: string): void;
  /** Multi-image share (ACTION_SEND_MULTIPLE); file:// uris go through a FileProvider. Resolves with the package that got it, or 'chooser'. */
  shareImages(uris: string[], caption: string, target: ShareTarget | null): Promise<string>;
  /** The targets whose app is installed. */
  shareTargets(): ShareTarget[];
  /** Images the app was opened with (share / Open with), once per intent; null otherwise. */
  getInitialShareIntent(): ShareIntent | null;
  addListener(event: 'onShareIntent', cb: (e: ShareIntent) => void): { remove(): void };
  addListener(event: 'onModels', cb: (e: PackState & { pack: ModelPack }) => void): { remove(): void };
  /** No nav-bar scrim; light = dark nav buttons. */
  setNavigationBarStyle(light: boolean): void;
};

export type ShareTarget = 'instagram' | 'instagram-story' | 'instagram-reel' | 'tiktok';
export type ModelPack = 'vision' | 'faces' | 'text';
/** queued: behind another pack. unavailable: no Play delivery for this install (sideloaded release APK), so it never arrives. progress 0..1. */
export type PackState = { state: 'ready' | 'downloading' | 'queued' | 'waiting' | 'failed' | 'unavailable'; progress: number };
/** uris: content:// as handed over (content://media/.../<id> = a MediaStore id); action: SEND | SEND_MULTIPLE | VIEW | EDIT. */
export type ShareIntent = { action: string; uris: string[]; mimeType: string };

export const shareImages = (uris: string[], caption: string, target: ShareTarget | null) =>
  ClipEmbedder ? ClipEmbedder.shareImages(uris, caption, target) : Promise.reject(new Error('shareImages: Android only'));
export const shareTargets = (): ShareTarget[] => ClipEmbedder?.shareTargets() ?? [];
export const getInitialShareIntent = () => ClipEmbedder?.getInitialShareIntent() ?? null;
export const setNavigationBarStyle = (light: boolean) => ClipEmbedder?.setNavigationBarStyle?.(light);
export const addShareIntentListener = (cb: (e: ShareIntent) => void) => ClipEmbedder?.addListener('onShareIntent', cb) ?? { remove() {} };

/** null on iOS / Expo Go: callers fall back to non-CLIP behavior. */
export const ClipEmbedder = requireOptionalNativeModule<ClipEmbedderModule>('ClipEmbedder');

type QueryTranslateModule = {
  /** The phone's language as an ML Kit code; null = one it can't translate. */
  deviceLanguage(): string | null;
  /** Every language it translates, sorted by English name. */
  languages(): { code: string; name: string }[];
  downloaded(): Promise<string[]>;
  /** ~30 MB from Google, once per language. */
  download(lang: string): Promise<null>;
  remove(lang: string): Promise<null>;
  /** Most likely first; lang 'und' = can't tell. */
  identify(text: string): Promise<{ lang: string; conf: number }[]>;
  /** Rejects if lang isn't downloaded. */
  toEnglish(text: string, lang: string): Promise<string>;
};
/** Search in other languages (QueryTranslateModule.kt, ML Kit, Android only): src/services/index/queryLang.ts. */
export const QueryTranslate = requireOptionalNativeModule<QueryTranslateModule>('QueryTranslate');

export type GemmaResult = { ms: number; prepMs: number; text: string; ttftMs: number; prefillTokens: number; prefillTps: number; decodeTokens: number; decodeTps: number };
/** Box as fractions of the photo; vec: L2-normalized SFace feature (base64 Float32 x 128), same person when dot > 0.363. */
export type Face = { score: number; x: number; y: number; w: number; h: number; vec?: string };
/** aspect: the photo's width / height after EXIF rotation. */
export type FaceScan = { aspect: number; faces: Face[] };
export type FaceResult = { decodeMs: number; modelMs: number; faces: Face[] };
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
  /** YuNet faces per photo (files/models/yunet_<size>.tflite when pushed, else the bundled 320). Boxes are fractions of the photo, best first. */
  yunetFaces(uris: string[], size: number, minScore: number): Promise<FaceResult[]>;
  addListener(event: 'onDownload', cb: (e: { bytes: number; total: number }) => void): { remove(): void };
};

/** Gemma 4 E2B (LiteRT-LM), ML Kit labeling and YuNet faces, for the benchmark screen only. Null on iOS / Expo Go. */
export const EdgeBench = requireOptionalNativeModule<EdgeBenchModule>('EdgeBench');
