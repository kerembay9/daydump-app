import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { indexLibrary, Library, loadLibrary, pausedIndex, pauseIndexing, resumeIndexing, wasHandedOff } from '../services/index/photoIndex';
import { buildStories, markSeen, Story } from '../services/stories';
import { GalleryService } from '../services/galleryService';
import { NotificationService } from '../services/notificationService';
import { OnboardingService } from '../services/onboardingService';
import { getProfile } from '../services/profile';
import { addShareIntentListener, getInitialShareIntent, ShareIntent } from '../../modules/clip-embedder';

/** since = creation time of the photo just indexed (camera newest-first, then the rest newest-first) */
export type IndexProgress = { done: number; total: number; etaSec: number | null; since: number; batteryPct?: number | null };

/** Stories marked seen by a shuffle (the ones on screen). */
const SHUFFLE_SEEN = 6;
/** Older than this = undated (1970 rows sort first): not a real coverage edge. */
const DATED = 1e12;
/** Discover builds this many stories, and this many more per "Show more" (building a story's picks is the costly part). */
export const STORY_PAGE = 30;

type AppStateValue = {
  library: Library | null;
  /** the top stories, best first (STORY_PAGE at a time) */
  stories: Story[];
  /** ranked stories not built yet ("Show more" on Discover) */
  moreStories: number;
  showMoreStories: () => Promise<void>;
  /** stories have been built from the saved index once (so an empty list really means none yet) */
  loaded: boolean;
  /** indexing in progress (foreground or the background worker's fast mode); null = idle */
  progress: IndexProgress | null;
  /** creation time of the oldest dated photo indexed so far (how far back dumps reach); null = none yet */
  coverageSince: number | null;
  /** indexing paused with work left */
  paused: { done: number; total: number } | null;
  /** photo permission; null = not asked yet */
  permission: boolean | null;
  onboarding: boolean;
  /** photos shared / "opened with" DayDump, until the Create flow takes them */
  incoming: ShareIntent | null;
  clearIncoming: () => void;
  refreshStories: () => Promise<void>;
  /** Rebuilds from the loaded index, after a setting the stories depend on changed (Hide sensitive photos). */
  rebuildStories: () => Promise<void>;
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
  const [stories, setStoryList] = useState<Story[]>([]);
  const [available, setAvailable] = useState(0);
  const limit = useRef(STORY_PAGE);
  /** what Discover shows now: a gallery sync keeps its order (keepOrder) */
  const shown = useRef<Story[]>([]);
  const setStories = ({ stories: s, available: a }: { stories: Story[]; available: number }) => { shown.current = s; setStoryList(s); setAvailable(a); };
  const build = async (lib: Library) => buildStories(lib, undefined, limit.current, (await getProfile()).hideSensitive);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [paused, setPaused] = useState<{ done: number; total: number } | null>(null);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [incoming, setIncoming] = useState<ShareIntent | null>(getInitialShareIntent);
  /** photos in the last loaded index: the expected total right after a Reindex empties it */
  const known = useRef(0);

  /**
   * Show stories from the current index right away, then index new photos and rebuild if anything changed.
   * sync (back in front): skip the first show and keep Discover's order, so only added / gone photos move things.
   */
  const refreshStories = useCallback(async (sync = false) => {
    try {
      let showCost = 0;
      let empty = false;
      // keep = an empty index doesn't clear what's up (Reindex: the old dumps stay while it reads, board 11)
      const show = async (keep = true) => {
        const t = Date.now();
        const lib = await loadLibrary();
        const tl = Date.now() - t;
        setLibrary(lib);
        empty = !lib.photos.length;
        known.current = lib.photos.length || known.current;
        if (!(keep && empty)) {
          const b = await build(lib);
          setStories(sync ? { ...b, stories: keepOrder(shown.current, b.stories) } : b);
        }
        setLoaded(true);
        showCost = Date.now() - t;
        console.log(`[stories] rebuilt from ${lib.photos.length} photos in ${showCost} ms (load ${tl} ms)`);
      };
      if (!sync) await show();
      // Empty index (first run, Reindex): show the strip now, not after the photo listing and the first batch.
      if (empty) setProgress((p) => p ?? { done: 0, total: known.current, etaSec: null, since: 0 });
      // Newest photos index first, so rebuilding every 15 s surfaces today's stories long before a big first index ends.
      // A rebuild takes ~2 s at 4k photos on an A54 and grows with the library, so back off to keep the JS thread mostly free.
      const t0 = Date.now();
      let lastShow = t0;
      let showing = false;
      const added = await indexLibrary((done, total, last, bg) => {
        const elapsed = Date.now() - t0;
        const etaSec = bg ? bg.etaSec : done >= 32 ? ((total - done) * elapsed) / done / 1000 : null;
        setProgress({ done, total, etaSec, since: last.creationTime, batteryPct: bg ? bg.batteryPct : undefined });
        if (!showing && Date.now() - lastShow > Math.max(15000, 5 * showCost)) {
          showing = true;
          show().catch((e) => console.warn('[stories] rebuild failed:', e)).finally(() => { showing = false; lastShow = Date.now(); });
        }
      });
      setProgress(null);
      setPaused(await pausedIndex());
      if (added || empty) await show(false);
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

  // Back in front: pick up photos taken / deleted meanwhile (a quick diff when nothing changed). Indexing handed to the
  // background worker when the app left: merge its results and finish here, as a full refresh.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => { if (s === 'active') refreshStories(!wasHandedOff()); });
    return () => sub.remove();
  }, [refreshStories]);

  useEffect(() => {
    const sub = addShareIntentListener((e) => { console.log(`[share] received ${e.uris.length} (${e.action})`); setIncoming(e); });
    return () => sub.remove();
  }, []);

  // photos sort by created, so the first dated one is the oldest; progress.since is fresher than the 15 s rebuilds
  const oldest = useMemo(() => library?.photos.find((p) => p.creationTime >= DATED)?.creationTime ?? Infinity, [library]);
  const edge = Math.min(oldest, progress && progress.since >= DATED ? progress.since : Infinity);

  const value = useMemo<AppStateValue>(() => ({
    library, stories, loaded, progress, coverageSince: edge === Infinity ? null : edge, moreStories: Math.max(0, available - stories.length),
    showMoreStories: async () => {
      if (!library?.photos.length) return; // mid-Reindex: keep the old dumps
      limit.current += STORY_PAGE;
      setStories(await build(library));
    }, paused, permission, onboarding, incoming, refreshStories,
    clearIncoming: () => setIncoming(null),
    rebuildStories: async () => { if (library) setStories(await build(library)); },
    shuffleStories: async (seenIds) => {
      if (!library?.photos.length) return;
      await markSeen(seenIds ?? stories.slice(0, SHUFFLE_SEEN).map((s) => s.id));
      setStories(await build(library));
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
  }), [library, stories, available, loaded, progress, edge, paused, permission, onboarding, incoming, refreshStories, start]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppStateProvider');
  return v;
}

/** next's stories in prev's order; new ones go in at their rank in next (a gallery sync shouldn't reshuffle Discover). */
export function keepOrder<S extends { id: string }>(prev: S[], next: S[]): S[] {
  const at = new Map(prev.map((s, i) => [s.id, i]));
  const out = next.filter((s) => at.has(s.id)).sort((a, b) => at.get(a.id)! - at.get(b.id)!);
  next.forEach((s, i) => { if (!at.has(s.id)) out.splice(Math.min(i, out.length), 0, s); });
  return out;
}
