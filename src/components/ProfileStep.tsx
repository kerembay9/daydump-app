import React, { ReactNode, RefObject, useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, FadeOutLeft, FadeOutUp, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import Lock from 'lucide-react-native/icons/lock';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeProvider';
import { caps, display, label, ui } from '../theme/type';
import { FrameCard } from './ui/FrameCard';
import { Tap } from './ui/Tap';
import { Icons } from './ui/Icons';
import { Pill } from './ui/Pill';
import { useSelfiePick } from './SelfieFinder';
import { FaceCircle, faceFile, FaceThumb } from './FaceCircle';
import { Bar } from './ModelLoading';
import type { Selfie } from '../services/selfie';
import { getProfile, setProfile } from '../services/profile';

type Rect = { x: number; y: number; w: number; h: number };
type Fly = { from: Rect; to: Rect; origin: Rect; node: ReactNode; scale: number; key: number };
const FLY_MS = 520;
const BIG = 148, THUMB = 54;
/** a pop with one small overshoot (the default spring wobbles for ~2 s) */
const pop = () => ZoomIn.springify().damping(20).stiffness(260); // a new one each time: .delay() changes the builder
const at = (r: RefObject<View | null>) => new Promise<Rect | null>((res) => (r.current ? r.current.measureInWindow((x, y, w, h) => res({ x, y, w, h })) : res(null)));

/**
 * After the photo grant: the post header a dump preview shows (preview/[id] → PostMocks), filled in step by step. The name
 * is asked first and flies into the header; meanwhile the selfie scan (useSelfiePick, from the grant) runs. Then the pick:
 * "That's me" flies the face into the header's avatar, and a strip of the same person's other selfies lets them swap it
 * (right person, wrong photo); "Not me" moves to the next person. Continue saves the avatar; Skip leaves the initial letter.
 */
export function ProfileStep({ pick, onDone }: { pick: ReturnType<typeof useSelfiePick>; onDone: () => void }) {
  const { t } = useTheme();
  const [name, setName] = useState('');
  const [phase, setPhase] = useState<'name' | 'selfie' | 'picked'>('name');
  const [named, setNamed] = useState(false); // the name has landed in the header
  const [picked, setPicked] = useState<Selfie | null>(null);
  // what the header shows (lands after the flight), drawn as it flew (same size, scaled down): that image is in memory already
  const [avatar, setAvatar] = useState<{ s: Selfie; size: number; thumb: boolean } | null>(null);
  const [fly, setFly] = useState<Fly | null>(null);
  const { best, wait, vote, mine } = pick; // scanning since the grant (OnboardingModal)
  const root = useRef<View>(null), input = useRef<View>(null), headName = useRef<View>(null), headFace = useRef<View>(null), big = useRef<View>(null);
  const thumbs = useRef(new Map<string, View | null>());
  const bump = useSharedValue(0);
  const card = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.04 * bump.value }, { rotate: `${-1 + 1.5 * bump.value}deg` }] }));
  useEffect(() => { getProfile().then((p) => setName(p.name)); }, []);

  /** Draws node over `from`, flies it into `to` (scaled by `scale`, else to its height), then land() and the header card bumps. */
  const launch = async (from: RefObject<View | null>, to: RefObject<View | null>, node: (r: Rect) => ReactNode, land: () => void, scale?: number) => {
    const [a, b, o] = await Promise.all([at(from), at(to), at(root)]);
    if (!a || !b || !o) return land();
    setFly({ from: a, to: b, origin: o, node: node(a), scale: scale ?? b.h / a.h, key: (fly?.key ?? 0) + 1 });
    setTimeout(() => {
      land(); setFly(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      bump.value = withSequence(withTiming(1, { duration: 110 }), withSpring(0, { damping: 6, stiffness: 180 }));
    }, FLY_MS);
  };

  const submitName = () => {
    const n = name.trim();
    setProfile({ name: n }).catch((e) => console.warn('[onboarding] name save failed:', e));
    if (n) launch(input, headName, () => <Text style={[display(18), { color: t.ink }]}>{n}</Text>, () => setNamed(true), 14 / 18);
    Keyboard.dismiss();
    setPhase('selfie');
  };
  /** s is the avatar now: flies in from `from`, its circle of this size (the big one, or a strip thumb: its small crop; drawn the same way, so from memory). */
  const take = (s: Selfie, from: RefObject<View | null>, size: number, thumb = false) => {
    setPicked(s);
    faceFile(s.p.uri, s.box, AVATAR_PX); // cropped now, so the avatar is ready when Continue ends onboarding
    launch(from, headFace, () => face(s, size, thumb), () => setAvatar({ s, size, thumb }), 40 / size);
  };
  const yes = () => { if (!best) return; vote('up'); take(best, big, BIG); setPhase('picked'); };
  const no = () => { Haptics.selectionAsync(); setPicked(null); setAvatar(null); vote('down'); setPhase('selfie'); };
  const canGo = phase === 'picked' || (phase === 'selfie' && !best && !wait);
  const done = async (use: boolean) => {
    Keyboard.dismiss();
    // saved before onboarding closes, so Home's avatar is there from the start
    if (use && picked) await saveAvatar(picked).catch((e) => console.warn('[onboarding] avatar save failed:', e));
    onDone();
  };
  const shown = named ? name.trim() : '';
  const strip = picked ? mine(picked).slice(0, 8) : [];

  return (
    <View ref={root} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 16 }}>
        <Animated.Text entering={FadeInDown.duration(450)} style={[label(10, 0.14), { color: t.inkMuted, textAlign: 'center', marginBottom: 10 }]}>{caps('Your dump previews')}</Animated.Text>
        <Animated.Text entering={FadeInDown.delay(60).duration(450)} style={[display(26, 1.12), { color: t.ink, textAlign: 'center', marginBottom: 10 }]}>Put yourself in your posts</Animated.Text>
        <Animated.View entering={FadeInDown.delay(120).duration(450)} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 10, marginBottom: 18, paddingHorizontal: 8 }}>
          <Lock size={14} color={t.inkMuted} strokeWidth={2} />
          <Text style={[ui(12.5), { color: t.inkMuted, lineHeight: 18, flexShrink: 1 }]}>Your name and photo only show on your dump previews. They stay on your phone.</Text>
        </Animated.View>

        {/* a post header like the previews' (PostMocks): the name and face fly into it */}
        <Animated.View entering={FadeInDown.delay(200).springify().damping(15)} style={[{ marginBottom: 18 }, card]}>
          <FrameCard radius={18} padding={12}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <View ref={headFace} collapsable={false} style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: t.accentFab, alignItems: 'center', justifyContent: 'center' }}>
                {avatar ? <Animated.View key={avatar.s.p.id} entering={FadeIn.duration(120)} style={{ transform: [{ scale: 40 / avatar.size }] }}>{face(avatar.s, avatar.size, avatar.thumb)}</Animated.View>
                  : shown ? <Text style={[ui(16, 600), { color: t.accentFabText }]}>{shown[0].toUpperCase()}</Text> : <Icons.user size={20} color={t.accentFabText} />}
              </View>
              <View style={{ flex: 1 }}>
                <View ref={headName} collapsable={false} style={{ alignSelf: 'flex-start' }}>
                  <Text style={[ui(14, 600), { color: shown ? t.ink : t.inkMuted }]} numberOfLines={1}>{shown || 'Your name'}</Text>
                </View>
                <Text style={[ui(11), { color: t.inkMuted }]}>Today · photo dump</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[0, 1, 2].map((i) => <View key={i} style={{ flex: 1, height: 56, borderRadius: 8, backgroundColor: t.borderStrong, opacity: 0.5 }} />)}
            </View>
          </FrameCard>
        </Animated.View>

        {phase === 'name' ? (
          <Animated.View key="name" entering={FadeInDown.delay(320).duration(450)} exiting={FadeOutUp.duration(200)}>
            <Text style={[label(10, 0.12), { color: t.inkMuted, marginBottom: 6, paddingHorizontal: 4 }]}>{caps('What should we call you?')}</Text>
            <FrameCard radius={18} style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
              <View ref={input} collapsable={false}>
                <TextInput value={name} onChangeText={setName} onSubmitEditing={submitName} placeholder="Your name" placeholderTextColor={t.inkMuted} autoFocus
                  returnKeyType="next" submitBehavior="submit" style={[display(18), { color: t.ink, paddingVertical: 8, paddingHorizontal: 0 }]} />
              </View>
            </FrameCard>
          </Animated.View>
        ) : phase === 'selfie' ? (
          <Animated.View key="selfie" entering={FadeInDown.duration(400)} exiting={FadeOut.duration(150)}>
            <FrameCard radius={20} padding={16} style={{ alignItems: 'center' }}>
              {best ? (
                <>
                  <Animated.View key={best.p.id} ref={big} collapsable={false} entering={pop()} exiting={FadeOutLeft.duration(180)}>
                    <FaceCircle uri={best.p.uri} box={best.box} aspect={best.aspect} size={BIG} />
                  </Animated.View>
                  <Text style={[display(20, 1.2), { color: t.ink, marginTop: 14 }]}>Is this you?</Text>
                  <Text style={[ui(12.5), { color: t.inkMuted, marginTop: 2 }]}>Found on your phone.</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, alignSelf: 'stretch' }}>
                    <Pill label="Not me" onPress={no} height={40} size={13.5} style={{ flex: 1, justifyContent: 'center' }} />
                    <Pill label="That's me" on onPress={yes} height={40} size={13.5} style={{ flex: 1, justifyContent: 'center' }} />
                  </View>
                </>
              ) : (
                <View style={{ alignSelf: 'stretch', gap: 6, paddingVertical: 8 }}>
                  <Text style={[ui(14, 600), { color: t.ink, textAlign: 'center' }]}>{wait ? wait[0] : 'No selfie found'}</Text>
                  <Text style={[ui(12.5), { color: t.inkMuted, textAlign: 'center', lineHeight: 18 }]}>
                    {wait ? 'Looking through your photos for one.' : 'Your previews show your initial. Add a photo later in Profile.'}
                  </Text>
                  {wait && <Bar progress={wait[2]} />}
                </View>
              )}
            </FrameCard>
          </Animated.View>
        ) : (
          <Animated.View key="picked" entering={FadeInDown.delay(FLY_MS - 120).duration(400)}>
            <Text style={[label(10, 0.12), { color: t.inkMuted, marginBottom: 8, paddingHorizontal: 4 }]}>{caps('Not this one? Pick another')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 4, paddingVertical: 4 }}>
              {strip.map((s, i) => {
                const on = s.p.id === picked?.p.id;
                return (
                  <Animated.View key={s.p.id} entering={pop().delay(FLY_MS + 50 * i)}>
                    <Tap onPress={() => { if (!on) { Haptics.selectionAsync(); take(s, { current: thumbs.current.get(s.p.id) ?? null }, THUMB, true); } }} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}`}
                      style={{ borderRadius: 32, padding: 3, borderWidth: 2, borderColor: on ? t.ink : 'transparent' }}>
                      <View ref={(v) => { thumbs.current.set(s.p.id, v); }} collapsable={false}>
                        <FaceThumb uri={s.p.uri} box={s.box} size={THUMB} />
                      </View>
                    </Tap>
                  </Animated.View>
                );
              })}
            </ScrollView>
            <Tap onPress={no} accessibilityRole="button" style={{ alignSelf: 'center', height: 36, marginTop: 8, paddingHorizontal: 16, justifyContent: 'center' }}>
              <Text style={[ui(13, 600), { color: t.inkMuted }]}>That&apos;s not me</Text>
            </Tap>
          </Animated.View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 24, alignItems: 'center' }}>
        <Tap onPress={() => (phase === 'name' ? submitName() : canGo && void done(true))} accessibilityRole="button" accessibilityState={{ disabled: phase !== 'name' && !canGo }}
          style={{ alignSelf: 'stretch', height: 52, borderRadius: 16, backgroundColor: t.ink, opacity: phase === 'name' || canGo ? 1 : 0.35, alignItems: 'center', justifyContent: 'center', boxShadow: t.shadowCard }}>
          <Text style={[ui(15, 600), { color: t.bgScreen }]}>{phase === 'name' ? 'Next' : 'Continue'}</Text>
        </Tap>
        {canGo ? <View style={{ height: 42 }} /> : (
          <Tap onPress={() => void done(false)} accessibilityRole="button" style={{ height: 36, marginTop: 6, paddingHorizontal: 16, justifyContent: 'center' }}>
            <Text style={[ui(13, 600), { color: t.inkMuted }]}>Skip for now</Text>
          </Tap>
        )}
      </View>

      {fly && <Flyer key={fly.key} f={fly} />}
    </View>
  );
}

/** f.node drawn at f.from, flown in an arc into f.to (scaled by f.scale, left edges and centers lined up). */
function Flyer({ f }: { f: Fly }) {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withTiming(1, { duration: FLY_MS, easing: Easing.inOut(Easing.cubic) }); }, [p]);
  const s = f.scale, dx = f.to.x - f.from.x, dy = f.to.y + f.to.h / 2 - (f.from.y + f.from.h / 2);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: p.value * dx }, { translateY: p.value * dy - 120 * p.value * (1 - p.value) }, { scale: 1 + p.value * (s - 1) }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: f.from.x - f.origin.x, top: f.from.y - f.origin.y, height: f.from.h, justifyContent: 'center', transformOrigin: 'left center', zIndex: 10 }, style]}>
      {f.node}
    </Animated.View>
  );
}

/** The big circle zooms into the whole photo; a strip thumb is a small crop (FaceCircle's full photo, 8 at once, made the strip crawl). */
const face = (s: Selfie, size: number, thumb: boolean) =>
  thumb ? <FaceThumb uri={s.p.uri} box={s.box} size={size} /> : <FaceCircle uri={s.p.uri} box={s.box} aspect={s.aspect} size={size} />;

const AVATAR_PX = 512;
/** The face's square as the profile avatar: our own copy (the cache's can be cleared, the photo deleted). */
async function saveAvatar(s: Selfie) {
  const src = await faceFile(s.p.uri, s.box, AVATAR_PX);
  if (!src) return;
  const dest = new File(Paths.document, `avatar-${Date.now()}.jpg`);
  await new File(src).copy(dest);
  await setProfile({ avatar: dest.uri });
  console.log('[onboarding] avatar saved', dest.uri);
}
