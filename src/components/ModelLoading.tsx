import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { ModelPack, PackState } from '../../modules/clip-embedder';
import { useTheme } from '../theme/ThemeProvider';
import { display, ui } from '../theme/type';
import { fixed } from '../theme/tokens';
import { FrameCard } from './ui/FrameCard';
import { Tape } from './ui/Tape';

const WHAT: Record<ModelPack, { title: string; after: string }> = {
  vision: { title: 'Getting your dumps ready', after: 'Your dumps start right after, all on your phone.' },
  faces: { title: 'Fetching the face finder', after: 'It spots you in your photos, on your phone.' },
  text: { title: 'Word search is on its way', after: 'Places and months work now.' },
};

/** [title, body, progress 0..1 or null = unknown] for a pack that isn't on the phone yet. */
export function packCopy(pack: ModelPack, s: PackState): [string, string, number | null] {
  const { title, after } = WHAT[pack];
  const pct = Math.round(s.progress * 100);
  switch (s.state) {
    case 'downloading': return [title, `Downloading${pct ? ` (${pct}%)` : ''}. ${after}`, pct ? s.progress : null];
    case 'queued': return [title, `Next in line after the other downloads. ${after}`, null];
    case 'waiting': return [title, `Waiting for Wi-Fi. ${after}`, null];
    case 'failed': return [title, 'The download stopped. PicDump tries again when you come back.', 0];
    default: return [title, `This copy of PicDump can’t download it. Install it from Google Play.${s.error ? ` (Play error ${s.error})` : ''}`, 0];
  }
}

/** Three blank prints "developing" in turn while the fan bobs: the wait looks like the app's own scrapbook. */
export function Developing() {
  const bob = useSharedValue(0);
  useEffect(() => { bob.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true); }, [bob]);
  const fan = useAnimatedStyle(() => ({ transform: [{ translateY: -4 * bob.value }] }));
  return (
    <Animated.View style={[{ flexDirection: 'row', justifyContent: 'center', height: 76, marginBottom: 4 }, fan]}>
      {[-7, 2, 8].map((r, i) => <Blank key={i} i={i} rotate={r} />)}
    </Animated.View>
  );
}

function Blank({ i, rotate }: { i: number; rotate: number }) {
  const { t } = useTheme();
  const dev = useSharedValue(0);
  useEffect(() => {
    dev.value = withDelay(i * 450, withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1));
  }, [dev, i]);
  const photo = useAnimatedStyle(() => ({ opacity: 0.12 + 0.5 * dev.value }));
  return (
    <View style={{ width: 52, height: 62, marginHorizontal: -6, marginTop: i === 1 ? 0 : 8, padding: 4, paddingBottom: 12, borderRadius: 4,
      backgroundColor: fixed.printBorder, boxShadow: '0 1px 4px rgba(38,31,27,0.18)', transform: [{ rotate: `${rotate}deg` }], zIndex: i === 1 ? 1 : 0 }}>
      <Animated.View style={[{ flex: 1, borderRadius: 2, backgroundColor: t.ink }, photo]} />
    </View>
  );
}

/** progress 0..1; null = unknown, a segment sweeps across. */
export function Bar({ progress }: { progress: number | null }) {
  const { t } = useTheme();
  const v = useSharedValue(progress ?? 0);
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (progress == null) sweep.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1);
    else v.value = withTiming(progress, { duration: 400 });
  }, [progress, v, sweep]);
  const fill = useAnimatedStyle(() => progress == null
    ? { left: `${-35 + 135 * sweep.value}%`, width: '35%' }
    : { left: '0%', width: `${100 * v.value}%` });
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: t.borderStrong, overflow: 'hidden', marginTop: 4 }}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, borderRadius: 2, backgroundColor: t.ink }, fill]} />
    </View>
  );
}

/** Tape-topped card shown in place of a feature until its model is on the phone. */
export function ModelLoading({ pack, s }: { pack: ModelPack; s: PackState }) {
  const { t } = useTheme();
  const [title, body, progress] = packCopy(pack, s);
  return (
    <View style={{ paddingTop: 8, paddingBottom: 4 }}>
      <FrameCard radius={16} padding={16} rotate={-1} style={{ gap: 8 }}>
        <Developing />
        <Text style={[display(19.5, 1.1), { color: t.ink }]}>{title}</Text>
        <Text style={[ui(12, 400), { color: t.inkMuted, lineHeight: 17 }]}>{body}</Text>
        <Bar progress={progress} />
      </FrameCard>
      <Tape />
    </View>
  );
}
