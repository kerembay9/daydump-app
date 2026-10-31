import React, { useCallback, useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusScrim } from '../../components/ui/Screen';
import { IconButton } from '../../components/ui/TopHeader';
import { FrameCard } from '../../components/ui/FrameCard';
import { Icons } from '../../components/ui/Icons';
import { Pill } from '../../components/ui/Pill';
import { ProBadge } from '../../components/ui/ProBadge';
import { Print } from '../../components/ui/Print';
import { Confirm, ConfirmSpec } from '../../components/ui/Sheet';
import { PhotoViewer } from '../../components/ui/PhotoViewer';
import { Tap } from '../../components/ui/Tap';
import { checkLabel, missChip, formatBytes, KeepToggle, lockConfirm, moveConfirm, Primary, ShotCheckList, TidyGrid } from '../../components/tidy/TidyGrid';
import { monthOf, outtake, shotCheck, ShotSet, TPhoto } from '../../services/tidy/rules';
import { moveToTrash, useTidy } from '../../services/tidy/scan';
import { usePro } from '../../state/Pro';
import { dateRange } from '../../services/stories/titles';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { tr } from '../../i18n';

type Marked = { keeper: TPhoto; remove: TPhoto[] };

const when = (ms: number) => `${dateRange(ms, ms)}, ${new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

/** Same shot, one set at a time: the keeper big, the other takes marked for Trash; decisions stay here until Move. */
export default function SetsScreen() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const W = useWindowDimensions().width - 32;
  const { result } = useTidy();
  const { isPro, openPaywall } = usePro();
  const month = useLocalSearchParams<{ month?: string }>().month;
  // a snapshot: decisions are by set index, so a rescan mid-review mustn't reshuffle them
  const [sets] = useState<ShotSet[]>(() => (result?.sets ?? []).filter((st) => !month || monthOf(st.photos[st.keeper].created) === month));
  const [vecs] = useState(() => result?.vecs ?? new Float32Array(0));
  const [lockOf] = useState(() => new Map((result?.piles.same ?? []).map((x) => [x.p.id, x.lock])));
  const fresh = (i: number) => {
    const s = sets[i];
    return s ? { keep: s.keeper, sel: new Set(s.photos.filter((p, j) => j !== s.keeper && !lockOf.get(p.id)).map((p) => p.id)) } : { keep: 0, sel: new Set<string>() };
  };
  const [at, setAt] = useState(0);
  const [cur, setCur] = useState(() => fresh(0));
  const [marked, setMarked] = useState<Marked[]>([]);
  const [ask, setAsk] = useState<ConfirmSpec | null>(null);
  const [view, setView] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = sets[at] as ShotSet | undefined;
  const keeper = set?.photos[cur.keep];
  const others = useMemo(() => (set ? set.photos.filter((_, j) => j !== cur.keep) : []), [set, cur.keep]);
  const grid = useMemo(() => others.map((p) => ({ p, badge: lockOf.get(p.id), chip: missChip(shotCheck(p, set!.photos)) })), [others, set, lockOf]);
  const removing = others.filter((p) => cur.sel.has(p.id));
  const total = marked.reduce((a, m) => a + m.remove.length, 0);
  const totalBytes = marked.reduce((a, m) => a + m.remove.reduce((b, p) => b + p.size, 0), 0);

  const advance = (m?: Marked) => {
    if (m?.remove.length) setMarked((x) => [...x, m]);
    setAt(at + 1); setCur(fresh(at + 1)); setMsg(null);
    dx.value = 0;
  };
  function swiped(left: boolean) {
    if (left && set && keeper) advance({ keeper, remove: set.photos.filter((p, j) => j !== cur.keep && cur.sel.has(p.id)) });
    else advance();
  }
  // tap a take: it's the keeper now; the old keeper goes to Trash with the rest (unless it's locked)
  const makeKeeper = useCallback((id: string) => {
    if (!set) return;
    setCur((c) => {
      const j = set.photos.findIndex((p) => p.id === id);
      const sel = new Set(c.sel); sel.delete(id);
      const old = set.photos[c.keep];
      if (!lockOf.get(old.id)) sel.add(old.id);
      return { keep: j, sel };
    });
  }, [set, lockOf]);
  const mark = (id: string, remove: boolean) => {
    const apply = () => setCur((c) => { const sel = new Set(c.sel); if (remove) sel.add(id); else sel.delete(id); return { ...c, sel }; });
    const lock = lockOf.get(id);
    if (remove && lock) setAsk(lockConfirm(lock, apply)); else apply();
  };
  // swipe the keeper: left = done with this set (the marked takes go), right = skip it; Reduce Motion keeps the buttons only
  const still = useReducedMotion();
  const dx = useSharedValue(0);
  const W2 = W + 32;
  const swipe = Gesture.Pan().withTestId('keeper-swipe').enabled(!still && !busy).activeOffsetX([-18, 18]).failOffsetY([-14, 14])
    .onUpdate((e) => { dx.value = e.translationX; })
    .onEnd((e) => {
      const go = Math.abs(e.translationX) > W2 * 0.3 || Math.abs(e.velocityX) > 900;
      if (!go) { dx.value = withTiming(0, { duration: 160 }); return; }
      const left = e.translationX < 0;
      dx.value = withTiming(left ? -W2 : W2, { duration: 160 }, () => { scheduleOnRN(swiped, left); });
    });
  const lift = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }, { rotate: `${dx.value / 40}deg` }], opacity: 1 - Math.min(0.5, Math.abs(dx.value) / W2) }));
  const openTake = useCallback((i: number) => set && setView(set.photos.findIndex((p) => p.id === others[i].id)), [set, others]);

  // Pro: deciding takes is free; moving them to Trash opens the paywall for a free user (undo and restore stay free)
  const move = () => (!isPro ? openPaywall('tidy') : setAsk(moveConfirm(total, totalBytes, async () => {
    setBusy(true); setMsg(null);
    try {
      const done = await moveToTrash(marked.flatMap((m) => m.remove.map((p) => ({ p, pile: 'same' as const }))), marked.map((m) => m.keeper));
      if (done) { router.back(); return; }
      setMsg(tr('tidy.nothingMoved'));
    } catch (e) {
      console.warn('[tidy] move failed:', e);
      setMsg(tr('tidy.nothingMoved'));
    }
    setBusy(false);
  })));
  const moveLabel = tr('tidy.moveToTrashCount', { count: total });

  const top = (
    <View style={{ paddingTop: insets.top + 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconButton label={tr('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/tidy'))}><Icons.back size={16} /></IconButton>
      <View style={{ flex: 1 }}>
        <Text style={[display(20), { color: t.ink }]} numberOfLines={1}>{set ? tr('tidy.sameShotSetProgress', { current: at + 1, total: sets.length }) : tr('tidy.sameShot')}</Text>
        {keeper ? <Text style={[ui(11.5, 500), { color: t.inkMuted }]}>{when(keeper.created)}</Text> : null}
      </View>
      {set && total ? <Pill label={moveLabel} onPress={move} height={30} size={11} right={!isPro ? <ProBadge /> : null} /> : null}
    </View>
  );

  if (!set || !keeper) {
    return (
      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        {top}
        <FrameCard radius={18} padding={16} style={{ marginTop: 14, gap: 8 }}>
          <Text style={[display(18), { color: t.ink }]}>{sets.length ? tr('tidy.everySetDone') : tr('tidy.noSameShotSets')}</Text>
          <Text style={[ui(12.5), { color: t.inkMuted, lineHeight: 18 }]}>
            {total ? tr('tidy.markedSummary', { count: total, bytes: formatBytes(totalBytes) }) : tr('tidy.nothingMarkedForTrash')}
          </Text>
          {msg ? <Text style={[ui(12, 500), { color: t.inkMuted }]}>{msg}</Text> : null}
          <View style={{ marginTop: 4 }}>
            {total ? <Primary label={moveLabel} onPress={move} disabled={busy} pro={!isPro} /> : <Primary label={tr('common.done')} onPress={() => router.back()} />}
          </View>
        </FrameCard>
        <StatusScrim />
        <Confirm c={ask} onClose={() => setAsk(null)} />
      </View>
    );
  }

  const picked = cur.keep !== set.keeper;
  const out = set.photos.length > 2 ? outtake(set, cur.keep, vecs) : null;
  const h = Math.round(W * Math.min(1.25, Math.max(0.6, keeper.h / Math.max(1, keeper.w))));
  const bytes = removing.reduce((a, p) => a + p.size, 0);
  const header = (
    <View style={{ paddingBottom: 12, gap: 10 }}>
      {top}
      <Text style={[ui(12.5), { color: t.inkMuted, lineHeight: 18 }]}>
        {tr('tidy.takesSummary', { count: set.photos.length, kept: picked ? tr('tidy.yourPick') : set.reason })}
      </Text>
      <GestureDetector gesture={swipe}>
        <Animated.View style={lift}>
          <Tap onLongPress={() => setView(cur.keep)} delayLongPress={350} accessibilityRole="button" accessibilityLabel={picked ? tr('tidy.yourPick') : tr('tidy.keeper')} accessibilityHint={tr('create.holdToEnlarge')}>
            <Print uri={keeper.uri} w={W} h={h} r={14} date={keeper.created} />
            <View style={{ position: 'absolute', top: 8, left: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: t.ink }}>
              <Text style={[ui(10.5, 600), { color: t.bgScreen }]}>{picked ? tr('tidy.yourPick') : tr('tidy.keeper')}</Text>
            </View>
          </Tap>
        </Animated.View>
      </GestureDetector>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {shotCheck(keeper, set.photos).map((c) => (
          <View key={c.text} style={{ paddingHorizontal: 8, height: 22, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: c.ok ? t.borderSubtle : t.borderStrong, backgroundColor: c.ok ? t.bgCard : 'transparent' }}>
            {c.ok ? <Icons.check size={11} color={t.ink} /> : <Icons.close size={11} color={t.inkMuted} />}
            <Text style={[ui(10.5, 500), { color: c.ok ? t.ink : t.inkMuted }]}>{checkLabel(c.text)}</Text>
          </View>
        ))}
      </View>
      <Text style={[ui(11), { color: t.inkMuted, lineHeight: 16 }]}>
        {still ? tr('tidy.takeHintStill') : tr('tidy.takeHintSwipe')}
      </Text>
      {out && cur.sel.has(out.id) ? (
        <Tap onPress={() => mark(out.id, false)} accessibilityRole="button" accessibilityLabel={tr('tidy.keepOuttakeToo')} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
          <Text style={[ui(12, 600), { color: t.ink, textDecorationLine: 'underline' }]}>{tr('tidy.keepOuttakeToo')}</Text>
        </Tap>
      ) : null}
    </View>
  );
  const footer = (
    <View style={{ paddingTop: 10, gap: 8, paddingBottom: insets.bottom }}>
      {msg ? <Text style={[ui(12, 500), { color: t.inkMuted, textAlign: 'center' }]}>{msg}</Text> : null}
      <Primary label={tr('tidy.keepRemoveSummary', { keep: set.photos.length - removing.length, remove: removing.length, bytes: formatBytes(bytes) })} onPress={() => advance({ keeper, remove: removing })} disabled={busy} />
      <Tap onPress={() => advance()} accessibilityRole="button" accessibilityLabel={tr('tidy.skipSet')} style={{ height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[ui(13, 600), { color: t.inkMuted }]}>{tr('tidy.skipSet')}</Text>
      </Tap>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <TidyGrid items={grid} selected={cur.sel} onPress={makeKeeper} onLongPress={openTake} header={header} footer={footer} />
      <StatusScrim />
      <PhotoViewer photos={set.photos} index={view} onClose={() => setView(null)} footer={(p, i) => (
        <View>
          <ShotCheckList checks={shotCheck(p, set.photos)} />
          {i === cur.keep
            ? <Text style={[ui(12, 600), { color: '#fff', marginTop: 10 }]}>{picked ? tr('tidy.yourPick') : tr('tidy.keeper')}</Text>
            : <KeepToggle removing={cur.sel.has(p.id)} onChange={(r) => mark(p.id, r)} />}
        </View>
      )} />
      <Confirm c={ask} onClose={() => setAsk(null)} />
    </View>
  );
}
