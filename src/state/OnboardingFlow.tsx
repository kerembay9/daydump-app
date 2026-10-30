import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as MediaLibrary from 'expo-media-library/legacy';
import { GalleryService } from '../services/galleryService';
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

async function readStats(): Promise<LibraryStats | null> {
  const first = (ascending: boolean) => MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.photo, sortBy: [[MediaLibrary.SortBy.creationTime, ascending]], first: 1 });
  const [newest, oldest] = await Promise.all([first(false), first(true)]);
  if (!newest.totalCount) return null;
  return { count: newest.totalCount, oldest: oldest.assets[0]?.creationTime ?? newest.assets[0].creationTime, newest: newest.assets[0].creationTime };
}

/** Answers kept across the onboarding screens; mounted by the route group, so a restart (Developer tools) starts clean. */
export function OnboardingFlowProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const [access, setAccess] = useState<Access | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);
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
    return () => { live = false; };
  }, [access]);

  const value = useMemo(() => ({ access, stats, ask, recheck, answers, set, toggle, index: !!ClipEmbedder, tidy: tidySupported(), selfie, purchased, setPurchased, editing, setEditing, progress, reach }),
    [access, stats, ask, recheck, answers, set, toggle, selfie, purchased, editing, progress, reach]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
