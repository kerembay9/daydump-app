import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as MediaLibrary from 'expo-media-library/legacy';
import { GalleryService, isCameraPhoto } from '../services/galleryService';
import { tidySupported } from '../services/tidy/scan';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { type Access, type Answers, progressOf, setAnswer, START, toggleAnswer } from '../services/onboardingFlow';
import { useApp } from './AppState';
import { useSelfiePick } from '../components/SelfieFinder';

/** What screen 5 shows about the library: how many photos, and the first and last date. */
export type LibraryStats = { count: number; oldest: number; newest: number };

type Flow = {
  /** null until the photo question is answered (screen 4) */
  access: Access | null;
  stats: LibraryStats | null;
  /** real photos from the library, spread over time (empty until access is granted); screens 5+ show these instead of gradients */
  photos: string[];
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

/** A dozen camera photos spread over the newest couple of hundred, so the prints don't all show the same minute. */
async function readPhotos(): Promise<string[]> {
  const { assets } = await MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.photo, sortBy: [[MediaLibrary.SortBy.creationTime, false]], first: 240 });
  const all = GalleryService.pruneAndCleanAssets(assets);
  const cam = all.filter((p) => isCameraPhoto(p.uri));
  const pool = cam.length >= POOL ? cam : all; // iOS: no DCIM paths
  const step = Math.max(1, Math.floor(pool.length / POOL));
  return Array.from({ length: Math.min(POOL, pool.length) }, (_, i) => pool[i * step].uri);
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

/** Answers kept across the onboarding screens; mounted by the route group, so a restart (Developer tools) starts clean. */
export function OnboardingFlowProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const [access, setAccess] = useState<Access | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Answers>(START);
  const selfie = useSelfiePick(access === 'full');
  const [editing, setEditing] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [progress, setProgress] = useState(0);
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

  useEffect(() => {
    if (!access || access === 'denied') return;
    let live = true;
    readStats().then((s) => { if (live) setStats(s); }, (e) => console.warn('[onboarding] library stats failed:', e));
    readPhotos().then((p) => { if (live) setPhotos(p); }, (e) => console.warn('[onboarding] library photos failed:', e));
    return () => { live = false; };
  }, [access]);

  const value = useMemo(() => ({ access, stats, photos, ask, recheck, answers, set, toggle, index: !!ClipEmbedder, tidy: tidySupported(), selfie, purchased, setPurchased, editing, setEditing, progress, reach }),
    [access, stats, photos, ask, recheck, answers, set, toggle, selfie, purchased, editing, progress, reach]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
