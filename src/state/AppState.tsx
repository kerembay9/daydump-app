import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, AppState as RNAppState } from 'react-native';
import { indexLibrary, Library, loadLibrary, pausedIndex, pauseIndexing, resumeIndexing } from '../services/index/photoIndex';
import { buildStories, markSeen, Story } from '../services/stories';
import { GalleryService } from '../services/galleryService';
import { NotificationService } from '../services/notificationService';
import { OnboardingService } from '../services/onboardingService';
import { getProfile } from '../services/profile';
import { list as listDumps } from '../services/dumps';
import { addShareIntentListener, ClipEmbedder, getInitialShareIntent, ShareIntent } from '../../modules/clip-embedder';
import { whenReady } from './models';

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
  /** indexing paused with work left */
  paused: { done: number; total: number } | null;
  /** photo permission; null = not asked yet */
  permission: boolean | null;
  /** only the photos picked in Android 14's dialog */
  limited: boolean;
  onboarding: boolean;
  /** photos shared / "opened with" PicDump, until the Create flow takes them */
  incoming: ShareIntent | null;
  clearIncoming: () => void;
  refreshStories: () => Promise<void>;
  /** Rebuilds from the loaded index, after a setting the stories depend on changed (Hide sensitive photos, Include screenshots). */
  rebuildStories: () => Promise<void>;
  /** Marks the given (default: top) stories seen and rebuilds, so others surface. */
  shuffleStories: (seenIds?: string[]) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  /** Starts indexing (asks for photo access first). Onboarding calls it once access is granted. */
  /** reads the photo permission and starts the index; request = false: don't show Android's dialog (onboarding just asked), only read it */
  start: (request?: boolean) => Promise<void>;
  /** Photo access after a "no": Android's dialog while it still shows it, else Settings (coming back picks a grant up). */
  askPhotos: () => Promise<void>;
  /** started: onboarding already called start() (false: photos denied, nothing asked again). */
  finishOnboarding: (started?: boolean) => Promise<void>;
  showOnboarding: () => void;
};

const Ctx = createContext<AppStateValue | null>(null);

type ProgressValue = {
  /** indexing in progress (foreground or the background worker's fast mode); null = idle */
  progress: IndexProgress | null;
  /** creation time of the oldest dated photo indexed so far (how far back dumps reach); null = none yet */
  coverageSince: number | null;
};
/** Apart from Ctx: it changes every indexing batch, and only the screens showing it should re-render then. */
const ProgressCtx = createContext<ProgressValue>({ progress: null, coverageSince: null });

/**
 * Finger on the screen, or lifted < 2 s ago (a fling still moving): the root view feeds it (_layout). Indexing pauses
 * meanwhile, natively too: its GPU runs and worker threads otherwise take frames and the big cores (Discover janked).
 */
const touch = { down: false, at: 0 };
const lift = () => { touch.down = false; touch.at = Date.now(); ClipEmbedder?.holdIndexing?.(2000); };
// ponytail: a press held over 60 s lets indexing run again under it
export const onTouch = { onTouchStart: () => { touch.down = true; ClipEmbedder?.holdIndexing?.(60000); }, onTouchEnd: lift, onTouchCancel: lift };
const touching = () => touch.down || Date.now() - touch.at < 2000;

/** Library, stories and indexing state for the whole app (was MainApp in App.tsx). */
export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [library, setLibrary] = useState<Library | null>(null);
  const [stories, setStoryList] = useState<Story[]>([]);
  const [available, setAvailable] = useState(0);
  const limit = useRef(STORY_PAGE);
  /** what Discover shows now: a gallery sync keeps its order (keepOrder) */
  const shown = useRef<Story[]>([]);
  const setStories = ({ stories: s, available: a }: { stories: Story[]; available: number }) => {
    shown.current = s; setStoryList(s); setAvailable(a);
    // tonight's 8 PM recap shows this cover (DailyRecap.kt)
    const cover = s.find((x) => x.kind === 'today')?.picks[0]?.uri;
    if (cover) ClipEmbedder?.setRecapCover(cover);
    // and Sunday noon's shows the week's dump
    const week = s.find((x) => x.kind === 'recap' && x.id.startsWith('recap:week:'));
    if (week?.picks[0]) ClipEmbedder?.setWeekRecap?.(week.picks[0].uri, week.id);
  };
  // dumps made from Discover stories rank their kind of story up
  const made = useCallback(async () => (await listDumps().catch(() => [])).flatMap((d) => (d.storyId ? [d.storyId] : [])), []);
  const build = useCallback(async (lib: Library) => buildStories(lib, undefined, limit.current, { ...await getProfile(), made: await made() }), [made]);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [paused, setPaused] = useState<{ done: number; total: number } | null>(null);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [limited, setLimited] = useState(false);
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
      await whenReady('vision'); // release builds download it after the install; Discover shows the download meanwhile
      // No dumps up (first run, Reindex, back after leaving mid-index, relaunch after a kill): show the strip now, not
      // after the photo listing and the first batch, or Discover says "No dumps yet" in between.
      if (empty || !shown.current.length) setProgress((p) => p ?? { done: 0, total: empty ? known.current : 0, etaSec: null, since: 0 });
      // Newest photos index first, so rebuilding as each batch lands surfaces today's stories long before a big first index
      // ends: every 2 s until there's a dump up (nothing on screen to jank), then every 30 s. A rebuild takes ~2 s at 4k
      // photos on an A54 and grows with the library, so back off to keep the JS thread mostly free, and wait while the user
      // scrolls or taps: a 2 s stall mid-scroll is the jank people notice.
      const t0 = Date.now();
      let lastShow = t0;
      let showing = false;
      const added = await indexLibrary((done, total, last, bg) => {
        const elapsed = Date.now() - t0;
        const etaSec = bg ? bg.etaSec : done >= 32 ? ((total - done) * elapsed) / done / 1000 : null;
        setProgress({ done, total, etaSec, since: last.creationTime, batteryPct: bg ? bg.batteryPct : undefined });
        if (!showing && !touching() && Date.now() - lastShow > Math.max(shown.current.length ? 30000 : 2000, 5 * showCost)) {
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
  }, [build]);

  /** granted, as of the last ask (the foreground check reads it before a re-render) */
  const granted = useRef(false);
  const asking = useRef<Promise<void> | null>(null);
  /** "Onboarding every launch" over a completed onboarding: finishing it is a normal launch, whatever the slides did */
  const replaying = useRef(false);
  // one at a time: Home's ask and the foreground check can both land as the dialog closes
  const start = useCallback((request = true) => asking.current ??= (async () => {
    const perm = request ? await GalleryService.requestPermissions() : (await GalleryService.checkPermissions()).granted;
    granted.current = perm;
    setPermission(perm);
    GalleryService.checkPermissions().then((p) => setLimited(p.limited), () => {});
    if (perm) refreshStories();
  })().finally(() => { asking.current = null; }), [refreshStories]);

  useEffect(() => {
    (async () => {
      // also warms profileNow() (new-dump size / frame defaults) before anything reads it
      const prof = await getProfile().catch(() => null);
      // first run: init waits for the end of onboarding (finishOnboarding); onboarding's notifications step asks.
      // Developer tools' "Onboarding every launch" takes the first-run path every time.
      const replay = __DEV__ && !!prof?.onboardingEveryLaunch;
      const completed = await OnboardingService.hasCompletedOnboarding();
      replaying.current = replay && completed;
      if (!replay && completed) { await NotificationService.init(); start(); }
      else setOnboarding(true);
    })();
  }, [start]);

  // Back in front: pick up photos taken / deleted meanwhile (a quick diff when nothing changed), and merge what the
  // background worker indexed. Always a sync: Discover keeps its order (a reshuffle remounts every tile, reloading
  // every photo) and the JS thread skips a rebuild from the index it already shows.
  // Denied: allowed in Settings meanwhile? Then start (a check, never a dialog).
  useEffect(() => {
    if (permission == null) return; // onboarding: nothing to read yet
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      // also picks up "Allow all" (or more picked photos) chosen in Settings
      GalleryService.checkPermissions().then((p) => {
        setLimited(p.limited);
        if (!permission && p.granted && !granted.current) start();
      }, () => {});
      if (permission) refreshStories(true);
    });
    return () => sub.remove();
  }, [refreshStories, permission, start]);

  useEffect(() => {
    const sub = addShareIntentListener((e) => { console.log(`[share] received ${e.uris.length} (${e.action})`); setIncoming(e); });
    return () => sub.remove();
  }, []);

  // photos sort by created, so the first dated one is the oldest; progress.since is fresher than the 30 s rebuilds
  const oldest = useMemo(() => library?.photos.find((p) => p.creationTime >= DATED)?.creationTime ?? Infinity, [library]);
  const edge = Math.min(oldest, progress && progress.since >= DATED ? progress.since : Infinity);

  const value = useMemo<AppStateValue>(() => ({
    library, stories, loaded, moreStories: Math.max(0, available - stories.length),
    showMoreStories: async () => {
      if (!library?.photos.length) return; // mid-Reindex: keep the old dumps
      limit.current += STORY_PAGE;
      setStories(await build(library));
    }, paused, permission, limited, onboarding, incoming, refreshStories,
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
    start,
    askPhotos: async () => { if ((await GalleryService.checkPermissions()).canAskAgain) await start(); else Linking.openSettings(); },
    // done only here, at the real end: killed mid-way (recap ask, profile), onboarding shows again
    finishOnboarding: async (started) => {
      await OnboardingService.setOnboardingCompleted();
      setOnboarding(false);
      if (replaying.current) {
        // as the completed path at launch does: start() reads the real permission (no flip to false over granted access)
        replaying.current = false;
        await NotificationService.init();
        if (!started) start();
        return;
      }
      if (!started) setPermission(false); // Android just said no: Home offers it again (askPhotos), not a second dialog now
      await NotificationService.init();
    },
    showOnboarding: () => setOnboarding(true),
  }), [library, stories, available, loaded, paused, permission, limited, onboarding, incoming, refreshStories, start, build]);
  const progressValue = useMemo(() => ({ progress, coverageSince: edge === Infinity ? null : edge }), [progress, edge]);

  return <Ctx.Provider value={value}><ProgressCtx.Provider value={progressValue}>{children}</ProgressCtx.Provider></Ctx.Provider>;
}

export function useApp(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppStateProvider');
  return v;
}

export const useProgress = () => useContext(ProgressCtx);

/** next's stories in prev's order; new ones go in at their rank in next (a gallery sync shouldn't reshuffle Discover). */
export function keepOrder<S extends { id: string }>(prev: S[], next: S[]): S[] {
  const at = new Map(prev.map((s, i) => [s.id, i]));
  const out = next.filter((s) => at.has(s.id)).sort((a, b) => at.get(a.id)! - at.get(b.id)!);
  next.forEach((s, i) => { if (!at.has(s.id)) out.splice(Math.min(i, out.length), 0, s); });
  return out;
}
