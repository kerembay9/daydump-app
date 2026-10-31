import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Story } from '../services/stories';
import { useTheme } from '../theme/ThemeProvider';
import { fixed } from '../theme/tokens';
import { display, ui } from '../theme/type';
import { tr } from '../i18n';

const KEY = '@daydump_first_dump_shown';

/**
 * The very first dump, once: after onboarding (indexing may already have made it by then), or after Home had none. Waits for
 * onboarding to close and Home to be the tab showing, however long that takes. Someone who already had dumps when this shipped
 * never sees it (marked shown at once). Locked dumps count as dumps here; the print itself only shows one the user can open.
 */
export function useFirstDump(stories: Story[], loaded: boolean, onboarding: boolean, isOpen: (s: Story) => boolean) {
  const [shown, setShown] = useState<boolean | null>(null); // null: not read yet
  const [focused, setFocused] = useState(false);
  const [playing, setPlaying] = useState<Story | null>(null); // held: the 30 s rebuilds may reorder stories mid-print
  const fresh = useRef(false); // onboarding showed, or Home had no dumps
  useEffect(() => { AsyncStorage.getItem(KEY).then((v) => setShown(v === 'true'), () => setShown(true)); }, []);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    if (onboarding || (loaded && !stories.length)) fresh.current = true;
    if (shown !== false || !stories.length) return;
    if (fresh.current && (onboarding || !focused)) return; // wait for Home to be what's showing
    // the print shows picks: a free user's comes from the first dump they can open; with none open, no print
    const open = stories.find(isOpen);
    if (fresh.current && open) setPlaying(open);
    setShown(true);
    AsyncStorage.setItem(KEY, 'true');
  }, [shown, stories, loaded, onboarding, focused, isOpen]);
  return { story: playing, done: useCallback(() => setPlaying(null), []) };
}

const FW = 132, FH = 96, GAP = 6, PAD = 7, FOOT = 26;
const SLOT = 186;
const STEP = 520, PAUSE = 260;
// eases as plain worklets
const seg = (t: number, start: number, dur: number) => { 'worklet'; return Math.min(1, Math.max(0, (t - start) / dur)); };
const backOut = (x: number) => { 'worklet'; const u = x - 1; return 1 + 2.6 * u * u * u + 1.6 * u * u; };
const inOut = (x: number) => { 'worklet'; return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; };

/** One booth frame: the photo, under cream that clears as it develops (once it is out of the slot). */
function Frame({ k, uri, at }: { k: ReturnType<typeof useSharedValue<number>>; uri: string; at: number }) {
  const veil = useAnimatedStyle(() => ({ opacity: 0.9 * (1 - seg(k.value, at, 1400)) }));
  return (
    <View style={{ width: FW, height: FH, overflow: 'hidden', borderRadius: 1 }}>
      <Image source={{ uri }} contentFit="cover" style={{ flex: 1 }} />
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: fixed.printBorder }, veil]} />
    </View>
  );
}

/**
 * Home's first dump arriving (design/onboarding-motion.html, round 2): a slot opens under the header and prints the dump as a photo-booth
 * strip, a frame at a time, each developing as it comes out; the strip drops and tilts, the title fades in, then it all fades to Home.
 * A tap skips it.
 */
export function FirstDumpStrip({ story, onDone }: { story: Story; onDone: () => void }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const uris = story.picks.slice(0, 4).map((p) => p.uri);
  const n = uris.length;
  const S = PAD + n * FH + (n - 1) * GAP + FOOT; // strip height
  const stepEnd = (i: number) => 400 + i * (STEP + PAUSE) + STEP; // frame i is out
  const OUT = stepEnd(n - 1), DROP = OUT + 380, TITLE = DROP + 700, LEAVE = TITLE + 2000, END = LEAVE + 400;
  const k = useSharedValue(0);
  // the end is a JS timer, not the animation's callback: it also runs under fake timers in tests
  useEffect(() => {
    k.value = withTiming(END, { duration: END, easing: Easing.linear });
    const id = setTimeout(onDone, END);
    return () => clearTimeout(id);
  }, [k, END, onDone]);
  // a tap fast-forwards to the end (through the fade)
  const skip = () => { k.set(withTiming(END, { duration: 350 })); setTimeout(onDone, 350); };

  const all = useAnimatedStyle(() => ({ opacity: 1 - seg(k.value, LEAVE, 400) }));
  const slot = useAnimatedStyle(() => ({ opacity: 1 - seg(k.value, OUT + 300, 400), transform: [{ scaleX: backOut(seg(k.value, 0, 380)) }] }));
  const strip = useAnimatedStyle(() => {
    const t = k.value;
    let y = -S;
    // bottom first, like a booth: the foot and the last frame, then a frame a step, then the top edge, to 8 below the slot
    for (let i = 0; i < n; i++) y += (i ? FH + GAP : FOOT + FH) * inOut(seg(t, 400 + i * (STEP + PAUSE), STEP));
    const out = inOut(seg(t, OUT, 380)), drop = backOut(seg(t, DROP, 700));
    y += (PAD + 8) * out;
    return { transform: [{ translateY: y + 22 * drop }, { translateX: 4 * drop }, { rotate: `${4 * drop}deg` }] };
  });
  const title = useAnimatedStyle(() => ({ opacity: seg(k.value, TITLE - 300, 400) }));

  return (
    <Animated.View style={[{ position: 'absolute', top: insets.top + 56, left: 0, right: 0, bottom: 0, backgroundColor: t.bgScreen, experimental_backgroundImage: t.bgGrad ?? undefined }, all]}>
      <Pressable onPress={skip} accessibilityLabel={tr('discover.firstDumpLabel', { title: story.title })} accessibilityRole="button" style={{ flex: 1, alignItems: 'center' }}>
        <Animated.View style={[{ width: SLOT, height: 12, borderRadius: 6, marginTop: 8, backgroundColor: t.dark ? '#0C0906' : '#181411', zIndex: 2 }, slot]} />
        <View style={{ width: FW + 2 * PAD + 20, height: S + 40, marginTop: -6, overflow: 'hidden', alignItems: 'center' }}>
          <Animated.View style={[{ width: FW + 2 * PAD, padding: PAD, paddingBottom: FOOT, gap: GAP, backgroundColor: fixed.printBorder, boxShadow: t.shadowPrint }, strip]}>
            {uris.map((u, i) => <Frame key={u} k={k} uri={u} at={stepEnd(n - 1 - i)} />)}
          </Animated.View>
        </View>
        <Animated.View style={[{ alignItems: 'center', paddingHorizontal: 32, marginTop: 4 }, title]}>
          <Text style={[display(21, 1.15), { color: t.ink, textAlign: 'center' }]} numberOfLines={2}>{story.title}</Text>
          <Text style={[ui(11, 500), { color: t.inkMuted, marginTop: 3 }]}>{story.subtitle}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
