import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import { GalleryService, isCameraPhoto } from '../services/galleryService';
import { poolFromLibrary, poolFromStories } from '../services/onboardingPhotos';
import { tidySupported } from '../services/tidy/scan';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { type Access, type Answers, progressOf, setAnswer, START, toggleAnswer } from '../services/onboardingFlow';
import { useApp, useProgress } from './AppState';
import { capIndex } from '../services/index/photoIndex';
import { useSelfiePick } from '../components/SelfieFinder';

/** What screen 5 shows about the library: how many photos, and the first and last date. */
export type LibraryStats = { count: number; oldest: number; newest: number };

type Flow = {
  /** null until the photo question is answered (screen 4) */
  access: Access | null;
  stats: LibraryStats | null;
  /** real photos from the library, spread over time (empty until access is granted); screens 5+ show these instead of gradients */
  photos: string[];
  /** random camera photos from across the library for screen 5's scan; already prefetched (empty until access is granted) */
  reel: string[];
  /** screen 5's scan has played: coming back to it shows the count at once */
  scanned: boolean;
  markScanned: () => void;
  /** asks the OS for photo access (it shows its own dialog); starts indexing when granted */
  ask: () => Promise<Access>;
  /** reads the current access without asking (back from Settings) */
  recheck: () => Promise<Access>;
  answers: Answers;
  set: <K extends keyof Answers>(key: K, value: Answers[K]) => void;
  toggle: (key: 'topics' | 'pains', id: string) => void;
  /** the phone can run the on-device index (Android's native module today; none on iOS) */
  index: boolean;
  /** Tidy runs here (Android 11+) */
  tidy: boolean;
  /** the selfie scan, running from the photo grant so the pick is ready when screen 24 comes (full access only) */
  selfie: ReturnType<typeof useSelfiePick>;
  /** bought (or restored) Pro on the paywall: screen 30 welcomes them */
  purchased: boolean;
  setPurchased: (on: boolean) => void;
  /** a style screen was opened from the recap's chips: finishing it goes back there */
  editing: boolean;
  setEditing: (on: boolean) => void;
  /** the furthest progress reached: the bar never goes backward */
  progress: number;
  reach: (step: string) => void;
};

const Ctx = createContext<Flow | null>(null);
export const useOnboardingFlow = (): Flow => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOnboardingFlow outside the onboarding route group');
  return v;
};

const toAccess = (p: { granted: boolean; limited: boolean }): Access => (p.limited ? 'limited' : p.granted ? 'full' : 'denied');

const POOL = 12;
/** 10 full batches: ~30 s of reading, plenty to rate the dumps onboarding shows. */
const ONBOARDING_INDEX = 128 * 10;
const NO_PHOTOS: string[] = [];

/**
 * The first pool, before the index has read anything: a dozen camera photos spread over the newest couple of hundred. Metadata is all there
 * is to go by, so a hand or a page of notes can be in it; the pool is replaced by tag-rated photos as the index fills (below).
 */
async function readPhotos(): Promise<string[]> {
  const { assets } = await MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.photo, sortBy: [[MediaLibrary.SortBy.creationTime, false]], first: 240 });
  const all = GalleryService.pruneAndCleanAssets(assets);
  const cam = all.filter((p) => isCameraPhoto(p.uri));
  const pool = cam.length >= POOL ? cam : all; // iOS: no DCIM paths
  const step = Math.max(1, Math.floor(pool.length / POOL));
  return Array.from({ length: Math.min(POOL, pool.length) }, (_, i) => pool[i * step].uri);
}

const REEL = 28;
const SCAN_FROM = 1000;

/** A random sample of the newest SCAN_FROM camera photos for the scan's flicker; the decoded images are in the cache before the screen shows. */
async function readReel(): Promise<string[]> {
  const { assets } = await MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.photo, sortBy: [[MediaLibrary.SortBy.creationTime, false]], first: SCAN_FROM });
  const all = GalleryService.pruneAndCleanAssets(assets);
  const cam = all.filter((p) => isCameraPhoto(p.uri));
  const pool = (cam.length >= REEL ? cam : all).map((p) => p.uri);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const pick = pool.slice(0, REEL);
  await Image.prefetch(pick);
  return pick;
}

/** Photos with no date taken (WhatsApp, downloads) come back as 0 or a few days after 1970; they'd stretch the date span to "Jan 1970". */
const MIN_DATE = Date.UTC(1990, 0, 1);

async function readStats(): Promise<LibraryStats | null> {
  const page = (ascending: boolean, first: number) => MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.photo, sortBy: [[MediaLibrary.SortBy.creationTime, ascending]], first });
  const [newest, oldest] = await Promise.all([page(false, 1), page(true, 100)]);
  if (!newest.totalCount) return null;
  const latest = newest.assets[0].creationTime;
  // the oldest *dated* photo among the first hundred; none = the library's dates are unusable, so the span is a single day
  const first = oldest.assets.find((a) => a.creationTime >= MIN_DATE)?.creationTime ?? latest;
  return { count: newest.totalCount, oldest: first, newest: latest };
}

/**
 * Draws the photo pool once, invisible, at the size of the fan's prints on screen 13 (84 x 108): the decoded bitmaps are in the image cache
 * before that screen mounts 20 views over them, so its first frame and the first slider drags don't wait on decoding.
 */
function Warm({ photos }: { photos: string[] }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: 84, height: 108, opacity: 0 }}>
      {photos.map((uri) => <Image key={uri} source={{ uri }} style={{ position: 'absolute', width: 84, height: 108 }} contentFit="cover" />)}
    </View>
  );
}

/** Answers kept across the onboarding screens; mounted by the route group, so a restart (Developer tools) starts clean. */
export function OnboardingFlowProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const [access, setAccess] = useState<Access | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [firstPhotos, setFirstPhotos] = useState<string[]>([]);
  const [reel, setReel] = useState<string[]>(NO_PHOTOS);
  const [scanned, setScanned] = useState(false);
  const markScanned = useCallback(() => setScanned(true), []);
  const [answers, setAnswers] = useState<Answers>(START);
  const selfie = useSelfiePick(access === 'full');
  const [editing, setEditing] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [progress, setProgress] = useState(0);
  // The pool gets better as the index fills: the covers of Discover's best stories once there are enough, until then the best tag-rated
  // photos read so far. Until one of those exists the prints show the sample gradients: the metadata pick (firstPhotos) can't tell a hand
  // or a page of notes from a good photo, so it is only used where nothing better will come (no on-device index, or the index has finished
  // and found too few photos worth showing). Once it is the stories' it stays put, so the prints don't change under the screens.
  const { stories, library } = app;
  const { progress: reading } = useProgress();
  const nothingBetter = !ClipEmbedder || (!!library?.photos.length && !reading);
  const better = useMemo(() => {
    if (!access || access === 'denied') return { pool: [] as string[], final: false };
    const fromStories = poolFromStories(stories, POOL);
    if (fromStories.length >= 8) return { pool: fromStories, final: true };
    const fromLibrary = library?.hasClip ? poolFromLibrary(library.photos, library.conceptNames.length, POOL) : [];
    return { pool: fromLibrary.length >= 6 ? fromLibrary : [], final: false };
  }, [access, stories, library]);
  const [settled, setSettled] = useState<string[] | null>(null);
  if (!settled && better.final) setSettled(better.pool);
  const photos = settled ?? (better.pool.length ? better.pool : nothingBetter ? firstPhotos : NO_PHOTOS);
  const set = useCallback(<K extends keyof Answers>(key: K, value: Answers[K]) => setAnswers((a) => setAnswer(a, key, value)), []);
  const toggle = useCallback((key: 'topics' | 'pains', id: string) => setAnswers((a) => ({ ...a, [key]: toggleAnswer(a[key], id) })), []);
  const reach = useCallback((step: string) => setProgress((p) => Math.max(p, progressOf(step))), []);

  const ask = useCallback(async () => {
    try {
      // Already allowed (back to this screen, or granted in Settings): no dialog to wait for
      if (!(await GalleryService.checkPermissions()).granted) {
        // Photo only, so Android 13+ doesn't reject the request over the undeclared audio permission.
        await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      }
    } catch (e) {
      console.warn('[onboarding] permission request failed:', e);
    }
    const a = toAccess(await GalleryService.checkPermissions().catch(() => ({ granted: false, limited: false })));
    if (a !== 'denied') app.start().catch((e) => console.warn('[onboarding] start failed:', e));
    setAccess(a);
    return a;
  }, [app]);

  const recheck = useCallback(async () => {
    const a = toAccess(await GalleryService.checkPermissions().catch(() => ({ granted: false, limited: false })));
    // Allowed in Settings meanwhile: index now, as the first grant does
    if (a !== 'denied') app.start().catch((e) => console.warn('[onboarding] start failed:', e));
    setAccess(a);
    return a;
  }, [app]);

  // The index reads only the newest ONBOARDING_INDEX photos meanwhile (a 100k library would take minutes to list and read); leaving
  // lifts the cap, and the pass that follows takes the rest.
  const refresh = useRef(app.refreshStories);
  useEffect(() => { refresh.current = app.refreshStories; });
  useEffect(() => {
    capIndex(ONBOARDING_INDEX);
    return () => { capIndex(null); refresh.current().catch(() => {}); };
  }, []);

  // Screens 1-4 need no photos: load the CLIP models meanwhile, so the first batch after the permission isn't the one paying for it.
  useEffect(() => { ClipEmbedder?.warmVision?.().catch((e) => console.warn('[onboarding] vision warm-up failed:', e)); }, []);

  useEffect(() => {
    if (!access || access === 'denied') return;
    let live = true;
    readStats().then((s) => { if (live) setStats(s); }, (e) => console.warn('[onboarding] library stats failed:', e));
    readPhotos().then((p) => { if (live) setFirstPhotos(p); }, (e) => console.warn('[onboarding] library photos failed:', e));
    readReel().then((r) => { if (live) setReel(r); }, (e) => console.warn('[onboarding] scan photos failed:', e));
    return () => { live = false; };
  }, [access]);

  const value = useMemo(() => ({ access, stats, photos, reel, scanned, markScanned, ask, recheck, answers, set, toggle, index: !!ClipEmbedder, tidy: tidySupported(), selfie, purchased, setPurchased, editing, setEditing, progress, reach }),
    [access, stats, photos, reel, scanned, markScanned, ask, recheck, answers, set, toggle, selfie, purchased, editing, progress, reach]);
  return <Ctx.Provider value={value}>{children}{photos.length ? <Warm photos={photos} /> : null}</Ctx.Provider>;
}
