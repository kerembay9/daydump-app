import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlatList, RefreshControl, StyleSheet, Text, TextStyle, useWindowDimensions, View, ViewStyle } from 'react-native';
import { Canvas, ColorMatrix, Fill, FractalNoise, RadialGradient, Skia, Turbulence, vec } from '@shopify/react-native-skia';
import { router, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useProgress } from '../../state/AppState';
import type { Story } from '../../services/stories';
import { useProfile } from '../../services/profile';
import { MergeSheet } from '../../components/create/PeopleFilter';
import { peopleIn, usePeople, type Person } from '../../services/people';
import { ThemePatch, useTheme } from '../../theme/ThemeProvider';
import { fixed, parchment } from '../../theme/tokens';
import { display, ui } from '../../theme/type';
import { AvatarButton, TopHeader } from '../../components/ui/TopHeader';
import { FrameCard } from '../../components/ui/FrameCard';
import { CornerTape, hash, Tape, TAPE_H, useBands } from '../../components/ui/Tape';
import { PhotoStack, StackKind } from '../../components/ui/PhotoStack';
import { Tap } from '../../components/ui/Tap';
import { StatusScrim } from '../../components/ui/Screen';
import { type PaperStyle, ScrapTapes } from '../../components/ui/ScrapPaper';
import { coverageLine, IndexStrip } from '../../components/IndexStrip';
import { ModelLoading } from '../../components/ModelLoading';
import { TodayCard } from '../../components/TodayCard';
import { FaceThumb } from '../../components/FaceCircle';
import { FirstDumpStrip, useFirstDump } from '../../components/FirstDumpStrip';
import { useModels } from '../../state/models';
import { usePro } from '../../state/Pro';
import { LockBadge, LOCKED_BLUR } from '../../components/LockedDump';
import { tr } from '../../i18n';

const preview = (id: string) => router.push({ pathname: '/preview/[id]', params: { id } });
const uris = (s: Story) => s.picks.map((p) => p.uri);

/** Titles always fit: up to 2 lines, shrinking to 85% before giving up (user nit: never "…"). */
function Title({ text, style }: { text: string; style: TextStyle }) {
  const { t } = useTheme();
  return <Text style={[style, { color: t.ink }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>{text}</Text>;
}

function Meta({ s, size = 10 }: { s: Story; size?: number }) {
  const { t } = useTheme();
  return <Text style={[ui(size, 500), { color: t.inkMuted, marginTop: 2 }]}>{s.subtitle}</Text>;
}

/** Light mode's parchment: a warm tan wash, browner edges, and sepia (not near-black ink) for the noise. */
const PARCHMENT = 'rgba(214,168,92,0.22)';
const PARCHMENT_EDGE = 'rgba(150,98,36,0.18)';
const SEPIA = '#5A3A18';
/** Paper cards: sepia ink, so text sits on the sheets like the grain does */
const SEPIA_PARCHMENT = { ...parchment, ink: '#3B2A1C', inkMuted: '#86704F' };
/** Paper cards lean more than the rounded ones, their prints less */
const PAPER_TILT = 1.6, PAPER_PRINT_TILT = 0.6;

/** Noise to the ink colour, its alpha = k * noise + o (clamped): a positive o with small k tints evenly, a negative o shows only the peaks. */
const tint = ([r, g, b]: Float32Array | number[], k: number, o: number) => [0, 0, 0, 0, r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, k, 0, 0, 0, o];

/**
 * Developer tools → Paper grain: a static layer over the screen colour, under the cards, in three passes of ink:
 * cloudy mottling (big, soft), fibres (thin turbulence veins), and fine specks. height: only the top strip (same noise, so it lines up).
 */
function Paper({ height }: { height?: number }) {
  const { t } = useTheme();
  const ink = Skia.Color(t.dark ? t.ink : SEPIA);
  const { width: w, height: h } = useWindowDimensions(); // window, not canvas, so the top strip's edges match the full layer
  return (
    <Canvas testID="paper" style={height ? { position: 'absolute', top: 0, left: 0, right: 0, height } : StyleSheet.absoluteFill} pointerEvents="none">
      {!t.dark && <>
        {/* parchment: a tan wash, a touch darker towards the edges */}
        <Fill color={PARCHMENT} />
        <Fill>
          <RadialGradient c={vec(w / 2, h * 0.45)} r={Math.hypot(w, h) * 0.6} colors={['transparent', PARCHMENT_EDGE]} positions={[0.45, 1]} />
        </Fill>
      </>}
      <Fill>
        <FractalNoise freqX={0.006} freqY={0.009} octaves={4} seed={3} />
        <ColorMatrix matrix={tint(ink, 0.4, -0.15)} />
      </Fill>
      <Fill>
        <Turbulence freqX={0.03} freqY={0.07} octaves={2} seed={7} />
        <ColorMatrix matrix={tint(ink, -1.6, 0.1)} />
      </Fill>
      <Fill>
        <FractalNoise freqX={1.1} freqY={1.1} octaves={1} seed={11} />
        <ColorMatrix matrix={tint(ink, 1.5, -0.96)} />
      </Fill>
    </Canvas>
  );
}

/** Bands "more": where a tile's tape goes, by story (centre, a corner, or both corners). Render inside the card so it tilts with it. */
function TileTape({ id }: { id: string }) {
  const at = hash(id) % 4;
  return <>
    {at === 0 && <Tape seed={id} rotate={hash(id) % 2 ? 3 : -3} style={{ top: -TAPE_H / 2 }} />}
    {(at === 1 || at === 3) && <CornerTape seed={`${id}:l`} side="left" />}
    {(at === 2 || at === 3) && <CornerTape seed={`${id}:r`} side="right" />}
  </>;
}

/** Who's in the dump: a few small faces on the corner of the prints, adding no height. Tap one: Create, with that person's photos. */
function TileFaces({ s }: { s: Story }) {
  const { shown } = usePeople();
  const who = useMemo(() => peopleIn(s.picks, shown), [s.picks, shown]);
  const [merging, setMerging] = useState<Person | null>(null);
  if (!who.length) return null;
  return (
    <View style={{ position: 'absolute', right: 2, bottom: 2, flexDirection: 'row' }}>
      {who.map((p, i) => (
        <Tap key={p.id} hitSlop={4} onPress={() => router.navigate({ pathname: '/create', params: { person: String(p.id), at: String(Date.now()) } })} onLongPress={() => setMerging(p)}
          accessibilityRole="button" accessibilityLabel={`Photos with ${p.name || 'this person'}`} accessibilityHint="Hold to merge"
          style={{ marginLeft: i ? -5 : 0, borderRadius: 12, borderWidth: 1.5, borderColor: fixed.printBorder, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
          <FaceThumb uri={p.shots[0].uri} box={p.shots[0].f} size={20} />
        </Tap>
      ))}
      <MergeSheet from={merging} people={shown} onClose={() => setMerging(null)} />
    </View>
  );
}

/** One "other dump" tile of the bento: stacked prints, then the title and meta. Stretches to its row's height. more: scrapbook (bigger tilt, tape). paper: a paper sheet with its own tape. locked: blurred, with a lock. */
function Tile({ s, kind, rotate, onPress, style, more, paper, locked }: { s: Story; kind: StackKind; rotate: number; onPress: () => void; style?: ViewStyle; more?: boolean; paper?: PaperStyle; locked: boolean }) {
  const wide = kind === 'wide';
  return (
    <FrameCard radius={14} padding={8} rotate={paper ? rotate * PAPER_TILT : more ? rotate * 2.6 : rotate} paper={paper && s.id} onPress={onPress} label={`${s.title}, ${s.subtitle}${locked ? `, ${tr('discover.locked')}` : ''}`} style={style}>
      <View style={{ marginBottom: kind === 'tall' ? 8 : 6 }}>
        <PhotoStack kind={kind} uris={uris(s)} tilt={paper ? PAPER_PRINT_TILT : 1} blur={locked ? LOCKED_BLUR : undefined} />
        {!locked && <TileFaces s={s} />}
      </View>
      {wide ? (
        <View style={{ paddingHorizontal: 4, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <View style={{ flex: 1 }}><Title text={s.title} style={display(16)} /></View>
          <Meta s={s} />
        </View>
      ) : (
        <View style={{ paddingHorizontal: 2 }}>
          <Title text={s.title} style={display(kind === 'tall' ? 16 : 15.5)} />
          <Meta s={s} />
        </View>
      )}
      {locked && <LockBadge />}
      {more && <TileTape id={s.id} />}
      {paper && <ScrapTapes id={s.id} style={paper} />}
    </FrameCard>
  );
}

/** Mock bento: tall left, top + mid right, wide below; repeated for every 4 stories. Short last blocks degrade. */
const Bento = React.memo(function Bento({ block, more, paper, isLocked, open }: { block: Story[]; more: boolean; paper?: PaperStyle; isLocked: (s: Story) => boolean; open: (s: Story) => void }) {
  const [a, b, c, d] = block;
  const tile = (s: Story, kind: StackKind, rotate: number, style?: ViewStyle) => <Tile key={s.id} s={s} kind={kind} rotate={rotate} onPress={() => open(s)} style={style} more={more} paper={paper} locked={isLocked(s)} />;
  const gap = more || paper ? 14 : 8; // room for the tape between tiles
  return (
    <View style={{ gap, marginBottom: gap }}>
      {block.length === 2 ? (
        <View style={{ flexDirection: 'row', gap }}>{tile(a, 'top', 0.7, { flex: 1 })}{tile(b, 'mid', -0.6, { flex: 1 })}</View>
      ) : block.length >= 3 ? (
        <View style={{ flexDirection: 'row', gap }}>
          {tile(a, 'tall', -0.8, { flex: 1 })}
          <View style={{ flex: 1, gap }}>{tile(b, 'top', 0.7, { flex: 1 })}{tile(c, 'mid', -0.6, { flex: 1 })}</View>
        </View>
      ) : null}
      {block.length === 1 ? tile(a, 'wide', more ? 0.4 : 0) : d ? tile(d, 'wide', more ? -0.4 : 0, { marginTop: 2 }) : null}
    </View>
  );
});

/** Tape-topped card for the empty and no-permission states. */
function TapedNote({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  const { t } = useTheme();
  return (
    <View style={{ paddingTop: 8, paddingBottom: 4 }}>
      <FrameCard radius={16} padding={16} rotate={-1} style={{ gap: 8 }}>
        <Text style={[display(19.5, 1.1), { color: t.ink }]}>{title}</Text>
        <Text style={[ui(12, 400), { color: t.inkMuted, lineHeight: 17 }]}>{body}</Text>
        <Tap onPress={onAction} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: 4, height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.ink, justifyContent: 'center' }}>
          <Text style={[ui(12, 600), { color: t.bgScreen }]}>{action}</Text>
        </Tap>
      </FrameCard>
      <Tape />
    </View>
  );
}

const FIRST_PAYWALL = '@picdump_first_paywall_shown';

/**
 * Once ever: when indexing is done and Discover shows locked dumps, the paywall lists what it found. Most trials start
 * on day one, and this is the first moment the user can see what Pro opens. settled also means Discover is on screen
 * (not under onboarding, Edit or a Post) and RevenueCat has answered this session: a subscriber is free until then.
 */
function useFirstPaywall(stories: Story[], settled: boolean, isLocked: (s: Story) => boolean, openPaywall: (source: 'first-discover', found: string[]) => void) {
  const locked = useMemo(() => stories.filter(isLocked).map((s) => s.title), [stories, isLocked]);
  useEffect(() => {
    if (!settled || !locked.length) return;
    let live = true;
    AsyncStorage.getItem(FIRST_PAYWALL).then(async (seen) => {
      if (seen || !live) return;
      await AsyncStorage.setItem(FIRST_PAYWALL, '1');
      openPaywall('first-discover', locked);
    }).catch(() => {});
    return () => { live = false; };
  }, [settled, locked, openPaywall]);
}

/** Discover (ph2.png, "scrapbook bento"): the Today card (Dump Meter), then every dump in repeating bento blocks; today's own dump is the card's. */
export default function Discover() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { stories, loaded, permission, limited, askPhotos, paused, pause, resume, shuffleStories, moreStories, showMoreStories, onboarding } = useApp();
  const pro = usePro();
  const isLocked = useCallback((s: Story) => pro.accessOf(s) === 'locked', [pro]);
  // the first dump's print shows its picks: a free user's comes from the dumps they can open (today, recaps, unlocks)
  const isOpen = useCallback((s: Story) => !isLocked(s), [isLocked]);
  const first = useFirstDump(stories, loaded, onboarding, isOpen);
  const { progress, coverageSince } = useProgress();
  const [loadingMore, setLoadingMore] = useState(false);
  const name = useProfile().name.trim().split(/\s+/)[0] ?? '';
  const [refreshing, setRefreshing] = useState(false);
  const vision = useModels()?.vision; // indexing waits for it (release builds download it after the install)
  const { paper, cards } = useProfile();
  // paper cards bring their own tape, so Bands only dresses the classic ones (dark mode: charcoal sheets)
  const sheets = cards !== 'classic' ? cards : undefined;
  const more = useBands() === 'more' && !sheets;
  const open = useCallback((s: Story) => (isLocked(s) ? pro.askUnlock(s) : preview(s.id)), [isLocked, pro]);
  const focused = useIsFocused();
  useFirstPaywall(stories, loaded && !progress && !paused && !onboarding && focused && pro.checked, isLocked, pro.openPaywall);

  const others = useMemo(() => stories.filter((s) => s.kind !== 'today'), [stories]);
  const blocks = useMemo(() => Array.from({ length: Math.ceil(others.length / 4) }, (_, i) => others.slice(i * 4, i * 4 + 4)), [others]);

  const renderBento = useCallback(({ item }: { item: Story[] }) => <Bento block={item} more={more} paper={sheets} isLocked={isLocked} open={open} />, [more, sheets, isLocked, open]);

  // Pull to refresh = shuffle: what's on screen is marked seen and drops down the ranking.
  const shuffle = async () => {
    setRefreshing(true);
    try {
      await shuffleStories(others.slice(0, 8).map((s) => s.id));
    } finally {
      setRefreshing(false);
    }
  };

  const header = (
    <>
      <TopHeader title={name ? tr('discover.greeting', { name }) : tr('discover.greetingDefault')} right={<AvatarButton onPress={() => router.push('/profile')} />} />
      <IndexStrip progress={progress} paused={paused} hasStories={stories.length > 0} coverageSince={coverageSince} onPause={pause} onResume={resume} />
      {(progress || paused) && stories.length > 0 && permission !== false && (
        <Text style={[ui(11, 400), { color: t.inkMuted, marginTop: 2, paddingHorizontal: 2 }]}>
          {/* the strip shows the reach unless it's busy with the battery line or paused */}
          {(!progress || progress.batteryPct !== undefined) && coverageSince != null && `${coverageLine(coverageSince)}. `}{tr('discover.indexingAdvice')}
        </Text>
      )}
      {permission && limited && (
        // Android 14 "Select photos": asking again shows Android's dialog with "Allow all" and the picker
        <TapedNote
          title={tr('discover.limitedTitle')}
          body={tr('discover.limitedBody')}
          action={tr('discover.limitedAction')}
          onAction={askPhotos}
        />
      )}
      {permission === false ? (
        <TapedNote
          title={tr('discover.permissionTitle')}
          body={tr('discover.permissionBody')}
          action={tr('discover.permissionAction')}
          onAction={askPhotos}
        />
      ) : stories.length ? (
        <TodayCard more={more} paper={!!sheets} />
      ) : vision && vision.state !== 'ready' ? (
        <ModelLoading pack="vision" s={vision} />
      ) : loaded ? (
        <TapedNote
          title={progress || paused ? tr('discover.buildingTitle') : tr('discover.noDumpsTitle')}
          body={progress || paused ? tr('discover.buildingBody') : tr('discover.noDumpsBody')}
          action={tr('discover.createOneNow')}
          onAction={() => router.navigate('/create')}
        />
      ) : null}
      {others.length > 0 && <View style={{ height: more ? 16 : 12 }} />}
    </>
  );

  return (
    <ThemePatch patch={paper && !t.dark ? (sheets ? SEPIA_PARCHMENT : parchment) : undefined}>
    <View style={{ flex: 1 }}>
      {paper && <Paper />}
      <FlatList
        data={blocks}
        keyExtractor={(b) => b[0].id}
        renderItem={renderBento}
        extraData={renderBento}
        ListHeaderComponent={header}
        ListFooterComponent={moreStories ? (
          <FrameCard radius={18} onPress={loadingMore ? undefined : () => { setLoadingMore(true); showMoreStories().finally(() => setLoadingMore(false)); }}
            label={tr('discover.moreDumps')} style={{ height: 44, marginTop: 4, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[ui(13, 600), { color: t.ink }]}>{loadingMore ? tr('discover.makingMoreDumps') : tr('discover.moreDumps')}</Text>
          </FrameCard>
        ) : null}
        showsVerticalScrollIndicator={false}
        initialNumToRender={2}
        windowSize={5}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={shuffle} enabled={stories.length > 1} colors={[t.ink]} progressBackgroundColor={t.bgCard} progressViewOffset={insets.top} />
        }
      />
      {first.story && <FirstDumpStrip story={first.story} onDone={first.done} />}
      <StatusScrim />
      {paper && <Paper height={insets.top} />}
    </View>
    </ThemePatch>
  );
}
