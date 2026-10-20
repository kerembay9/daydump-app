import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { indexLibrary, Library, loadLibrary, pausedIndex, pauseIndexing, resumeIndexing, wasHandedOff } from '../services/index/photoIndex';
import { buildStories, markSeen, Story } from '../services/stories';
import { GalleryService, isCameraPhoto } from '../services/galleryService';
import { NotificationService } from '../services/notificationService';
import { OnboardingService } from '../services/onboardingService';
import { getProfile } from '../services/profile';
import { addShareIntentListener, getInitialShareIntent, ShareIntent } from '../../modules/clip-embedder';

export type IndexProgress = { done: number; total: number; etaSec: number | null; since: number; camera: boolean; batteryPct?: number | null };

/** Stories marked seen by a shuffle (the ones on screen). */
const SHUFFLE_SEEN = 6;

type AppStateValue = {
  library: Library | null;
  /** every story, best first */
  stories: Story[];
  /** stories have been built from the saved index once (so an empty list really means none yet) */
  loaded: boolean;
  /** indexing in progress (foreground or the background worker's fast mode); null = idle */
  progress: IndexProgress | null;
  /** indexing paused with work left */
  paused: { done: number; total: number } | null;
  /** photo permission; null = not asked yet */
  permission: boolean | null;
  onboarding: boolean;
  /** photos shared / "opened with" DayDump, until the Create flow takes them */
  incoming: ShareIntent | null;
  clearIncoming: () => void;
  refreshStories: () => Promise<void>;
  /** Marks the given (default: top) stories seen and rebuilds, so others surface. */
  shuffleStories: (seenIds?: string[]) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finishOnboarding: () => Promise<void>;
  showOnboarding: () => void;
};

const Ctx = createContext<AppStateValue | null>(null);

/** Library, stories and indexing state for the whole app (was MainApp in App.tsx). */
export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [library, setLibrary] = useState<Library | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [paused, setPaused] = useState<{ done: number; total: number } | null>(null);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [incoming, setIncoming] = useState<ShareIntent | null>(getInitialShareIntent);

  /** Show stories from the current index right away, then index new photos and rebuild if anything changed. */
  const refreshStories = useCallback(async () => {
    try {
      let showCost = 0;
      const show = async () => {
        const t = Date.now();
        const lib = await loadLibrary();
        const tl = Date.now() - t;
        setLibrary(lib);
        setStories(await buildStories(lib));
        setLoaded(true);
        showCost = Date.now() - t;
        console.log(`[stories] rebuilt from ${lib.photos.length} photos in ${showCost} ms (load ${tl} ms)`);
      };
      await show();
      // Newest photos index first, so rebuilding every 15 s surfaces today's stories long before a big first index ends.
      // A rebuild takes ~2 s at 4k photos on an A54 and grows with the library, so back off to keep the JS thread mostly free.
      const t0 = Date.now();
      let lastShow = t0;
      let showing = false;
      const added = await indexLibrary((done, total, last, bg) => {
        const elapsed = Date.now() - t0;
        const etaSec = bg ? bg.etaSec : done >= 32 ? ((total - done) * elapsed) / done / 1000 : null;
        setProgress({ done, total, etaSec, since: last.creationTime, camera: isCameraPhoto(last.uri), batteryPct: bg ? bg.batteryPct : undefined });
        if (!showing && Date.now() - lastShow > Math.max(15000, 5 * showCost)) {
          showing = true;
          show().catch((e) => console.warn('[stories] rebuild failed:', e)).finally(() => { showing = false; lastShow = Date.now(); });
        }
      });
      setProgress(null);
      setPaused(await pausedIndex());
      if (added) await show();
    } catch (e) {
      setProgress(null);
      setLoaded(true);
      console.warn('[stories] refresh failed:', e);
    }
  }, []);

  const start = useCallback(async () => {
    const perm = await GalleryService.requestPermissions();
    setPermission(perm);
    if (perm) refreshStories();
  }, [refreshStories]);

  useEffect(() => {
    (async () => {
      getProfile().catch(() => {}); // warm profileNow() (new-dump size / frame defaults) before anything reads it
      await NotificationService.init();
      if (await OnboardingService.hasCompletedOnboarding()) start();
      else setOnboarding(true);
    })();
  }, [start]);

  // Indexing handed to the background worker when the app left: back in front, merge its results and finish here.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => { if (s === 'active' && wasHandedOff()) refreshStories(); });
    return () => sub.remove();
  }, [refreshStories]);

  useEffect(() => {
    const sub = addShareIntentListener((e) => { console.log(`[share] received ${e.uris.length} (${e.action})`); setIncoming(e); });
    return () => sub.remove();
  }, []);

  const value = useMemo<AppStateValue>(() => ({
    library, stories, loaded, progress, paused, permission, onboarding, incoming, refreshStories,
    clearIncoming: () => setIncoming(null),
    shuffleStories: async (seenIds) => {
      if (!library) return;
      await markSeen(seenIds ?? stories.slice(0, SHUFFLE_SEEN).map((s) => s.id));
      setStories(await buildStories(library));
    },
    pause: async () => { await pauseIndexing(); },
    resume: async () => {
      setPaused(null);
      await resumeIndexing();
      refreshStories();
    },
    // The onboarding paywall hook is gone (PAYWALLS_ENABLED = false).
    finishOnboarding: async () => {
      setOnboarding(false);
      await start();
    },
    showOnboarding: () => setOnboarding(true),
  }), [library, stories, loaded, progress, paused, permission, onboarding, incoming, refreshStories, start]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppStateProvider');
  return v;
}
