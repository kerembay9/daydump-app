import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../state/AppState';
import { markSeen, Story, storyById } from '../../services/stories';
import { suggestSwaps } from '../../services/stories/swaps';
import { Dump, DumpPhoto, draftForStory, get, isDumpId, update } from '../../services/dumps';
import { Crop, Frame, frameOf, frameText, LayoutKey, layoutOf, RATIOS, ratioOf, chunk } from '../../services/layouts';
import { Adjust, editedOwn, filterOf, FilterState, Look, lookFor, lookOf } from '../../services/filters';
import { toneOf } from '../../services/slides';
import type { Library } from '../../services/index/photoIndex';
import type { PhotoAsset } from '../../types';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { Screen } from '../../components/ui/Screen';
import { Stub } from '../../components/ui/Stub';
import { FrameCard } from '../../components/ui/FrameCard';
import { IconButton } from '../../components/ui/TopHeader';
import { Icons } from '../../components/ui/Icons';
import { Tap } from '../../components/ui/Tap';
import { SlidePager, usePreviewImages } from '../../components/edit/SlidePager';
import { FilterCard } from '../../components/edit/FilterCard';
import { Filmstrip } from '../../components/edit/Filmstrip';
import { FramePanel } from '../../components/edit/FramePanel';

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

const TABS = [['layout', 'Layout'], ['photos', 'Photos']] as const;

/**
 * Size & Edit studio (ph5.png): Layout (ratio, arrangement, frame, crop) and Photos (look, adjust, texture; hold to compare). The id is a dump (Library draft, Reuse copy, share-in draft) or a Discover story,
 * which opens that story's draft (made on first open). Every change auto-saves to the dump.
 */
export default function Edit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { stories, library, loaded } = useApp();
  const [dump, setDump] = useState<Dump | null | undefined>(undefined);

  // A story id needs the stories built (cold deep link); a dump id doesn't. Resolve once per id.
  const story = isDumpId(id) ? undefined : storyById(stories, id);
  const ready = isDumpId(id) || loaded;
  useEffect(() => {
    if (!id || !ready || dump !== undefined) return;
    (async () => {
      const d = story ? await draftForStory(story) : await get(id);
      if (story) markSeen([story.id]);
      // A posted dump is a record of what went out: never auto-save into it. Reuse makes the editable copy.
      if (d?.status === 'posted') return router.replace({ pathname: '/preview/[id]', params: { id: d.id } });
      setDump(d);
    })().catch((e) => { console.warn('[edit] open failed:', e); setDump(null); });
  }, [id, ready, story, dump]);

  if (dump === null) return <Stub back title="Edit" note="This dump is no longer available." />;
  if (dump && !dump.photos.length) return <Stub back title="Edit" note="The photos in this dump are no longer on your phone." />;
  if (!dump) return null;
  return <Studio dump={dump} story={stories.find((s) => s.id === dump.storyId)} library={library} />;
}

type Saved = Pick<Dump, 'title' | 'photos' | 'ratio' | 'fit' | 'layout' | 'filter'>;

/** Debounced auto-save; returns flush(), which saves a pending change now (before Preview reads it, and on close). */
function useAutosave(id: string, value: Saved) {
  const pending = useRef<Saved | null>(null);
  const first = useRef(true);
  const flush = useCallback(async () => {
    const v = pending.current;
    pending.current = null;
    if (v) await update(id, v).catch((e) => console.warn('[edit] save failed:', e));
  }, [id]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    pending.current = value;
    const tm = setTimeout(flush, 400);
    return () => clearTimeout(tm);
  }, [value, flush]);
  useEffect(() => () => { flush(); }, [flush]);
  return flush;
}

const toAsset = (lib: Library | null, p: DumpPhoto): PhotoAsset =>
  lib?.photos.find((x) => x.id === p.id) ?? { id: p.id, uri: p.uri, creationTime: p.created ?? 0, width: 0, height: 0, mediaType: 'photo' };
const fromAsset = (a: PhotoAsset): DumpPhoto => ({ id: a.id, uri: a.uri, created: a.creationTime });

function Studio({ dump, story, library }: { dump: Dump; story?: Story; library: Library | null }) {
  const { t } = useTheme();
  const bottom = useSafeAreaInsets().bottom;
  const [title, setTitle] = useState(dump.title);
  const [photos, setPhotos] = useState(dump.photos);
  const [ratio, setRatio] = useState<string>(ratioOf(dump.ratio).key);
  const [frame, setFrame] = useState<Frame>(frameOf(dump.fit));
  const [tab, setTab] = useState<'layout' | 'photos'>('layout');
  const [layout, setLayout] = useState<LayoutKey>(layoutOf(dump.layout).key);
  const [filter, setFilter] = useState<FilterState>(filterOf(dump.filter));
  const [slide, setSlide] = useState(0);
  /** the filmstrip photo picked by a tap; tapping it again makes it the cover */
  const [sel, setSel] = useState<string | null>(null);

  // a cleared title keeps the last saved one
  const saved = useMemo(() => ({ title: title.trim() || dump.title, photos, ratio, fit: frameText(frame), layout, filter: filter as Record<string, unknown> }),
    [title, dump.title, photos, ratio, frame, layout, filter]);
  const flush = useAutosave(dump.id, saved);
  // Posted from the Preview pushed on top of this Edit: back here would edit the posted record (update() drops it
  // anyway), so leave instead. Reuse makes the editable copy.
  // Photos can also change underneath (shared in with "Add to my draft"): take the saved list back in.
  useFocusEffect(useCallback(() => {
    flush().then(() => get(dump.id)).then((d) => {
      if (d?.status === 'posted') return back();
      if (d?.photos.length) setPhotos((ps) => (ps.map((p) => p.id).join() === d.photos.map((p) => p.id).join() ? ps : d.photos));
    }, () => {});
  }, [dump.id, flush]));

  const slides = useMemo(() => chunk(photos, layout), [photos, layout]);
  const cur = Math.min(slide, slides.length - 1);
  const onSlide = useMemo(() => slides[cur]?.photos ?? [], [slides, cur]);
  const active = useMemo(() => new Set(onSlide.map((p) => p.id)), [onSlide]);
  const images = usePreviewImages(photos.map((p) => p.uri));
  // Photos tab scope: the photo picked in the filmstrip (on this slide) gets its own look; none = the dump's look.
  const target = sel && active.has(sel) ? sel : null;
  const look = target ? lookFor(filter, target) : lookOf(filter);
  const setLook = (l: Look) => setFilter(target ? { ...filter, per: { ...filter.per, [target]: l } } : { ...filter, ...l });
  const unset = (id: string) => {
    const { [id]: _, ...per } = filter.per;
    const { [id]: __, ...adj } = filter.adj;
    setFilter({ ...filter, per, adj });
  };
  // Adjust is always one photo's: the targeted one, else the slide's first
  const focusAt = target ? photos.findIndex((p) => p.id === target) : photos.findIndex((p) => p.id === onSlide[0]?.id);
  const focus = photos[focusAt];
  const focusImage = focus ? images[focus.uri] : null;
  const tone = useMemo(() => (focusImage ? toneOf(focusImage) : null), [focusImage]);
  const setAdj = (a: Adjust) => focus && setFilter({ ...filter, adj: { ...filter.adj, [focus.id]: a } });

  const slideOf = (i: number) => Math.floor(i / layoutOf(layout).n);
  const move = (from: number, to: number) => {
    const next = [...photos];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setPhotos(next);
    setSlide(slideOf(to));
  };
  // First tap selects the photo and shows its slide; only a second tap on that same photo promotes it to cover
  // (Photos tab: lets it go, back to All photos).
  const tap = (i: number) => {
    const id = photos[i].id;
    if (sel === id && active.has(id) && tab === 'photos') return setSel(null);
    if (sel === id && active.has(id) && i > 0) return move(i, 0);
    setSel(id);
    setSlide(slideOf(i));
  };

  // one tap = one Preview: a double tap would push it twice
  const opening = useRef(false);
  const toPreview = () => {
    if (opening.current) return;
    opening.current = true;
    flush().then(() => router.push({ pathname: '/preview/[id]', params: { id: dump.id } }))
      .finally(() => setTimeout(() => { opening.current = false; }, 600));
  };

  const swapsFor = (i: number) => (library ? suggestSwaps(library, photos.map((p) => toAsset(library, p)), toAsset(library, photos[i]), 16).map(fromAsset) : []);
  const addable = () => {
    const have = new Set(photos.map((p) => p.id));
    const fromStory = (story?.photos ?? []).filter((p) => !have.has(p.id)).slice(0, 24).map(fromAsset);
    const ids = new Set(fromStory.map((p) => p.id));
    const similar = library && photos[0] ? suggestSwaps(library, photos.map((p) => toAsset(library, p)), toAsset(library, photos[0]), 16).map(fromAsset).filter((p) => !ids.has(p.id)) : [];
    return [{ title: 'From this story', photos: fromStory }, { title: 'Similar photos', photos: similar }];
  };

  const onCrop = useCallback((id: string, crop: Crop) => setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, crop } : p))), []);
  // Memoised on what it shows and what its handlers read: a Frame slider step re-renders only the slides, not every
  // thumbnail (each with its own Skia canvas and gestures).
  const strip = useMemo(() => (
    <Filmstrip
      photos={photos}
      active={active}
      selected={sel}
      images={images}
      filter={filter}
      onTap={tap}
      onMove={move}
      onRemove={(i) => setPhotos(photos.filter((_, k) => k !== i))}
      onReplace={(i, p) => setPhotos(photos.map((x, k) => (k === i ? p : x)))}
      onAdd={(p) => setPhotos((ps) => (ps.some((x) => x.id === p.id) ? ps : [...ps, p]))}
      swapsFor={swapsFor}
      addable={addable}
    />
  ), [photos, active, sel, images, filter, tab, layout, library, story]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen contentContainerStyle={{ paddingBottom: bottom + 16 }}>
      <View style={{ paddingTop: 2, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconButton label="Back" onPress={back}><Icons.back size={16} /></IconButton>
        <View style={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
          <TextInput value={title} onChangeText={setTitle} onEndEditing={() => { if (!title.trim()) setTitle(dump.title); }}
            testID="edit-title" accessibilityLabel="Dump title" multiline submitBehavior="blurAndSubmit" returnKeyType="done" maxLength={80}
            style={[display(18.5), { color: t.ink, textAlign: 'center', padding: 0, alignSelf: 'stretch' }]} />
        </View>
        <Tap onPress={toPreview}
          accessibilityRole="button" accessibilityLabel="Preview"
          style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[ui(11.5, 600), { color: t.bgScreen }]}>Preview</Text>
          <Icons.arrow size={12} color={t.bgScreen} />
        </Tap>
      </View>

      <FrameCard radius={20} padding={4} style={{ flexDirection: 'row', marginBottom: 8 }}>
        {TABS.map(([k, name]) => {
          const on = tab === k;
          return (
            <Tap key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ flex: 1, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.ink : undefined }}>
              <Text style={[ui(11.5, 600), { color: on ? t.bgScreen : t.ink }]}>{name}</Text>
            </Tap>
          );
        })}
      </FrameCard>

      {tab === 'layout' ? <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
        {RATIOS.map((r) => {
          const on = ratio === r.key;
          const c = on ? t.bgScreen : t.ink;
          return (
            <FrameCard key={r.key} radius={12} onPress={() => setRatio(r.key)} label={`${r.key} ${r.sub}`}
              style={[{ flex: 1, height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }, on ? { backgroundColor: t.ink } : null]}>
              <View style={{ width: r.glyph[0] * 0.75, height: r.glyph[1] * 0.75, borderRadius: 2, borderWidth: 1, borderColor: c, opacity: 0.8 }} />
              <Text style={[ui(11, 700), { color: c }]}>{r.key}</Text>
            </FrameCard>
          );
        })}
      </View> : null}

      <SlidePager slides={slides} ratio={ratio} frame={frame} layout={layout} filter={filter} index={cur} mode={tab}
        images={images} onIndex={setSlide} onLayout={(l) => { setLayout(l); setSlide(0); }}
        onCrop={onCrop} />
      {/* right under the canvas, so the order is on the first screen; the tab's card goes below */}
      {strip}
      {tab === 'photos' ? (
        <FilterCard look={look} photo={!!target} own={!!target && editedOwn(filter, target)} onLook={setLook}
          onAllPhotos={() => setSel(null)} onEvery={() => setFilter({ ...look, per: {}, adj: filter.adj })} onReset={() => target && unset(target)}
          image={focusImage} focus={`Photo ${focusAt + 1}`} adj={(focus && filter.adj[focus.id]) || {}} onAdj={setAdj} tone={tone} />
      ) : (
        <FramePanel frame={frame} onFrame={setFrame} ratio={ratio} layout={layout} />
      )}
    </Screen>
  );
}
