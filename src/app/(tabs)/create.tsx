import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, GestureResponderEvent, Keyboard, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Animated from 'react-native-reanimated';
import { useApp, useProgress } from '../../state/AppState';
import { usePro } from '../../state/Pro';
import { embedText, IndexedPhoto } from '../../services/index/photoIndex';
import { parseQuery, placeIndex, searchLibrary } from '../../services/stories/search';
import { expandQuery, Expanded, langName, useLangStates } from '../../services/index/queryLang';
import { FillSet, fillSets, similarTo } from '../../services/stories/suggest';
import { capitalize, dateRange } from '../../services/stories/titles';
import { createDraft, currentCreateDraft, DumpPhoto, get, remove, setCurrentCreateDraft, update } from '../../services/dumps';
import { photoRange } from '../../services/dumpLabels';
import { getProfile } from '../../services/profile';
import { useTheme } from '../../theme/ThemeProvider';
import { caps, display, label, ui } from '../../theme/type';
import { AvatarButton } from '../../components/ui/TopHeader';
import { FrameCard } from '../../components/ui/FrameCard';
import { PhotoStack } from '../../components/ui/PhotoStack';
import { Sheet } from '../../components/ui/Sheet';
import { Tap } from '../../components/ui/Tap';
import { PhotoViewer } from '../../components/ui/PhotoViewer';
import { Icons } from '../../components/ui/Icons';
import { StatusScrim } from '../../components/ui/Screen';
import { SetsSheet, SetsTile } from '../../components/create/SetsSheet';
import { useBasketThrow } from '../../components/create/BasketThrow';
import { PickRow } from '../../components/create/PickRow';
import { ModelLoading } from '../../components/ModelLoading';
import { useModels } from '../../state/models';
import { tr } from '../../i18n';

const RECENTS_KEY = '@daydump_recent_searches';

const toPhoto = (p: IndexedPhoto, suggested?: boolean): DumpPhoto =>
  ({ id: p.id, uri: p.uri, created: p.creationTime, ...(suggested ? { suggested } : null) });
const GAP = 6;
/** The search in Title Case; no search -> undefined, and createDraft names it by the photos' date range. */
const dumpTitle = (q: string) => (q.trim() ? q.trim().split(/\s+/).map(capitalize).join(' ') : undefined);

/** One CLIP text vector per query text (the grid re-searches whenever indexing rebuilds the library). */
const textVecs = new Map<string, Promise<Float32Array | null>>();
const vecFor = (text: string) => {
  if (!textVecs.has(text)) textVecs.set(text, embedText(text).catch(() => { textVecs.delete(text); return null; })); // retry once the model arrives
  return textVecs.get(text)!;
};

/** Search field with the recent-searches dropdown (only while focused). */
function SearchBar({ query, searching, onQuery, onCommit, recents, suggestions, onRemoveRecent, right, locked, onLocked }: {
  query: string; searching: boolean; onQuery: (q: string) => void; onCommit: (q: string) => void;
  recents: string[]; suggestions: string[]; onRemoveRecent: (q: string) => void; right?: React.ReactNode;
  /** search is Pro: the field can't take focus, and a tap on it opens the paywall instead */
  locked: boolean; onLocked: () => void;
}) {
  const { t } = useTheme();
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  // what the blur saves to recents: the picked row, not the text before it (setQuery hasn't landed yet)
  const last = useRef(query);
  useEffect(() => { last.current = query; }, [query]);
  // Android Back hides the keyboard without blurring: close the dropdown with it
  useEffect(() => { const k = Keyboard.addListener('keyboardDidHide', () => input.current?.blur()); return () => k.remove(); }, []);
  // Pro lapsed while typing: let the field go
  useEffect(() => { if (locked) input.current?.blur(); }, [locked]);
  const pick = (q: string) => { onQuery(q); last.current = q; input.current?.blur(); Keyboard.dismiss(); };
  const rows = recents.length ? recents.slice(0, 4) : suggestions;
  // the dropdown is the field's sibling, not its child: Android leaves views outside their parent's bounds out of the
  // accessibility tree (TalkBack, Maestro), so it hangs off the screen root at the field's y + 44
  const [top, setTop] = useState(0);
  return (
    <>
      <View onLayout={(e) => setTop(e.nativeEvent.layout.y + 44)} style={{ marginHorizontal: 16, marginBottom: 8, zIndex: 30, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FrameCard radius={16} style={[{ flex: 1, height: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, focused ? { borderColor: t.ink } : null]}>
          {searching ? <ActivityIndicator size={16} color={t.inkMuted} accessibilityLabel={tr('create.searching')} /> : <Icons.search size={16} color={t.inkMuted} />}
          <TextInput
            ref={input}
            value={query}
            onChangeText={onQuery}
            editable={!locked}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); onCommit(last.current); }}
            onSubmitEditing={() => onCommit(query)}
            placeholder={tr('create.searchPlaceholder')}
            placeholderTextColor={t.inkMuted}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={[ui(12, 500), { flex: 1, color: t.ink, padding: 0 }]}
          />
          {/* over the field, not a focus handler: focusing first would flash the keyboard */}
          {locked ? (
            <Tap onPress={onLocked} accessibilityRole="button" accessibilityLabel={tr('create.search')} accessibilityHint={tr('create.searchProHint')}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          ) : null}
          {query ? (
            <Tap onPress={() => onQuery('')} accessibilityRole="button" accessibilityLabel={tr('create.clearSearch')} hitSlop={8} style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
              <Icons.close size={12} color={t.inkMuted} />
            </Tap>
          ) : null}
        </FrameCard>
        {right}
      </View>
      {focused && rows.length ? (
        <FrameCard radius={16} padding={8} style={{ position: 'absolute', top, left: 16, right: 16, zIndex: 30, borderColor: t.borderStrong, boxShadow: `${t.shadowCard}, 0 10px 15px -3px rgba(0,0,0,0.1)` }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 6, paddingBottom: 4 }}>
            <Text style={[label(9.5, 0.12), { color: t.inkMuted }]}>{caps(recents.length ? tr('create.lastSearches') : tr('create.trySuggestions'))}</Text>
            <Tap onPress={() => { input.current?.blur(); Keyboard.dismiss(); }} hitSlop={8} accessibilityRole="button">
              <Text style={[ui(10, 600), { color: t.ink, textDecorationLine: 'underline' }]}>{tr('common.close')}</Text>
            </Tap>
          </View>
          {rows.map((q) => (
            <Tap key={q} onPress={() => pick(q)} accessibilityRole="button" accessibilityLabel={tr('create.searchQuery', { q })} style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {recents.length ? <Icons.clock size={12} color={t.inkMuted} /> : <Icons.sparkle size={12} color={t.inkMuted} />}
              <Text style={[ui(11.5, 500), { color: t.ink, flex: 1 }]} numberOfLines={1}>{q}</Text>
              {recents.length ? (
                <Tap onPress={() => onRemoveRecent(q)} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('create.removeQuery', { q })} style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
                  <Icons.close size={10} color={t.inkMuted} />
                </Tap>
              ) : null}
            </Tap>
          ))}
        </FrameCard>
      ) : null}
    </>
  );
}

/** 20px corner badge: "+" when not picked, order number (or ✧ for a suggested photo) when picked. */
function Badge({ n, suggested }: { n: number; suggested?: boolean }) {
  const { t } = useTheme();
  const on = n > 0;
  return (
    <View style={[{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' },
      on ? { backgroundColor: t.ink } : { backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' }]}>
      {on && suggested ? <Icons.sparkle size={10} color={t.bgScreen} />
        : <Text style={[ui(9.5, 700), { color: on ? t.bgScreen : '#fff' }]}>{on ? n : '+'}</Text>}
    </View>
  );
}

/** One row of 3 grid photos. */
const GridRow = React.memo(function GridRow({ item, order, basket, w, h, now, onToggle, onOpen }: {
  item: IndexedPhoto[]; order: Map<string, number>; basket: DumpPhoto[]; w: number; h: number; now: number; onToggle: (p: IndexedPhoto, suggested?: boolean, e?: GestureResponderEvent) => void; onOpen: (p: IndexedPhoto) => void;
}) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP }}>
      {item.map((p) => {
        const k = order.get(p.id);
        const date = dateRange(p.creationTime, p.creationTime, now);
        return (
          <Tap key={p.id} onPress={(e) => onToggle(p, false, e)} onLongPress={() => onOpen(p)} delayLongPress={350} accessibilityRole="button" accessibilityState={{ selected: k != null }}
            accessibilityHint={tr('create.holdToEnlarge')} accessibilityLabel={k != null ? tr('create.photoPickedA11y', { date, n: k + 1 }) : tr('create.photoUnpickedA11y', { date })}
            style={[{ width: w, height: h, borderRadius: 12 }, k != null ? { boxShadow: `0 0 0 2px ${t.ink}` } : null]}>
            <View style={{ flex: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: t.borderStrong }}>
              <Image source={{ uri: p.uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={p.id} transition={100} />
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 4, experimental_backgroundImage: 'linear-gradient(0deg, rgba(0,0,0,0.6), rgba(0,0,0,0))' }}>
                <Text style={[ui(8.5, 500), { color: '#fff' }]} numberOfLines={1}>{date}</Text>
              </View>
            </View>
            <Badge n={k != null ? k + 1 : 0} suggested={k != null && basket[k].suggested} />
          </Tap>
        );
      })}
    </View>
  );
}, (a, b) => a.w === b.w && a.h === b.h && a.now === b.now && a.onToggle === b.onToggle && a.onOpen === b.onOpen
  // a pick redraws only the rows whose badges change; a library rebuild (new photo objects, same photos) redraws none
  && a.item.length === b.item.length && a.item.every((p, i) => p.id === b.item[i].id && p.uri === b.item[i].uri
    && badge(p.id, a.order, a.basket) === badge(p.id, b.order, b.basket)));
/** What a grid photo's badge shows: 0 = not picked, n = picked n-th, -n = picked n-th by Suggest. */
const badge = (id: string, order: Map<string, number>, basket: DumpPhoto[]) => {
  const k = order.get(id);
  return k == null ? 0 : basket[k].suggested ? -(k + 1) : k + 1;
};

/** "Similar to your picks": the "N sets" tile, then a strip of photos to add (the grid's look, smaller). */
const SimilarStrip = React.memo(function SimilarStrip({ photos, sets, onSets, onAdd, onOpen }: {
  photos: IndexedPhoto[]; sets: FillSet[]; onSets: () => void;
  onAdd: (p: IndexedPhoto, suggested: boolean, e?: GestureResponderEvent) => void; onOpen: (photos: IndexedPhoto[], p: IndexedPhoto) => void;
}) {
  const { t } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: GAP, paddingBottom: 4 }}>
      {sets.length ? <SetsTile sets={sets} onPress={onSets} /> : null}
      {photos.map((p) => (
        <Tap key={p.id} onPress={(e) => onAdd(p, true, e)} onLongPress={() => onOpen(photos, p)} delayLongPress={350}
          accessibilityRole="button" accessibilityLabel={tr('create.addSimilarPhoto')} accessibilityHint={tr('create.holdToEnlarge')}
          style={{ width: 62, height: 64, borderRadius: 11, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', backgroundColor: t.borderStrong }}>
          <Image source={{ uri: p.uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={p.id} />
          <View style={{ position: 'absolute', top: 4, right: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.65)' }}>
            <Text style={[ui(8, 600), { color: '#fff' }]}>{tr('create.addBtn')}</Text>
          </View>
        </Tap>
      ))}
    </ScrollView>
  );
});

/** "Your gallery (N)"; while indexing, how many are read so far. Its own component: progress ticks every batch. */
function GalleryCount({ n }: { n: number }) {
  const { progress } = useProgress();
  return <>{progress ? tr('create.galleryReadProgress', { done: progress.done.toLocaleString() }) : tr('create.galleryCount', { count: n })}</>;
}

type PicksHandle = { open: () => void; close: () => void };

/** "Your picks": its own component, so opening it and selecting photos re-render the sheet, not all of Create. */
function PicksSheet({ ref, basket, onChange, onMove, onGo, onStartNew, onView }: {
  ref: React.Ref<PicksHandle>; basket: DumpPhoto[]; onChange: (next: DumpPhoto[]) => void; onMove: (id: string, by: number) => void;
  onGo: () => void; onStartNew: () => void; onView: (photos: DumpPhoto[], id: string) => void;
}) {
  const { t } = useTheme();
  const winH = useWindowDimensions().height;
  const [review, setReview] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({ open: () => { setSel(null); setReview(true); }, close: () => setReview(false) }), []);
  return (
    <Sheet visible={review} onClose={() => setReview(false)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[ui(13, 700), { color: t.ink }]}>{tr('create.yourPicks', { count: basket.length })}</Text>
        <Tap onPress={() => setReview(false)} hitSlop={8} accessibilityRole="button">
          <Text style={[ui(11), { color: t.inkMuted, textDecorationLine: 'underline' }]}>{tr('create.hide')}</Text>
        </Tap>
      </View>
      {basket.length ? (
        <>
          {(() => {
            const k = basket.findIndex((p) => p.id === sel);
            return k < 0 ? null : (
              <Tap onPress={() => onView(basket, basket[k].id)} accessibilityRole="button" accessibilityLabel={tr('create.enlargePhoto', { n: k + 1 })}
                style={{ height: Math.round(winH * 0.3), borderRadius: 14, overflow: 'hidden', backgroundColor: t.borderStrong }}>
                <Image source={{ uri: basket[k].uri }} style={{ flex: 1 }} contentFit="contain" recyclingKey={basket[k].id} transition={100} />
                <View style={{ position: 'absolute', right: 8, bottom: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                  <Icons.expand size={14} color="#fff" />
                </View>
              </Tap>
            );
          })()}
          <PickRow photos={basket} sel={sel} onSelect={setSel} onRemove={(id) => onChange(basket.filter((x) => x.id !== id))} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[[tr('create.moveEarlier'), -1], [tr('create.moveLater'), 1]].map(([text, by]) => {
              const i = basket.findIndex((p) => p.id === sel);
              const off = i < 0 || i + (by as number) < 0 || i + (by as number) >= basket.length;
              return (
                <FrameCard key={text as string} radius={14} onPress={off ? undefined : () => onMove(sel!, by as number)} label={text as string}
                  style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.4 : 1 }}>
                  <Text style={[ui(11.5, 600), { color: t.ink }]}>{text}</Text>
                </FrameCard>
              );
            })}
          </View>
          <Text style={[ui(10.5), { color: t.inkMuted }]}>{basket.some((p) => p.id === sel) ? tr('create.picksSelectedHint') : tr('create.picksHint')}</Text>
          <Tap onPress={onGo} accessibilityRole="button" style={{ height: 40, borderRadius: 20, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
            <Text style={[ui(12, 600), { color: t.bgScreen }]}>{tr('create.continueToEditCount', { count: basket.length })}</Text>
          </Tap>
          <Tap onPress={onStartNew} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 6 }}>
            <Text style={[ui(11, 500), { color: t.inkMuted }]}>{tr('create.startNewDump')}</Text>
          </Tap>
        </>
      ) : (
        <Text style={[ui(12), { color: t.inkMuted, paddingVertical: 12 }]}>{tr('create.nothingPicked')}</Text>
      )}
    </Sheet>
  );
}

/** Create (ph3.png): search the library, pick photos into the basket (auto-saved Create draft), Continue to Edit. */
export default function Create() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  // indexing rebuilds the library every 15 s; a hidden Create is frozen (freezeOnBlur), so it re-searches only once shown
  const { library: lib, permission, askPhotos } = useApp();
  const pro = usePro();
  const { shared } = useLocalSearchParams<{ shared?: string }>();

  const [query, setQuery] = useState('');
  // photos, not library rows: indexing rebuilds the library under a running search
  const [rows, setRows] = useState<IndexedPhoto[] | null>(null);
  // search is Pro: a lapse mid-session drops the query, so its results don't stay up (set while rendering, not in an effect)
  const locked = !pro.isPro;
  const [wasLocked, setWasLocked] = useState(locked);
  if (locked !== wasLocked) {
    setWasLocked(locked);
    if (locked) { setQuery(''); setRows(null); }
  }
  const [qvec, setQvec] = useState<Float32Array | null>(null);
  const [wordsSkipped, setWordsSkipped] = useState(false); // the search had words but no text vector
  const [expanded, setExpanded] = useState<Expanded | null>(null); // translations searched too (index/queryLang.ts)
  const langStates = useLangStates();
  // release builds download the models after the install: vision (the library itself), then faces, then text (words)
  const models = useModels('text');
  const textReady = models?.text.state === 'ready';
  const [recents, setRecents] = useState<string[]>([]);
  const [basket, setBasket] = useState<DumpPhoto[]>([]);
  const [similar, setSimilar] = useState<IndexedPhoto[]>([]);
  const [sets, setSets] = useState<FillSet[]>([]);
  /** the sets as the sheet opened with them (null = closed) */
  const [setsOpen, setSetsOpen] = useState<FillSet[] | null>(null);
  const picks = useRef<PicksHandle>(null);
  /** the enlarged photo: a copy of the list it was opened from, so a re-search or a removal doesn't shift it */
  const [viewing, setViewing] = useState<{ photos: DumpPhoto[]; i: number } | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  /** false until the draft is read: the footer stays hidden rather than flash an empty 0/6 basket */
  const [loaded, setLoaded] = useState(false);

  // ---- the Create draft: saved on every basket change, one write at a time ----
  const draftId = useRef<string | null>(null);
  /** the draft's title is its photos' date range (no search named it) */
  const autoTitle = useRef(false);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const persist = (photos: DumpPhoto[], title?: string) => {
    saving.current = saving.current.then(async () => {
      const id = draftId.current;
      if (!photos.length) {
        // An emptied basket isn't a draft any more (decisions.md: a draft starts at ≥1 photo), unless it was worked
        // on in Edit (layout, filter, caption, size): that one stays in Drafts and is only unlinked from Create.
        if (id) {
          const d = await get(id);
          const { ratio } = await getProfile();
          if (d?.status === 'draft' && !d.layout && !d.filter && !d.caption && d.ratio === ratio) await remove(id);
          await setCurrentCreateDraft(null);
          draftId.current = null;
        }
        return;
      }
      // an untitled draft is named by its photos' range; keep that name in step with the photos
      const auto = !title && autoTitle.current ? photoRange({ photos, created: Date.now() }) : null;
      const d = id ? await update(id, { photos, ...(title ? { title } : auto ? { title: auto } : null) }) : null;
      if (title) autoTitle.current = false;
      if (d?.status === 'draft') return;
      // first photo, or the draft was deleted / posted meanwhile: a new one
      const named = title ?? dumpTitle(query);
      const n = await createDraft({ source: 'create', title: named, photos });
      autoTitle.current = !named;
      draftId.current = n.id;
      await setCurrentCreateDraft(n.id);
      console.log(`[create] draft ${n.id} started`);
    }).catch((e) => console.warn('[create] save failed:', e));
    return saving.current;
  };
  const edits = useRef(0);
  const change = (next: DumpPhoto[]) => { edits.current++; setBasket(next); persist(next); };

  const load = useCallback(async () => {
    const e = edits.current;
    await saving.current;
    const d = await currentCreateDraft().catch(() => null);
    setLoaded(true);
    // a tap while this loaded is newer than what was read: keep it (its save is already queued)
    if (e !== edits.current) return;
    draftId.current = d?.id ?? null;
    autoTitle.current = !!d && d.title === photoRange(d);
    // the same picks as on screen (every tab switch back): keep the array, so the screen doesn't re-render
    const next = d?.photos ?? [];
    setBasket((b) => (JSON.stringify(b) === JSON.stringify(next) ? b : next));
  }, []);
  // `shared` changes when photos are shared in while Create is already open: reload then too.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { load(); }, [load, shared]));

  // ---- recent searches ----
  useEffect(() => { AsyncStorage.getItem(RECENTS_KEY).then((v) => setRecents(v ? JSON.parse(v) : []), () => {}); }, []);
  const editRecents = (f: (r: string[]) => string[]) => setRecents((r) => {
    const n = f(r);
    if (n !== r) AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(n)).catch(() => {});
    return n;
  });
  /** Searches are remembered when they're submitted, picked, or left by tapping away (newest first, 5 kept). */
  const commit = (q: string) => {
    const s = q.trim().toLowerCase();
    // "red" replaces the "r" a tap-away saved mid-typing
    if (s) editRecents((r) => (r[0] === s ? r : [s, ...r.filter((x) => !s.startsWith(x))].slice(0, 5)));
  };
  /** First-time hints: a place from the library, a season, a thing. */
  const suggestions = useMemo(() => {
    if (!lib) return [];
    const places = [...placeIndex(lib).entries()].sort((a, b) => b[1].size - a[1].size).map(([k]) => k);
    const season = [tr('create.seasons.winter'), tr('create.seasons.spring'), tr('create.seasons.summer'), tr('create.seasons.autumn')][Math.floor(((new Date().getMonth() + 1) % 12) / 3)];
    return [places[1] ?? places[0], tr('create.seasonSunset', { season }), tr('create.coffeeWithFriends')].filter((x): x is string => !!x);
  }, [lib]);

  // ---- search: parse, embed the CLIP words, filter + rank (150 ms after typing stops) ----
  const [searched, setSearched] = useState<string | null>(null); // the query `rows` are for
  const searching = !!lib && searched !== query;
  useEffect(() => {
    if (!lib) return;
    let live = true;
    const h = setTimeout(async () => {
      const t0 = Date.now();
      const places = placeIndex(lib);
      const q = parseQuery(query, (n) => places.has(n));
      const x = q.clip ? await expandQuery(q.clip) : null;
      const vs = x ? await Promise.all(x.texts.map(vecFor)) : [];
      const v = vs[0] ?? null;
      if (!live) return;
      const r = searchLibrary(lib, q, vs.filter((y): y is Float32Array => !!y));
      if (__DEV__ && query) console.log(`[create] "${query}" -> places ${JSON.stringify(q.places)} months ${q.months ? [...q.months] : '-'} years ${q.years ? [...q.years] : '-'} clip ${JSON.stringify(x?.texts ?? [])}: ${r.length} in ${Date.now() - t0} ms`);
      setRows(r.map((i) => lib.photos[i]));
      setQvec(v);
      setExpanded(x);
      setWordsSkipped(!!q.clip && !v);
      setSearched(query);
    }, query ? 150 : 0);
    return () => { live = false; clearTimeout(h); };
  }, [query, lib, textReady, langStates]);

  // ---- "Similar to your picks" and its sets (300 ms after the basket settles) ----
  const basketKey = basket.map((p) => p.id).join(',');
  useEffect(() => {
    if (!lib || !basket.length) return;
    const h = setTimeout(() => {
      const t0 = Date.now();
      const ids = basket.map((p) => p.id);
      setSimilar(similarTo(lib, ids, 8, qvec));
      const s = fillSets(lib, ids);
      setSets(s);
      console.log(`[create] similar + ${s.length} sets (${s.map((x) => x.photos.length).join('/')}) to ${basket.length} in ${Date.now() - t0} ms`);
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basketKey, lib, qvec]);

  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => { a.remove(); b.remove(); };
  }, []);

  const order = useMemo(() => new Map(basket.map((p, i) => [p.id, i])), [basket]);
  const suggestedN = basket.filter((p) => p.suggested).length;
  const { root: screenRoot, stack: basketStack, throwIn, layer: throwLayer, stackStyle, countStyle } = useBasketThrow();
  /** `e` = the tap on a grid / Similar photo: adding it tosses it into the basket */
  const toggle = (p: DumpPhoto, e?: GestureResponderEvent) => {
    const next = order.has(p.id) ? basket.filter((x) => x.id !== p.id) : [...basket, p];
    if (next.length > basket.length) throwIn(p.uri, e, basket.length);
    change(next);
  };
  const move = (id: string, by: number) => {
    const i = basket.findIndex((p) => p.id === id), j = i + by;
    if (i < 0 || j < 0 || j >= basket.length) return;
    const next = [...basket];
    [next[i], next[j]] = [next[j], next[i]];
    change(next);
  };

  const going = useRef(false);
  const go = async () => {
    if (!basket.length || going.current) return;
    going.current = true;
    try {
      picks.current?.close();
      await persist(basket, query.trim() ? dumpTitle(query) : undefined);
      if (draftId.current) router.push({ pathname: '/edit/[id]', params: { id: draftId.current } });
    } finally { going.current = false; }
  };
  const startNew = async () => {
    picks.current?.close();
    await saving.current;
    await setCurrentCreateDraft(null).catch(() => {});
    draftId.current = null;
    setBasket([]);
  };

  // ---- grid ----
  const cellW = (win.width - 32 - 2 * GAP) / 3;
  const cellH = Math.round((cellW * 76) / 110);
  const gridRows = useMemo(() => {
    const out: IndexedPhoto[][] = [];
    for (let i = 0; i < (rows?.length ?? 0); i += 3) out.push(rows!.slice(i, i + 3));
    return out;
  }, [rows]);
  const [now] = useState(Date.now);
  // the grid only re-renders when the basket or the results change, not per keystroke / keyboard toggle
  const toggleRef = useRef(toggle);
  useEffect(() => { toggleRef.current = toggle; });
  const onToggle = useCallback((p: IndexedPhoto, suggested?: boolean, e?: GestureResponderEvent) => toggleRef.current(toPhoto(p, suggested), e), []);
  const view = useCallback((photos: DumpPhoto[], id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setViewing({ photos, i: Math.max(0, photos.findIndex((p) => p.id === id)) });
  }, []);
  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; });
  const onOpen = useCallback((p: IndexedPhoto) => view((rowsRef.current ?? []).map((x) => toPhoto(x)), p.id), [view]);
  const onOpenSimilar = useCallback((ps: IndexedPhoto[], p: IndexedPhoto) => view(ps.map((x) => toPhoto(x, true)), p.id), [view]);
  const setsRef = useRef(sets);
  useEffect(() => { setsRef.current = sets; });
  const onSets = useCallback(() => setSetsOpen(setsRef.current), []);
  const renderRow = useCallback(({ item }: { item: IndexedPhoto[] }) => (
    <GridRow item={item} order={order} basket={basket} w={cellW} h={cellH} now={now} onToggle={onToggle} onOpen={onOpen} />
  ), [order, basket, cellW, cellH, now, onToggle, onOpen]);

  // a search language this query may be in isn't downloaded yet: say it's searched as typed for now
  const pending = query.trim() && expanded?.pending.length ? (() => {
    const failed = expanded.pending.some((l) => langStates[l] === 'failed');
    const names = expanded.pending.map(langName).join(', ');
    return failed ? tr('create.langDownloadFailed', { names })
      : tr('create.langDownloading', { names });
  })() : null;
  const langNote = pending ? (
    <Text style={[ui(10.5), { color: t.inkMuted, marginBottom: 6, paddingHorizontal: 2 }]}>{pending}</Text>
  ) : null;

  const header = (
    <View>
      {langNote}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingHorizontal: 2, gap: 8 }}>
        <Text style={[label(9.5, 0.11), { color: t.inkMuted, flexShrink: 1 }]} numberOfLines={2}>
          {query.trim() ? tr('create.matchesFor', { query: query.trim(), count: rows?.length ?? 0 }) : <GalleryCount n={rows?.length ?? 0} />}
        </Text>
        <Text style={[ui(9.5), { color: t.inkMuted }]}>{tr('create.holdToEnlarge')}</Text>
      </View>
    </View>
  );

  const empty = permission === false ? (
    <FrameCard padding={16} style={{ gap: 8 }}>
      <Text style={[display(18), { color: t.ink }]}>{tr('create.permissionTitle')}</Text>
      <Text style={[ui(12), { color: t.inkMuted }]}>{tr('create.permissionBody')}</Text>
      <Tap onPress={askPhotos} accessibilityRole="button" style={{ alignSelf: 'flex-start', height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.ink, justifyContent: 'center' }}>
        <Text style={[ui(12, 600), { color: t.bgScreen }]}>{tr('create.allowPhotos')}</Text>
      </Tap>
    </FrameCard>
  ) : models && models.vision.state !== 'ready' && !lib?.photos.length ? (
    <ModelLoading pack="vision" s={models.vision} />
  ) : query.trim() && wordsSkipped && models && !textReady ? (
    <ModelLoading pack="text" s={models.text} />
  ) : rows == null ? (
    <Text style={[ui(12), { color: t.inkMuted, padding: 8 }]}>{tr('create.loadingPhotos')}</Text>
  ) : (
    <FrameCard padding={16} style={{ gap: 6 }}>
      {(() => {
        const [title, body] = query.trim()
            ? [tr('create.noMatchesTitle'), tr('create.noMatchesBody', { query: query.trim() })]
            : [tr('create.noPhotosTitle'), tr('create.noPhotosBody')];
        return (
          <>
            <Text style={[display(18), { color: t.ink }]}>{title}</Text>
            <Text style={[ui(12), { color: t.inkMuted }]}>{body}</Text>
            {query.trim() && pending ? <Text style={[ui(12), { color: t.inkMuted }]}>{pending}</Text> : null}
          </>
        );
      })()}
    </FrameCard>
  );

  // +10: the avatar, centred on the 40px search bar, lands where Discover's header puts it (top + 12)
  return (
    <View ref={screenRoot} style={{ flex: 1, paddingTop: insets.top + 10 }}>
      <SearchBar query={query} searching={searching} onQuery={setQuery} onCommit={commit} recents={recents} suggestions={suggestions}
        right={<AvatarButton onPress={() => router.push('/profile')} />}
        onRemoveRecent={(q) => editRecents((r) => r.filter((x) => x !== q))}
        locked={locked} onLocked={() => pro.openPaywall('search')} />

      <FlatList
        // new results start at the top and mount only the first screen, not the old scroll window (~750 ms)
        key={searched ?? ''}
        data={gridRows}
        keyExtractor={(r) => r[0].id}
        renderItem={renderRow}
        extraData={order}
        ListHeaderComponent={rows?.length ? header : null}
        ListEmptyComponent={empty}
        getItemLayout={(_, i) => ({ length: cellH + GAP, offset: (cellH + GAP) * i, index: i })}
        initialNumToRender={8}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
        style={{ flex: 1, opacity: searching && rows ? 0.4 : 1 }}
      />

      {keyboard ? null : (
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, opacity: loaded ? 1 : 0 }}>
          {basket.length && (similar.length || sets.length) ? (
            <View style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 20, paddingHorizontal: 2 }}>
                <Icons.sparkle size={12} color={t.ink} />
                <Text style={[label(9.5, 0.11), { color: t.inkMuted, flexShrink: 1 }]} numberOfLines={1}>{caps(tr('create.similarToPicks'))}</Text>
              </View>
              <View style={{ marginTop: 4 }}><SimilarStrip photos={similar} sets={sets} onSets={onSets} onAdd={onToggle} onOpen={onOpenSimilar} /></View>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <FrameCard radius={16} onPress={() => picks.current?.open()} label={tr('create.picksReviewLabel', { count: basket.length })}
              style={{ paddingVertical: 4, paddingRight: 12, paddingLeft: 6, flexDirection: 'row', alignItems: 'center', gap: 10, boxShadow: `${t.shadowCard}, 0 4px 6px -1px rgba(0,0,0,0.1)` }}>
              <View ref={basketStack}>
                <Animated.View style={stackStyle}>
                  <PhotoStack kind="basket" uris={basket.length ? basket.slice(0, 2).map((p) => p.uri) : ['', '']} />
                  <Animated.View style={[{ position: 'absolute', top: -4, right: -4, paddingHorizontal: 6, borderRadius: 9, backgroundColor: t.ink, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }, countStyle]}>
                    <Text style={[ui(9, 700), { color: t.bgScreen }]}>{basket.length}</Text>
                  </Animated.View>
                </Animated.View>
              </View>
              <View>
                <Text style={[ui(11, 700), { color: t.ink }]}>{tr('create.picks')}</Text>
                {suggestedN ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Text style={[ui(9.5), { color: t.inkMuted }]}>{basket.length - suggestedN} + {suggestedN}</Text>
                    <Icons.sparkle size={9} color={t.inkMuted} />
                    <Text style={[ui(9.5), { color: t.inkMuted }]}> · {tr('create.review')}</Text>
                  </View>
                ) : <Text style={[ui(9.5), { color: t.inkMuted }]}>{tr('create.tapToReview')}</Text>}
              </View>
            </FrameCard>
            <Tap onPress={go} accessibilityRole="button" accessibilityState={{ disabled: !basket.length }} accessibilityLabel={tr('create.continueWithCount', { count: basket.length })}
              style={{ height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: basket.length ? 1 : 0.4, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <Text style={[ui(11, 600), { color: t.bgScreen }]}>{tr('common.continue')}</Text>
              <Icons.arrow size={14} color={t.bgScreen} />
            </Tap>
          </View>
        </View>
      )}

      {throwLayer}
      <PicksSheet ref={picks} basket={basket} onChange={change} onMove={move} onGo={go} onStartNew={startNew} onView={view} />
      <SetsSheet sets={setsOpen} picks={basket.length} inBasket={new Set(order.keys())} onClose={() => setSetsOpen(null)} onView={onOpenSimilar}
        onAdd={(ps) => change([...basket, ...ps.filter((p) => !order.has(p.id)).map((p) => toPhoto(p, true))])} />
      <PhotoViewer photos={viewing?.photos ?? []} index={viewing?.i ?? null} onClose={() => setViewing(null)}
        footer={(p) => {
          const k = order.get(p.id);
          return (
            <Tap onPress={() => toggle(p)} accessibilityRole="button" accessibilityLabel={k == null ? tr('create.addToPicksLabel') : tr('create.removeFromPicks')}
              style={{ height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: k == null ? '#fff' : 'rgba(255,255,255,0.15)' }}>
              {k == null ? <Text style={[ui(13, 600), { color: '#000' }]}>{tr('create.addToPicks')}</Text> : (
                <>
                  <Icons.check size={15} color="#fff" />
                  <Text style={[ui(13, 600), { color: '#fff' }]}>{tr('create.pickNumberRemove', { n: k + 1 })}</Text>
                </>
              )}
            </Tap>
          );
        }} />
      <StatusScrim />
    </View>
  );
}
