import React, { useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusScrim } from '../../components/ui/Screen';
import { IconButton } from '../../components/ui/TopHeader';
import { Icons } from '../../components/ui/Icons';
import { Pill } from '../../components/ui/Pill';
import { Confirm, ConfirmSpec } from '../../components/ui/Sheet';
import { PhotoViewer } from '../../components/ui/PhotoViewer';
import { Tap } from '../../components/ui/Tap';
import { formatBytes, lockConfirm, missChip, Primary, ShotCheckList, TidyGrid } from '../../components/tidy/TidyGrid';
import { buildDeck, buildRounds, diffChecks, faultMarks, monthOf, Pile, PILES, shotCheck, swapKeeper, TPhoto } from '../../services/tidy/rules';
import { Moved, moveToTrash, useTidy } from '../../services/tidy/scan';
import { dateRange } from '../../services/stories/titles';
import { useTheme } from '../../theme/ThemeProvider';
import { fixed } from '../../theme/tokens';
import { display, ui } from '../../theme/type';

const HINT_KEY = 'tidy.swipeHint';
const HINT_DX = 80;
const RED = '#D93A2B';
const FRAME = 6;

const folderOf = (uri: string) => uri.split('/').slice(-2, -1)[0] ?? '';
function apart(p: TPhoto, k: TPhoto) {
  const s = Math.round(Math.abs(p.created - k.created) / 1000);
  if (!s) return 'Same second';
  return `${s < 60 ? `${s} s` : `${Math.round(s / 60)} min`} ${p.created > k.created ? 'later' : 'earlier'}`;
}

function Chip({ text, tone }: { text: string; tone?: 'worse' | 'better' }) {
  const { t } = useTheme();
  const Icon = tone === 'worse' ? Icons.close : tone === 'better' ? Icons.check : null;
  return (
    <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: tone === 'worse' ? 'rgba(217,58,43,0.18)' : tone === 'better' ? 'rgba(71,112,77,0.22)' : t.bgCard }}>
      {Icon ? <Icon size={12} color={t.ink} /> : null}
      <Text style={[ui(11, 600), { color: tone ? t.ink : t.inkMuted }]}>{text}</Text>
    </View>
  );
}

/** The misses drawn on the photo: rings, the tilt against level, and each miss in words. */
function Marks({ p, worse }: { p: TPhoto; worse: string[] }) {
  const { rings, tilt } = faultMarks(p, worse);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {rings.map((r) => (
        <View key={`${r.x},${r.y}`} style={{ position: 'absolute', left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, borderWidth: 2.5, borderColor: RED, borderRadius: r.round ? 999 : 8 }} />
      ))}
      {tilt != null ? (
        <>
          <View style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTopWidth: 1.5, borderColor: '#fff', borderStyle: 'dashed' }} />
          <View style={{ position: 'absolute', left: '-15%', right: '-15%', top: '50%', height: 2.5, backgroundColor: RED, transform: [{ rotate: `${tilt}deg` }] }} />
        </>
      ) : null}
      <View style={{ position: 'absolute', left: 8, bottom: 8, gap: 4, alignItems: 'flex-start' }}>
        {worse.map((x) => (
          <View key={x} style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: RED, transform: [{ rotate: '-2deg' }] }}>
            <Text style={[ui(12, 600), { color: '#fff' }]}>{x}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** A pile one photo at a time, in rounds of look-alikes: left marks it for Trash, right keeps it; each round ends with its verdicts, and only then do they move. */
export default function SwipeScreen() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const W = useWindowDimensions().width;
  const { pile: param, month } = useLocalSearchParams<{ pile: string; month?: string }>();
  const pile = param && param in PILES ? (param as Pile) : null;
  const { result } = useTidy();
  // a snapshot: a rescan or a round's move mustn't reshuffle the deck
  const [start] = useState(() => {
    const inMonth = (ms: number) => !month || monthOf(ms) === month;
    const sets = pile === 'same' ? (result?.sets ?? []).filter((s) => inMonth(s.photos[s.keeper].created)) : [];
    const items = pile ? (result?.piles[pile] ?? []).filter((x) => inMonth(x.p.created)) : [];
    return { sets, items };
  });
  const { sets } = start;
  const [deck, setDeck] = useState(() => ({
    rounds: pile && result ? buildRounds(buildDeck(pile, start.items, sets), result.vecs) : [],
    keepers: sets.map((s) => s.photos[s.keeper]),
  }));
  const lockOf = useMemo(() => new Map(start.items.map((x) => [x.p.id, x.lock])), [start.items]);
  const noteOf = useMemo(() => new Map(start.items.map((x) => [x.p.id, x.note])), [start.items]);
  const [round, setRound] = useState(0);
  const [at, setAt] = useState(0);
  const [marks, setMarks] = useState<Record<string, 't' | 'k'>>({});
  const [alt, setAlt] = useState(false);
  const [moved, setMoved] = useState<Moved | undefined>();
  const [ask, setAsk] = useState<ConfirmSpec | null>(null);
  const [view, setView] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // the decoded aspect: MediaStore's width and height can ignore EXIF rotation, and the rings need the real one
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const aspect = (p: TPhoto) => aspects[p.id] ?? (p.w > 0 && p.h > 0 ? p.w / p.h : 1);
  const loaded = (p: TPhoto) => (e: { source: { width: number; height: number } }) => {
    const { width, height } = e.source;
    if (width && height) setAspects((m) => (m[p.id] ? m : { ...m, [p.id]: width / height }));
  };

  const { rounds, keepers } = deck;
  const cards = rounds[round] ?? [];
  const more = round + 1 < rounds.length;
  const card = cards[at];
  const p = card?.p;
  const keeper = card?.set != null ? keepers[card.set] : undefined;
  const peers = card?.set != null ? sets[card.set].photos : undefined;
  const lock = p ? lockOf.get(p.id) ?? null : null;
  const diff = p && keeper ? diffChecks(p, keeper, peers!) : null;
  const trash = cards.filter((c) => marks[c.p.id] === 't');
  const bytes = trash.reduce((a, c) => a + c.p.size, 0);

  const still = useReducedMotion();
  const dx = useSharedValue(0);
  const flying = useSharedValue(false);
  // the first time ever: the card leans both ways, stamps showing, to teach the swipe
  const teach = () => {
    if (still) return;
    AsyncStorage.getItem(HINT_KEY).then((seen) => {
      if (seen) return;
      AsyncStorage.setItem(HINT_KEY, '1').catch(() => {});
      const lean = (to: number) => withTiming(to, { duration: 380 });
      dx.value = withDelay(450, withSequence(lean(-HINT_DX), lean(0), lean(HINT_DX), lean(0)));
    }, () => {});
  };
  const commit = (v: 't' | 'k') => {
    flying.value = false;
    if (!p) return;
    setMarks((m) => ({ ...m, [p.id]: v }));
    setAt(at + 1); setAlt(false);
    dx.value = 0;
  };
  const fly = (v: 't' | 'k') => {
    if (flying.value) return;
    flying.value = true;
    if (still) { commit(v); return; }
    dx.value = withTiming(v === 't' ? -W : W, { duration: 170 }, () => { scheduleOnRN(commit, v); });
  };
  const askLock = () => { if (lock) setAsk(lockConfirm(lock, () => fly('t'))); };
  const decide = (v: 't' | 'k') => { if (v === 't' && lock) askLock(); else fly(v); };
  const undo = () => {
    if (!at) return;
    const prev = cards[at - 1].p.id;
    setMarks((m) => { const n = { ...m }; delete n[prev]; return n; });
    setAt(at - 1); setAlt(false);
    dx.value = 0;
  };
  const swap = () => {
    const s = swapKeeper(cards, keepers, at);
    setDeck({ rounds: rounds.map((r, i) => (i === round ? s.cards : r)), keepers: s.keepers });
    setAlt(false);
  };

  const locked = !!lock;
  const pan = Gesture.Pan().withTestId('tidy-swipe').enabled(!still && !busy).activeOffsetX([-14, 14]).failOffsetY([-40, 40])
    .onUpdate((e) => { dx.value = e.translationX; })
    .onEnd((e) => {
      const go = Math.abs(e.translationX) > W * 0.28 || Math.abs(e.velocityX) > 900;
      const left = e.translationX < 0;
      if (!go || (left && locked)) {
        dx.value = withTiming(0, { duration: 160 });
        if (go) scheduleOnRN(askLock);
        return;
      }
      scheduleOnRN(fly, left ? 't' : 'k');
    });
  const shownAt = alt && keeper ? 1 : 0;
  const look = Gesture.Tap().withTestId('tidy-look').maxDistance(8).onEnd(() => { scheduleOnRN(setView, shownAt); });
  const gesture = Gesture.Simultaneous(pan, look);
  const lift = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }, { rotate: `${dx.value / 18}deg` }] }));
  const stampT = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, -dx.value - 16) / 60) }));
  const stampK = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, dx.value - 16) / 60) }));

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/tidy'));
  const back = () => {
    if (!p && cards.length) { undo(); return; }
    if (trash.length) setAsk({ title: 'Leave this round?', body: `The ${trash.length} marked for Trash in this round stay in your gallery.`, action: 'Leave', onConfirm: leave });
    else leave();
  };
  const onward = () => {
    if (!more) { leave(); return; }
    setRound(round + 1); setAt(0); setMarks({}); setMsg(null);
  };
  const move = async () => {
    setBusy(true); setMsg(null);
    try {
      const m = await moveToTrash(trash.map((c) => ({ p: c.p, pile: pile! })), keepers.filter((_, i) => trash.some((c) => c.set === i)), moved);
      if (m) { setMoved(m); onward(); } else setMsg('Nothing was moved.');
    } catch (e) {
      console.warn('[tidy] move failed:', e);
      setMsg('Nothing was moved.');
    }
    setBusy(false);
  };

  if (!pile) return null;
  const roundLabel = rounds.length > 1 ? `Round ${round + 1} of ${rounds.length}` : '';
  const title = (
    <View style={{ paddingTop: insets.top + 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconButton label="Back" onPress={back}><Icons.back size={16} /></IconButton>
      <Text style={[display(20), { color: t.ink, flex: 1 }]} numberOfLines={1}>{PILES[pile].title}</Text>
      {p ? <Pill label="Grid" onPress={() => router.replace(pile === 'same' ? { pathname: '/tidy/sets', params: month ? { month } : {} } : { pathname: '/tidy/[pile]', params: { pile, ...(month ? { month } : {}) } })} height={30} size={11} /> : null}
    </View>
  );

  if (!p || !card) {
    const flip = (id: string) => {
      const apply = () => setMarks((m) => ({ ...m, [id]: m[id] === 't' ? 'k' : 't' }));
      const l = lockOf.get(id);
      if (marks[id] !== 't' && l) setAsk(lockConfirm(l, apply)); else apply();
    };
    return (
      <View style={{ flex: 1 }}>
        <TidyGrid items={cards.map((c) => ({ p: c.p, badge: lockOf.get(c.p.id) }))} selected={new Set(trash.map((c) => c.p.id))} onPress={flip} onLongPress={setView}
          header={(
            <View style={{ paddingBottom: 10, gap: 6 }}>
              {title}
              <Text style={[display(18), { color: t.ink, marginTop: 6 }]}>{cards.length ? (roundLabel ? `${roundLabel}: are you sure?` : 'Are you sure?') : 'Nothing here'}</Text>
              {cards.length ? <Text style={[ui(12), { color: t.inkMuted }]}>{trash.length} to Trash · {cards.length - trash.length} kept. Tap one to change it.</Text> : null}
            </View>
          )} />
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12, gap: 6 }}>
          {msg ? <Text style={[ui(12, 500), { color: t.inkMuted, textAlign: 'center' }]}>{msg}</Text> : null}
          {trash.length ? <Primary label={`Move ${trash.length} to Trash · ${formatBytes(bytes)}`} onPress={move} disabled={busy} /> : <Primary label={more ? 'Next round' : 'Done'} onPress={onward} />}
        </View>
        <StatusScrim />
        <PhotoViewer photos={cards.map((c) => c.p)} index={view} onClose={() => setView(null)} />
        <Confirm c={ask} onClose={() => setAsk(null)} />
      </View>
    );
  }

  const fit = (ar: number) => {
    const bw = box.w - 2 * FRAME, bh = box.h - 2 * FRAME - 4;
    return bw / ar <= bh ? { w: bw, h: bw / ar } : { w: bh * ar, h: bh };
  };
  const size = fit(aspect(alt && keeper ? keeper : p));
  const next = cards[at + 1]?.p;
  const worse = diff?.worse ?? (card.copyOf ? [`In ${folderOf(p.uri)}`] : pile === 'blurry' ? [missChip(shotCheck(p))].filter((x): x is string => !!x) : []);
  const info = [
    ...(lock ? [lock] : []),
    ...(keeper ? [apart(p, keeper)] : card.copyOf ? ['Same file', `Keeps the one in ${folderOf(card.copyOf.uri)}`] : [dateRange(p.created, p.created)]),
    ...(noteOf.get(p.id) ? [noteOf.get(p.id)!] : []),
    formatBytes(p.size),
  ];
  const nothing = diff && !diff.worse.length && !diff.better.length;

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: insets.bottom + 8 }}>
      {title}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: t.borderStrong, overflow: 'hidden' }}>
          <View style={{ width: `${(100 * at) / cards.length}%`, height: 4, backgroundColor: t.ink }} />
        </View>
        {roundLabel ? <Text style={[ui(11, 500), { color: t.inkMuted }]}>{roundLabel} ·</Text> : null}
        <Text style={[ui(11, 500), { color: t.inkMuted }]}>{at + 1} of {cards.length}</Text>
      </View>
      {keeper ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 }}>
          <Pill label="This one" on={!alt} onPress={() => setAlt(false)} height={34} size={12} />
          <Pill label="The keeper" on={alt} onPress={() => setAlt(true)} height={34} size={12} />
        </View>
      ) : null}

      <View testID="tidy-deck" onLayout={(e) => { if (!box.w) teach(); setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }); }} style={{ flex: 1, marginTop: 10, alignItems: 'center', justifyContent: 'center' }}>
        {box.w && next ? (
          <View style={{ position: 'absolute', width: fit(aspect(next)).w + 2 * FRAME, height: fit(aspect(next)).h + 2 * FRAME, padding: FRAME, borderRadius: 10, backgroundColor: fixed.printBorder, transform: [{ scale: 0.95 }, { translateY: 8 }, { rotate: '-1.2deg' }] }}>
            <Image source={{ uri: next.uri }} style={{ flex: 1, borderRadius: 6 }} contentFit="cover" recyclingKey={next.id} onLoad={loaded(next)} />
          </View>
        ) : null}
        {box.w ? (
          <GestureDetector gesture={gesture}>
            <Animated.View key={p.id} accessible accessibilityRole="image" accessibilityLabel={`Photo from ${dateRange(p.created, p.created)}${worse.length ? `, ${worse.join(', ')}` : ''}`}
              style={[{ width: size.w + 2 * FRAME, height: size.h + 2 * FRAME, padding: FRAME, borderRadius: 10, backgroundColor: fixed.printBorder, boxShadow: t.shadowCard }, lift]}>
              <View style={{ flex: 1, borderRadius: 6, overflow: 'hidden', backgroundColor: t.borderStrong }}>
                <Image source={{ uri: p.uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={p.id} onLoad={loaded(p)} />
                {/* always mounted, so the keeper is there the moment it's toggled */}
                {keeper ? <Image source={{ uri: keeper.uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: alt ? 1 : 0 }} contentFit="cover" recyclingKey={keeper.id} onLoad={loaded(keeper)} /> : null}
                {diff && !alt ? <Marks p={p} worse={diff.worse} /> : null}
              </View>
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 22, right: 16, paddingHorizontal: 9, borderWidth: 3, borderRadius: 7, borderColor: RED, backgroundColor: fixed.printBorder, transform: [{ rotate: '12deg' }] }, stampT]}>
                <Text style={[display(24), { color: RED }]}>TRASH</Text>
              </Animated.View>
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 22, left: 16, paddingHorizontal: 9, borderWidth: 3, borderRadius: 7, borderColor: '#47704D', backgroundColor: fixed.printBorder, transform: [{ rotate: '-12deg' }] }, stampK]}>
                <Text style={[display(24), { color: '#47704D' }]}>KEEP</Text>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
        {worse.map((x) => <Chip key={x} text={x} tone="worse" />)}
        {diff?.better.map((x) => <Chip key={x} text={x} tone="better" />)}
        {nothing ? <Chip text="Looks the same" /> : null}
        {info.map((x) => <Chip key={x} text={x} />)}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 10 }}>
        <Tap onPress={() => decide('t')} accessibilityRole="button" accessibilityLabel="Trash" style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Icons.close size={22} color={RED} />
        </Tap>
        <Tap onPress={undo} disabled={!at} accessibilityRole="button" accessibilityLabel="Undo" accessibilityState={{ disabled: !at }} style={{ height: 40, paddingHorizontal: 18, borderRadius: 20, opacity: at ? 1 : 0.4, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(13, 600), { color: t.ink }]}>Undo</Text>
        </Tap>
        <Tap onPress={() => decide('k')} accessibilityRole="button" accessibilityLabel="Keep" style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Icons.check size={22} color="#47704D" />
        </Tap>
      </View>
      {keeper ? (
        <Tap onPress={swap} accessibilityRole="button" accessibilityLabel="Keep this one instead" style={{ height: 46, marginTop: 10, borderRadius: 23, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(13.5, 600), { color: t.ink }]}>Keep this one instead</Text>
        </Tap>
      ) : null}
      <StatusScrim />
      <PhotoViewer photos={keeper ? [p, keeper] : [p]} index={view} onClose={() => setView(null)} footer={(x, i) => (
        <View>
          <Text style={[ui(12, 600), { color: '#fff', marginBottom: 6 }]}>{i === 0 ? 'This one' : 'The keeper'}</Text>
          <ShotCheckList checks={shotCheck(x, peers)} />
        </View>
      )} />
      <Confirm c={ask} onClose={() => setAsk(null)} />
    </View>
  );
}
