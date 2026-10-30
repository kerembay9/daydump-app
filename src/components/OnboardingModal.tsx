import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, NativeScrollEvent, NativeSyntheticEvent, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import Bell from 'lucide-react-native/icons/bell';
import Film from 'lucide-react-native/icons/film';
import ImageIcon from 'lucide-react-native/icons/image';
import Layers from 'lucide-react-native/icons/layers';
import { Image } from 'expo-image';
import Animated, { Easing, FadeInDown, interpolate, SharedValue, SlideInRight, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useTheme } from '../theme/ThemeProvider';
import { caps, display, label, ui } from '../theme/type';
import { FrameCard } from './ui/FrameCard';
import { Tap } from './ui/Tap';
import { IconButton } from './ui/TopHeader';
import { Icons } from './ui/Icons';
import { HookStage, PrivacyStage } from './OnboardingMotion';
import { ProfileStep, useLatestShots } from './ProfileStep';
import { useSelfiePick } from './SelfieFinder';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { useModels } from '../state/models';
import { NotificationService } from '../services/notificationService';
import { tr } from '../i18n';

type Slide = { id: 'hook' | 'privacy'; badge: string; title: string; description: string; points?: { icon: LucideIcon; text: string }[] };

const SLIDES: Slide[] = [
  {
    id: 'hook',
    badge: 'onboarding.hook.badge',
    title: 'onboarding.hook.title',
    description: 'onboarding.hook.description',
    points: [
      { icon: Film, text: 'onboarding.hook.point1' },
      { icon: Layers, text: 'onboarding.hook.point2' },
    ],
  },
  {
    id: 'privacy',
    badge: 'onboarding.privacy.badge',
    title: 'onboarding.privacy.title',
    description: 'onboarding.privacy.description',
    points: [
      { icon: ImageIcon, text: 'onboarding.privacy.point1' },
    ],
  },
];

/**
 * First-run slides in the app's theme. The last one (privacy) asks for photo access; with it, indexing starts (onStart) and the
 * recap notification's ask shows (NotifyStep), then the profile step (ProfileStep): pages 3 and 4 of the same dots, slid in (they
 * read the photos, so the pager can't reach them before the grant). There is no paywall step. onFinish(started): whether onStart already ran.
 * from 'notify': the new onboarding screens (app/onboarding) came first and asked for photos; this carries on from the recap ask until their later phases land.
 */
export function OnboardingModal({ visible, onStart, onFinish, from = 'slides' }: { visible: boolean; onStart: () => Promise<void>; onFinish: (started: boolean) => void; from?: 'slides' | 'notify' }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [step, setStep] = useState<'slides' | 'notify' | 'profile'>(from); // notify + profile: after the photo grant (from: the route-group screens already asked)
  const scroll = useRef<ScrollView>(null);
  const last = page === SLIDES.length - 1;
  // the selfie finder's models load while the slides are read
  const models = useModels('faces');
  const vision = models?.vision.state === 'ready', faces = models?.faces.state === 'ready'; // again once faces lands: SFace
  useEffect(() => {
    if (visible && vision) ClipEmbedder?.warmSelfie?.().catch((e) => console.warn('[onboarding] warm failed:', e));
  }, [visible, vision, faces]);
  // the selfie scan starts at the photo grant (it reads the photos), so the pick is ready by the profile step
  const pick = useSelfiePick(step !== 'slides');

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page && p >= 0 && p < SLIDES.length) {
      setPage(p);
      Haptics.selectionAsync();
    }
  };

  const next = () => {
    scroll.current?.scrollTo({ x: (page + 1) * width, animated: true });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const asked = useRef(false); // a double tap asks once
  const finish = async () => {
    if (asked.current) return;
    asked.current = true;
    let granted = false;
    try {
      // Photo only, so Android 13+ doesn't reject the request over the undeclared audio permission.
      granted = (await MediaLibrary.requestPermissionsAsync(false, ['photo'])).granted;
    } catch (e) {
      console.warn('[onboarding] permission request failed:', e);
    }
    if (!granted) return onFinish(false);
    onStart();
    setStep('notify');
  };

  // back does nothing while it's up
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [visible]);

  if (!visible) return null;
  // An overlay, not a Modal: a Modal's own window gets Android's white scrim behind the nav buttons
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <View style={{ flex: 1, backgroundColor: t.bgScreen, experimental_backgroundImage: t.bgGrad ?? undefined, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 8 }}>
        <View style={{ paddingHorizontal: 24, height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[display(20), { color: t.ink }]}>PicDump</Text>
        </View>

        {step === 'notify' ? <NotifyStep dots={<Dots at={2} />} onDone={() => setStep('profile')} />
          : step === 'profile' ? <ProfileStep dots={<Dots at={3} />} pick={pick} onDone={() => onFinish(true)} /> : <>
        <ScrollView ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} style={{ flex: 1 }}>
          {SLIDES.map((s, i) => (
            <SlideBody key={s.id} s={s} active={i === page} width={width} />
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: 24, alignItems: 'center' }}>
          <Dots at={page} />
          <Tap onPress={last ? finish : next} accessibilityRole="button"
            style={{ alignSelf: 'stretch', height: 52, borderRadius: 16, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: t.shadowCard }}>
            <Text style={[ui(15, 600), { color: t.bgScreen }]}>{last ? tr('onboarding.allowContinue') : tr('onboarding.continue')}</Text>
          </Tap>
        </View>
        </>}
      </View>
    </View>
  );
}

const PAGES = 4; // the two slides, then NotifyStep and ProfileStep

/** The page dots, one row for all four pages; sits above the main button on each. */
function Dots({ at }: { at: number }) {
  const { t } = useTheme();
  return (
    <View accessible accessibilityLabel={tr('onboarding.page', { n: at + 1, total: PAGES })} style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
      {Array.from({ length: PAGES }, (_, i) => (
        <View key={i} style={{ height: 6, borderRadius: 3, width: i === at ? 22 : 6, backgroundColor: i === at ? t.ink : t.borderStrong }} />
      ))}
    </View>
  );
}

const LOOP_MS = 5200;
// eases as plain worklets (Reanimated's Easing builders aren't callable inside one)
const backOut = (x: number) => { 'worklet'; const u = x - 1; return 1 + 2.6 * u * u * u + 1.6 * u * u; };
const cubicOut = (x: number) => { 'worklet'; return 1 - (1 - x) ** 3; };

/**
 * The recaps (8 PM with today's dump, Sunday noon with the week's), shown before their permission ask: a lock screen where the
 * notification drops in (bell rings), its picture unfolds into a collage of the user's own latest camera shots (today's when there
 * are enough), then it lifts away, on a loop. Turn on asks for notifications (the only place that asks: NotificationService.init
 * doesn't); Not now stores them off. Page 3: slides in, the dots and buttons stay put.
 */
function NotifyStep({ dots, onDone }: { dots: React.ReactNode; onDone: () => void }) {
  const { t } = useTheme();
  const shots = useLatestShots();
  const [busy, setBusy] = useState(false);
  // one clock for the whole loop, so drop, ring and unfold stay in step
  const k = useSharedValue(0);
  useEffect(() => { k.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1); }, [k]);
  const card = useAnimatedStyle(() => {
    const drop = backOut(interpolate(k.value, [0.06, 0.2], [0, 1], 'clamp'));
    const lift = interpolate(k.value, [0.86, 0.95], [0, 1], 'clamp') ** 3;
    return {
      opacity: Math.min(1, drop * 2.5) * (1 - lift),
      transform: [{ translateY: -150 * (1 - drop) - 60 * lift }, { scale: 0.9 + 0.1 * drop - 0.05 * lift }],
    };
  });
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(k.value, [0.17, 0.2, 0.23, 0.26, 0.29, 0.32], [0, 18, -15, 10, -5, 0], 'clamp')}deg` }] }));
  const pic = useAnimatedStyle(() => {
    const open = cubicOut(interpolate(k.value, [0.3, 0.44], [0, 1], 'clamp'));
    return { height: 132 * open, opacity: open, marginTop: 10 * open, transform: [{ scale: 1.15 - 0.15 * open }] };
  });
  // the lock screen's clock steps back while the notification is up
  const clock = useAnimatedStyle(() => ({ opacity: interpolate(k.value, [0.06, 0.2, 0.86, 0.95], [1, 0.55, 0.55, 1], 'clamp') }));

  const choose = async (on: boolean) => {
    if (busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { await NotificationService.setEnabled(on); } catch (e) { console.warn('[onboarding] notification setting failed:', e); }
    onDone();
  };

  return (
    <>
      {/* scrolls only when it doesn't fit (small phone, big font) */}
      <Animated.View entering={SlideInRight.duration(320)} style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 12 }}>
        <Animated.Text entering={FadeInDown.duration(500)} style={[label(10, 0.14), { color: t.inkMuted, textAlign: 'center', marginBottom: 10 }]}>{caps('Recap')}</Animated.Text>
        <Animated.Text entering={FadeInDown.delay(80).duration(500)} style={[display(26, 1.12), { color: t.ink, textAlign: 'center', marginBottom: 18 }]}>{tr('onboarding.notifyHeading')}</Animated.Text>

        {/* the lock screen the recap lands on */}
        <Animated.View entering={FadeInDown.delay(160).springify().damping(16)}>
          <FrameCard radius={28} rotate={-1} style={{ height: 350, overflow: 'hidden', paddingHorizontal: 12, paddingTop: 18 }}>
            <Animated.View style={[{ alignItems: 'center', marginBottom: 14 }, clock]}>
              <Text style={[display(44, 1), { color: t.ink }]}>8:00</Text>
              <Text style={[ui(12, 500), { color: t.inkMuted, marginTop: 4 }]}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
            </Animated.View>
            <Animated.View accessibilityLabel={tr('onboarding.notifPreview')}
              style={[{ backgroundColor: t.bgScreen, borderRadius: 18, borderWidth: 1, borderColor: t.borderSubtle, padding: 12, boxShadow: t.shadowCard }, card]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Animated.View style={ring}>
                  <Image source={require('../../assets/icon.png')} style={{ width: 22, height: 22, borderRadius: 6 }} />
                </Animated.View>
                <Text style={[ui(11.5, 600), { color: t.ink }]}>PicDump</Text>
                <Text style={[ui(11), { color: t.inkMuted }]}>{tr('onboarding.notifNow')}</Text>
                <Bell size={13} color={t.inkMuted} strokeWidth={2} style={{ marginLeft: 'auto' }} />
              </View>
              <Text style={[ui(14, 600), { color: t.ink, marginTop: 8 }]}>{tr('onboarding.notifTitle')}</Text>
              <Text style={[ui(12.5), { color: t.inkMuted, marginTop: 2, lineHeight: 17 }]}>{tr('onboarding.notifBody')}</Text>
              <Animated.View style={[{ borderRadius: 12, overflow: 'hidden', backgroundColor: t.borderStrong, flexDirection: 'row', gap: 3 }, pic]}>
                {shots.length ? <>
                  <Shot k={k} i={0} uri={shots[0]} flex={1.6} />
                  {shots.length > 1 && <View style={{ flex: 1, gap: 3 }}>{shots.slice(1).map((u, i) => <Shot key={u} k={k} i={i + 1} uri={u} flex={1} />)}</View>}
                </> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ImageIcon size={28} color={t.inkMuted} strokeWidth={1.5} /></View>}
              </Animated.View>
            </Animated.View>
          </FrameCard>
        </Animated.View>

        <Animated.Text entering={FadeInDown.delay(260).duration(500)} style={[ui(14), { color: t.inkMuted, textAlign: 'center', lineHeight: 21, marginTop: 22 }]}>
          {tr('onboarding.notifyBody')}
        </Animated.Text>
      </ScrollView>
      </Animated.View>

      <View style={{ paddingHorizontal: 24, alignItems: 'center' }}>
        {dots}
        <Tap onPress={() => choose(true)} accessibilityRole="button"
          style={{ alignSelf: 'stretch', height: 52, borderRadius: 16, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: t.shadowCard }}>
          <Bell size={16} color={t.bgScreen} strokeWidth={2} />
          <Text style={[ui(15, 600), { color: t.bgScreen }]}>{tr('onboarding.turnOn')}</Text>
        </Tap>
        <Tap onPress={() => choose(false)} accessibilityRole="button" style={{ height: 36, marginTop: 6, paddingHorizontal: 16, justifyContent: 'center' }}>
          <Text style={[ui(13, 600), { color: t.inkMuted }]}>{tr('onboarding.notNow')}</Text>
        </Tap>
      </View>
    </>
  );
}

/** One collage photo: pops in just after the picture unfolds (staggered by i), then drifts in slowly until the lift. */
function Shot({ k, i, uri, flex }: { k: SharedValue<number>; i: number; uri: string; flex: number }) {
  const st = useAnimatedStyle(() => {
    const pop = backOut(interpolate(k.value, [0.33 + i * 0.04, 0.45 + i * 0.04], [0, 1], 'clamp'));
    const drift = interpolate(k.value, [0.45, 0.9], [0, 1], 'clamp');
    return { opacity: Math.min(1, pop * 2), transform: [{ scale: (0.7 + 0.3 * pop) * (1 + 0.08 * drift) }, { rotate: `${(1 - pop) * (i % 2 ? 6 : -6)}deg` }] };
  });
  return (
    <Animated.View style={[{ flex, overflow: 'hidden', borderRadius: 4 }, st]}>
      <Image source={{ uri }} contentFit="cover" style={{ flex: 1 }} />
    </Animated.View>
  );
}

function SlideBody({ s, active, width }: { s: Slide; active: boolean; width: number }) {
  const { t } = useTheme();
  return (
    // scrolls only when it doesn't fit (small phone, big font)
    <ScrollView style={{ width }} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ marginBottom: 14 }}>
        {s.id === 'hook' ? <HookStage active={active} /> : <PrivacyStage active={active} />}
      </View>
      <Text style={[label(10, 0.14), { color: t.inkMuted, marginBottom: 12 }]}>{caps(tr(s.badge))}</Text>
      <Text style={[display(28, 1.12), { color: t.ink, textAlign: 'center', marginBottom: 12 }]}>{tr(s.title)}</Text>
      <Text style={[ui(14), { color: t.inkMuted, textAlign: 'center', lineHeight: 21, marginBottom: 22 }]}>{tr(s.description)}</Text>
      {s.points && (
        <FrameCard radius={16} padding={14} style={{ alignSelf: 'stretch', gap: 10 }}>
          {s.points.map((pt) => (
            <View key={pt.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <pt.icon size={15} color={t.ink} strokeWidth={1.75} />
              <Text style={[ui(12.5, 500), { color: t.ink, flexShrink: 1 }]}>{tr(pt.text)}</Text>
            </View>
          ))}
        </FrameCard>
      )}
    </ScrollView>
  );
}

/** Profile → Data privacy: the onboarding's on-device slide again. */
export function PrivacyModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: t.bgScreen, experimental_backgroundImage: t.bgGrad ?? undefined, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 16 }}>
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <IconButton label={tr('common.close')} onPress={onClose}><Icons.close size={16} /></IconButton>
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <SlideBody s={SLIDES.find((x) => x.id === 'privacy')!} active={visible} width={width} />
        </View>
      </View>
    </Modal>
  );
}
