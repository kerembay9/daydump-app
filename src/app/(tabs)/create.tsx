import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, Linking, ScrollView, Text, TextInput, ToastAndroid, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../state/AppState';
import { embedText, IndexedPhoto } from '../../services/index/photoIndex';
import { parseQuery, placeIndex, searchLibrary } from '../../services/stories/search';
import { similarTo } from '../../services/stories/suggest';
import { capitalize, dateRange } from '../../services/stories/titles';
import { createDraft, currentCreateDraft, DumpPhoto, get, remove, setCurrentCreateDraft, update } from '../../services/dumps';
import { photoRange } from '../../services/dumpLabels';
import { getProfile } from '../../services/profile';
import { useTheme } from '../../theme/ThemeProvider';
import { display, label, ui } from '../../theme/type';
import { AvatarButton, TopHeader } from '../../components/ui/TopHeader';
import { FrameCard } from '../../components/ui/FrameCard';
import { PhotoStack } from '../../components/ui/PhotoStack';
import { Print } from '../../components/ui/Print';
import { Sheet } from '../../components/ui/Sheet';
import { Tap } from '../../components/ui/Tap';
import { Icons } from '../../components/ui/Icons';
import { StatusScrim } from '../../components/ui/Screen';
import { FinishSection, toPhoto, useFinishes } from '../../components/create/Finishes';

const RECENTS_KEY = '@daydump_recent_searches';
const MIN = 2, MAX = 12;
const GAP = 6;
/** The search in Title Case; no search -> undefined, and createDraft names it by the photos' date range. */
const dumpTitle = (q: string) => (q.trim() ? q.trim().split(/\s+/).map(capitalize).join(' ') : undefined);

/** One CLIP text vector per query text (the grid re-searches whenever indexing rebuilds the library). */
const textVecs = new Map<string, Promise<Float32Array | null>>();
const vecFor = (text: string) => {
  if (!textVecs.has(text)) textVecs.set(text, embedText(text).catch(() => null));
  return textVecs.get(text)!;
};

/** Search field with the recent-searches dropdown (only while focused). */
function SearchBar({ query, onQuery, onCommit, recents, suggestions, onRemoveRecent }: {
  query: string; onQuery: (q: string) => void; onCommit: (q: string) => void;
  recents: string[]; suggestions: string[]; onRemoveRecent: (q: string) => void;
}) {
  const { t } = useTheme();
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  // what the blur saves to recents: the picked row, not the text before it (setQuery hasn't landed yet)
  const last = useRef(query);
  useEffect(() => { last.current = query; }, [query]);
  // Android Back hides the keyboard without blurring: close the dropdown with it
  useEffect(() => { const k = Keyboard.addListener('keyboardDidHide', () => input.current?.blur()); return () => k.remove(); }, []);
  const pick = (q: string) => { onQuery(q); last.current = q; input.current?.blur(); Keyboard.dismiss(); };
  const rows = recents.length ? recents.slice(0, 4) : suggestions;
  return (
    <View style={{ marginBottom: 8, zIndex: 30 }}>
      <FrameCard radius={16} style={[{ height: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, focused ? { borderColor: t.ink } : null]}>
        <Icons.search size={16} color={t.inkMuted} />
        <TextInput
          ref={input}
          value={query}
          onChangeText={onQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onCommit(last.current); }}
          onSubmitEditing={() => onCommit(query)}
          placeholder="Search keyword, place, date..."
          placeholderTextColor={t.inkMuted}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          style={[ui(12, 500), { flex: 1, color: t.ink, padding: 0 }]}
        />
        {query ? (
          <Tap onPress={() => onQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Icons.close size={12} color={t.inkMuted} />
          </Tap>
        ) : null}
      </FrameCard>
      {focused && rows.length ? (
        <FrameCard radius={16} padding={8} style={{ position: 'absolute', top: 44, left: 0, right: 0, borderColor: t.borderStrong, boxShadow: `${t.shadowCard}, 0 10px 15px -3px rgba(0,0,0,0.1)` }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 6, paddingBottom: 4 }}>
            <Text style={[label(9.5, 0.12), { color: t.inkMuted }]}>{recents.length ? 'Last searches' : 'Try'}</Text>
            <Tap onPress={() => { input.current?.blur(); Keyboard.dismiss(); }} hitSlop={8} accessibilityRole="button">
              <Text style={[ui(10, 600), { color: t.ink, textDecorationLine: 'underline' }]}>Close</Text>
            </Tap>
          </View>
          {rows.map((q) => (
            <Tap key={q} onPress={() => pick(q)} accessibilityRole="button" accessibilityLabel={`Search ${q}`} style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {recents.length ? <Icons.clock size={12} color={t.inkMuted} /> : <Icons.sparkle size={12} color={t.inkMuted} />}
              <Text style={[ui(11.5, 500), { color: t.ink, flex: 1 }]} numberOfLines={1}>{q}</Text>
              {recents.length ? (
                <Tap onPress={() => onRemoveRecent(q)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${q}`} style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
                  <Icons.close size={10} color={t.inkMuted} />
                </Tap>
              ) : null}
            </Tap>
          ))}
        </FrameCard>
      ) : null}
    </View>
  );
}

/** Round 20px stepper button (bg black/10). */
function Step({ text, onPress, disabled }: { text: string; onPress: () => void; disabled?: boolean }) {
  const { t } = useTheme();
  return (
    <Tap onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={text === '+' ? 'More photos' : 'Fewer photos'} hitSlop={6}
      style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.borderStrong, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <Text style={[ui(13, 600), { color: t.ink, lineHeight: 15 }]}>{text}</Text>
    </Tap>
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

/** Create (ph3.png): search the library, pick photos into the basket (auto-saved Create draft), Continue to Edit. */
export default function Create() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const { library: lib, permission, progress } = useApp();
  const { shared } = useLocalSearchParams<{ shared?: string }>();

  const [query, setQuery] = useState('');
  // photos, not library rows: indexing rebuilds the library under a running search
  const [rows, setRows] = useState<IndexedPhoto[] | null>(null);
  const [qvec, setQvec] = useState<Float32Array | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [basket, setBasket] = useState<DumpPhoto[]>([]);
  const [target, setTarget] = useState(6);
  const [similar, setSimilar] = useState<IndexedPhoto[]>([]);
  const [review, setReview] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
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
          const { ratio, fit } = await getProfile();
          if (d?.status === 'draft' && !d.layout && !d.filter && !d.caption && d.ratio === ratio && d.fit === fit) await remove(id);
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
    setBasket(d?.photos ?? []);
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
    if (s) editRecents((r) => (r[0] === s ? r : [s, ...r.filter((x) => x !== s)].slice(0, 5)));
  };
  /** First-time hints: a place from the library, a season, a thing. */
  const suggestions = useMemo(() => {
    if (!lib) return [];
    const places = [...placeIndex(lib).entries()].sort((a, b) => b[1].size - a[1].size).map(([k]) => k);
    const season = ['winter', 'spring', 'summer', 'autumn'][Math.floor(((new Date().getMonth() + 1) % 12) / 3)];
    return [places[1] ?? places[0], `${season} sunset`, 'coffee with friends'].filter((x): x is string => !!x);
  }, [lib]);

  // ---- search: parse, embed the CLIP words, filter + rank (300 ms after typing stops) ----
  useEffect(() => {
    if (!lib) return;
    let live = true;
    const h = setTimeout(async () => {
      const t0 = Date.now();
      const places = placeIndex(lib);
      const q = parseQuery(query, (n) => places.has(n));
      const v = q.clip ? await vecFor(q.clip) : null;
      if (!live) return;
      const r = searchLibrary(lib, q, v);
      if (query) console.log(`[create] "${query}" -> places ${JSON.stringify(q.places)} months ${q.months ? [...q.months] : '-'} years ${q.years ? [...q.years] : '-'} clip "${q.clip}": ${r.length} in ${Date.now() - t0} ms`);
      setRows(r.map((i) => lib.photos[i]));
      setQvec(v);
    }, query ? 300 : 0);
    return () => { live = false; clearTimeout(h); };
  }, [query, lib]);

  // ---- "Similar to your N selected" (300 ms after the basket settles) ----
  const basketKey = basket.map((p) => p.id).join(',');
  useEffect(() => {
    if (!lib || !basket.length) return;
    const h = setTimeout(() => {
      const t0 = Date.now();
      setSimilar(similarTo(lib, basket.map((p) => p.id), 8, qvec));
      console.log(`[create] similar to ${basket.length} in ${Date.now() - t0} ms`);
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
  const shownTarget = Math.max(basket.length, target);
  const finishes = useFinishes({ lib: lib ?? null, basket, total: shownTarget, change, bumpTotal: setTarget, title: dumpTitle(query) });
  const suggestedN = basket.filter((p) => p.suggested).length;
  const toggle = (p: DumpPhoto) => {
    const next = order.has(p.id) ? basket.filter((x) => x.id !== p.id) : [...basket, p];
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
      setReview(false);
      await persist(basket, query.trim() ? dumpTitle(query) : undefined);
      if (draftId.current) router.push({ pathname: '/edit/[id]', params: { id: draftId.current } });
    } finally { going.current = false; }
  };
  const startNew = async () => {
    setReview(false);
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
  const renderRow = ({ item }: { item: IndexedPhoto[] }) => (
    <View style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP }}>
      {item.map((p) => {
        const k = order.get(p.id);
        return (
          <Tap key={p.id} onPress={() => toggle(toPhoto(p))} accessibilityRole="button" accessibilityState={{ selected: k != null }}
            accessibilityLabel={`Photo from ${dateRange(p.creationTime, p.creationTime, now)}${k != null ? `, number ${k + 1} in the basket` : ''}`}
            style={[{ width: cellW, height: cellH, borderRadius: 12 }, k != null ? { boxShadow: `0 0 0 2px ${t.ink}` } : null]}>
            <View style={{ flex: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: t.borderStrong }}>
              <Image source={{ uri: p.uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={p.id} transition={100} />
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 4, experimental_backgroundImage: 'linear-gradient(0deg, rgba(0,0,0,0.6), rgba(0,0,0,0))' }}>
                <Text style={[ui(8.5, 500), { color: '#fff' }]} numberOfLines={1}>{dateRange(p.creationTime, p.creationTime, now)}</Text>
              </View>
            </View>
            <Badge n={k != null ? k + 1 : 0} suggested={k != null && basket[k].suggested} />
          </Tap>
        );
      })}
    </View>
  );

  const header = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingHorizontal: 2, gap: 8 }}>
      <Text style={[label(9.5, 0.11), { color: t.inkMuted, flexShrink: 1 }]} numberOfLines={2}>
        {query.trim() ? `Matches for "${query.trim()}" (${rows?.length ?? 0})` : progress ? `Your gallery (${progress.done.toLocaleString('en-US')} read so far)` : `Your gallery (${rows?.length ?? 0})`}
      </Text>
      <Text style={[ui(9.5), { color: t.inkMuted }]}>Tap to add to basket</Text>
    </View>
  );

  const empty = permission === false ? (
    <FrameCard padding={16} style={{ gap: 8 }}>
      <Text style={[display(18), { color: t.ink }]}>DayDump needs your photos</Text>
      <Text style={[ui(12), { color: t.inkMuted }]}>Allow photo access to search and pick from your library. Nothing leaves your phone.</Text>
      <Tap onPress={() => Linking.openSettings()} accessibilityRole="button" style={{ alignSelf: 'flex-start', height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.ink, justifyContent: 'center' }}>
        <Text style={[ui(12, 600), { color: t.bgScreen }]}>Open settings</Text>
      </Tap>
    </FrameCard>
  ) : rows == null ? (
    <Text style={[ui(12), { color: t.inkMuted, padding: 8 }]}>Loading your photos…</Text>
  ) : (
    <FrameCard padding={16} style={{ gap: 6 }}>
      <Text style={[display(18), { color: t.ink }]}>{query.trim() ? 'No matches' : 'No photos yet'}</Text>
      <Text style={[ui(12), { color: t.inkMuted }]}>
        {query.trim() ? `Nothing in your library matches “${query.trim()}”. Try a place, a month or a simpler word.` : 'Photos appear here as DayDump reads your library.'}
      </Text>
    </FrameCard>
  );

  // the strip leans toward the search only when it has CLIP words (qvec)
  const vibe = qvec ? query.trim() : '';
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 16, zIndex: 10 }}>
        <TopHeader title="Create" right={<AvatarButton onPress={() => router.push('/profile')} />} />
        <SearchBar query={query} onQuery={setQuery} onCommit={commit} recents={recents} suggestions={suggestions}
          onRemoveRecent={(q) => editRecents((r) => r.filter((x) => x !== q))} />
      </View>

      <FlatList
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
        style={{ flex: 1 }}
      />

      {keyboard ? null : (
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, opacity: loaded ? 1 : 0 }}>
          {/* the strip steps aside while "2 ways to finish" is open, so the grid keeps room */}
          {basket.length && similar.length && !(finishes.open && (finishes.sets || finishes.busy)) ? (
            <View style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, paddingHorizontal: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                  <Icons.sparkle size={12} color={t.ink} />
                  <Text style={[label(9.5, 0.11), { color: t.inkMuted }]} numberOfLines={1}>
                    Similar to your {basket.length} selected photo{basket.length === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text style={[ui(9), { color: t.inkMuted }]} numberOfLines={1}>{vibe ? `+ "${vibe}" vibe` : 'AI Match'}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: GAP, paddingBottom: 4 }}>
                {similar.map((p) => {
                  return (
                    <Tap key={p.id} onPress={() => toggle(toPhoto(p, true))} accessibilityRole="button" accessibilityLabel="Add this similar photo"
                      style={{ width: 62, height: 64, borderRadius: 11, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', backgroundColor: t.borderStrong }}>
                      <Image source={{ uri: p.uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={p.id} />
                      <View style={{ position: 'absolute', top: 4, right: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.65)' }}>
                        <Text style={[ui(8, 600), { color: '#fff' }]}>+ Add</Text>
                      </View>
                    </Tap>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* the dock: "2 ways to finish" grows up out of it, above Total */}
          <FinishSection f={finishes} />
          <FrameCard radius={15} style={{ paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={[ui(10, 500), { color: t.inkMuted }]}>Total:</Text>
              <Step text="−" onPress={() => setTarget(Math.max(MIN, basket.length, shownTarget - 1))} disabled={shownTarget <= Math.max(MIN, basket.length)} />
              <Text style={[ui(11, 700), { color: t.ink, minWidth: 14, textAlign: 'center' }]}>{shownTarget}</Text>
              <Step text="+" onPress={() => setTarget(Math.min(MAX, shownTarget + 1))} disabled={shownTarget >= MAX} />
              {/* ✧ photos count as the App's, like the footer's "3 + 1✧" */}
              <Text style={[ui(9.5), { color: t.inkMuted, marginLeft: 2 }]}>
                (You <Text style={[ui(9.5, 700), { color: t.ink }]}>{basket.length - suggestedN}</Text> · App <Text style={[ui(9.5, 700), { color: t.ink }]}>+{shownTarget - basket.length + suggestedN}</Text>)
              </Text>
            </View>
            <Tap onPress={basket.length ? finishes.suggest : () => ToastAndroid.show('Pick a photo first, then Suggest fills', ToastAndroid.SHORT)}
              accessibilityRole="button" accessibilityState={{ disabled: !basket.length }} accessibilityLabel={finishes.again ? 'Suggest again' : 'Suggest fills'}
              accessibilityHint={basket.length ? 'Shows 2 ways to finish this dump' : 'Pick a photo first'} hitSlop={6}
              style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: basket.length ? 1 : 0.4 }}>
              <Icons.sparkle size={11} color={t.bgScreen} />
              <Text style={[ui(10, 600), { color: t.bgScreen }]}>{finishes.again ? 'Suggest again' : 'Suggest fills'}</Text>
            </Tap>
          </FrameCard>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <FrameCard radius={16} onPress={() => { setSel(null); setReview(true); }} label={`${basket.length} selected. Review`}
              style={{ paddingVertical: 4, paddingRight: 12, paddingLeft: 6, flexDirection: 'row', alignItems: 'center', gap: 10, boxShadow: `${t.shadowCard}, 0 4px 6px -1px rgba(0,0,0,0.1)` }}>
              <View>
                <PhotoStack kind="basket" uris={basket.length ? basket.slice(0, 2).map((p) => p.uri) : ['', '']} />
                <View style={{ position: 'absolute', top: -4, right: -4, paddingHorizontal: 6, borderRadius: 9, backgroundColor: t.ink, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                  <Text style={[ui(9, 700), { color: t.bgScreen }]}>{basket.length}/{shownTarget}</Text>
                </View>
              </View>
              <View>
                <Text style={[ui(11, 700), { color: t.ink }]}>Selected</Text>
                {suggestedN ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Text style={[ui(9.5), { color: t.inkMuted }]}>{basket.length - suggestedN} + {suggestedN}</Text>
                    <Icons.sparkle size={9} color={t.inkMuted} />
                    <Text style={[ui(9.5), { color: t.inkMuted }]}> · review</Text>
                  </View>
                ) : <Text style={[ui(9.5), { color: t.inkMuted }]}>Tap to review</Text>}
              </View>
            </FrameCard>
            <Tap onPress={go} accessibilityRole="button" accessibilityState={{ disabled: !basket.length }} accessibilityLabel={`Continue with ${basket.length} photo${basket.length === 1 ? '' : 's'}`}
              style={{ height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: basket.length ? 1 : 0.4, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <Text style={[ui(11, 600), { color: t.bgScreen }]}>Continue ({basket.length})</Text>
              <Icons.arrow size={14} color={t.bgScreen} />
            </Tap>
          </View>
        </View>
      )}

      <Sheet visible={review} onClose={() => setReview(false)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[ui(13, 700), { color: t.ink }]}>Selected basket ({basket.length}/{shownTarget} photos)</Text>
          <Tap onPress={() => setReview(false)} hitSlop={8} accessibilityRole="button">
            <Text style={[ui(11), { color: t.inkMuted, textDecorationLine: 'underline' }]}>Hide</Text>
          </Tap>
        </View>
        {basket.length ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6, paddingHorizontal: 2 }}>
              {basket.map((p, i) => (
                <Tap key={p.id} onPress={() => setSel(sel === p.id ? null : p.id)} accessibilityRole="button" accessibilityState={{ selected: sel === p.id }} accessibilityLabel={`Photo ${i + 1}`}
                  style={[{ borderRadius: 10 }, sel === p.id ? { boxShadow: `0 0 0 2px ${t.ink}` } : null]}>
                  <Print uri={p.uri} w={60} h={66} r={10} border={1} borderColor="rgba(255,255,255,0.6)" />
                  <Tap onPress={() => change(basket.filter((x) => x.id !== p.id))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`}
                    style={{ position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                    <Icons.close size={10} color="#fff" />
                  </Tap>
                  <View style={{ position: 'absolute', bottom: 3, left: 3, paddingHorizontal: 4, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    {p.suggested ? <Icons.sparkle size={8} color="#fff" /> : null}
                    <Text style={[ui(8, 700), { color: '#fff' }]}>#{i + 1}</Text>
                  </View>
                </Tap>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[['Move earlier', -1], ['Move later', 1]].map(([text, by]) => {
                const i = basket.findIndex((p) => p.id === sel);
                const off = i < 0 || i + (by as number) < 0 || i + (by as number) >= basket.length;
                return (
                  <FrameCard key={text} radius={14} onPress={off ? undefined : () => move(sel!, by as number)} label={text as string}
                    style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.4 : 1 }}>
                    <Text style={[ui(11.5, 600), { color: t.ink }]}>{text}</Text>
                  </FrameCard>
                );
              })}
            </View>
            <Text style={[ui(10.5), { color: t.inkMuted }]}>{sel ? 'Move it, or tap × to take it out.' : 'Tap a photo to move it. × takes it out.'}</Text>
            <Tap onPress={go} accessibilityRole="button" style={{ height: 40, borderRadius: 20, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
              <Text style={[ui(12, 600), { color: t.bgScreen }]}>Continue to Edit ({basket.length}) →</Text>
            </Tap>
            <Tap onPress={startNew} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 6 }}>
              <Text style={[ui(11, 500), { color: t.inkMuted }]}>Start a new dump · this one stays in Library → Drafts</Text>
            </Tap>
          </>
        ) : (
          <Text style={[ui(12), { color: t.inkMuted, paddingVertical: 12 }]}>Nothing picked yet. Tap photos in the grid to add them.</Text>
        )}
      </Sheet>
      <StatusScrim />
    </View>
  );
}
