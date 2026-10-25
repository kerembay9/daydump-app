import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, RefreshControl, Text, TextStyle, View, ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useProgress } from '../../state/AppState';
import type { Story } from '../../services/stories';
import { useProfile } from '../../services/profile';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { AvatarButton, TopHeader } from '../../components/ui/TopHeader';
import { FrameCard } from '../../components/ui/FrameCard';
import { Tape } from '../../components/ui/Tape';
import { PhotoStack, StackKind } from '../../components/ui/PhotoStack';
import { Tap } from '../../components/ui/Tap';
import { StatusScrim } from '../../components/ui/Screen';
import { coverageLine, IndexStrip } from '../../components/IndexStrip';
import { ModelLoading } from '../../components/ModelLoading';
import { useModels } from '../../state/models';

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

/** One "other dump" tile of the bento: stacked prints, then the title and meta. Stretches to its row's height. */
function Tile({ s, kind, rotate, onPress, style }: { s: Story; kind: StackKind; rotate: number; onPress: () => void; style?: ViewStyle }) {
  const wide = kind === 'wide';
  return (
    <FrameCard radius={14} padding={8} rotate={rotate} onPress={onPress} label={`${s.title}, ${s.subtitle}`} style={style}>
      <PhotoStack kind={kind} uris={uris(s)} style={{ marginBottom: kind === 'tall' ? 8 : 6 }} />
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
    </FrameCard>
  );
}

/** Mock bento: tall left, top + mid right, wide below; repeated for every 4 stories. Short last blocks degrade. */
const Bento = React.memo(function Bento({ block }: { block: Story[] }) {
  const [a, b, c, d] = block;
  const tile = (s: Story, kind: StackKind, rotate: number, style?: ViewStyle) => <Tile key={s.id} s={s} kind={kind} rotate={rotate} onPress={() => preview(s.id)} style={style} />;
  return (
    <View style={{ gap: 8, marginBottom: 8 }}>
      {block.length === 2 ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>{tile(a, 'top', 0.7, { flex: 1 })}{tile(b, 'mid', -0.6, { flex: 1 })}</View>
      ) : block.length >= 3 ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {tile(a, 'tall', -0.8, { flex: 1 })}
          <View style={{ flex: 1, gap: 8 }}>{tile(b, 'top', 0.7, { flex: 1 })}{tile(c, 'mid', -0.6, { flex: 1 })}</View>
        </View>
      ) : null}
      {block.length === 1 ? tile(a, 'wide', 0) : d ? tile(d, 'wide', 0, { marginTop: 2 }) : null}
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

function Hero({ s }: { s: Story }) {
  const { t } = useTheme();
  return (
    <View style={{ paddingTop: 8, paddingBottom: 4 }}>
      <FrameCard radius={16} padding={10} rotate={-1}>
        <Tap onPress={() => preview(s.id)} accessibilityRole="button" accessibilityLabel={`Preview ${s.title}`}>
          <PhotoStack kind="hero" uris={uris(s)} />
        </Tap>
        <View style={{ paddingTop: 8, paddingBottom: 2, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Title text={s.title} style={display(19.5)} />
            <Meta s={s} size={10.5} />
          </View>
          <Tap onPress={() => preview(s.id)} accessibilityRole="button" style={{ height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: t.ink, justifyContent: 'center' }}>
            <Text style={[ui(11, 600), { color: t.bgScreen }]}>Preview</Text>
          </Tap>
        </View>
      </FrameCard>
      <Tape />
    </View>
  );
}

/** Discover (ph2.png, "scrapbook bento"): hero dump + every other dump in repeating bento blocks. */
export default function Discover() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { stories, loaded, permission, paused, pause, resume, shuffleStories, moreStories, showMoreStories } = useApp();
  const { progress, coverageSince } = useProgress();
  const [loadingMore, setLoadingMore] = useState(false);
  const name = useProfile().name.trim().split(/\s+/)[0] ?? '';
  const [refreshing, setRefreshing] = useState(false);
  const vision = useModels()?.vision; // indexing waits for it (release builds download it after the install)


  const hero = stories[0];
  const others = useMemo(() => stories.filter((s) => s !== hero), [stories, hero]);
  const blocks = useMemo(() => Array.from({ length: Math.ceil(others.length / 4) }, (_, i) => others.slice(i * 4, i * 4 + 4)), [others]);

  const renderBento = useCallback(({ item }: { item: Story[] }) => <Bento block={item} />, []);

  // Pull to refresh = shuffle: what's on screen is marked seen and drops down the ranking.
  const shuffle = async () => {
    setRefreshing(true);
    try {
      await shuffleStories([hero, ...others.slice(0, 4)].filter(Boolean).map((s) => s.id));
    } finally {
      setRefreshing(false);
    }
  };

  const header = (
    <>
      <TopHeader title={name ? `Hi, ${name}` : 'Hi there'} right={<AvatarButton onPress={() => router.push('/profile')} />} />
      <IndexStrip progress={progress} paused={paused} hasStories={stories.length > 0} coverageSince={coverageSince} onPause={pause} onResume={resume} />
      {(progress || paused) && hero && permission !== false && (
        <Text style={[ui(11, 400), { color: t.inkMuted, marginTop: 2, paddingHorizontal: 2 }]}>
          {/* the strip shows the reach unless it's busy with the battery line or paused */}
          {(!progress || progress.batteryPct !== undefined) && coverageSince != null && `${coverageLine(coverageSince)}. `}Dumps get better once your whole library is read.
        </Text>
      )}
      {permission === false ? (
        <TapedNote
          title="Let PicDump see your photos"
          body="Dumps are made on your phone from your camera roll. Nothing leaves your device."
          action="Open settings"
          onAction={() => Linking.openSettings()}
        />
      ) : hero ? (
        <Hero s={hero} />
      ) : vision && vision.state !== 'ready' ? (
        <ModelLoading pack="vision" s={vision} />
      ) : loaded ? (
        <TapedNote
          title={progress || paused ? 'Building your dumps…' : 'No dumps yet'}
          body={progress || paused ? 'They show up here as your photos are read. Or make one yourself.' : 'Take a few more photos and they’ll show up here. Or make one yourself.'}
          action="Create one now"
          onAction={() => router.navigate('/create')}
        />
      ) : null}
      {others.length > 0 && <View style={{ height: 12 }} />}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={blocks}
        keyExtractor={(b) => b[0].id}
        renderItem={renderBento}
        ListHeaderComponent={header}
        ListFooterComponent={moreStories ? (
          <FrameCard radius={18} onPress={loadingMore ? undefined : () => { setLoadingMore(true); showMoreStories().finally(() => setLoadingMore(false)); }}
            label="Discover more dumps" style={{ height: 44, marginTop: 4, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[ui(13, 600), { color: t.ink }]}>{loadingMore ? 'Making more dumps…' : 'Discover more dumps'}</Text>
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
      <StatusScrim />
    </View>
  );
}
