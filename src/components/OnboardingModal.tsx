import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, NativeScrollEvent, NativeSyntheticEvent, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Film, Image as ImageIcon, Layers, LucideIcon, ShieldCheck, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library/legacy';
import { OnboardingService } from '../services/onboardingService';
import { useTheme } from '../theme/ThemeProvider';
import { display, label, ui } from '../theme/type';
import { FrameCard } from './ui/FrameCard';
import { Tape } from './ui/Tape';
import { Tap } from './ui/Tap';
import { IconButton } from './ui/TopHeader';
import { Icons } from './ui/Icons';
import { ProfileStep } from './ProfileStep';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { useModels } from '../state/models';

type Slide = { id: string; badge: string; title: string; description: string; icon: LucideIcon; points?: { icon: LucideIcon; text: string }[] };

const SLIDES: Slide[] = [
  {
    id: 'hook',
    badge: 'Effortless photo dumps',
    title: 'Turn camera roll chaos into dumps',
    description: 'Say goodbye to scrolling through 200 shots. DayDump picks the best photos of your days and trips, paced with flow and ready-made captions.',
    icon: Sparkles,
    points: [
      { icon: Film, text: 'Film looks, borders and IG / TikTok sizes' },
      { icon: Layers, text: 'Collage layouts, one swipe at a time' },
    ],
  },
  {
    id: 'privacy',
    badge: 'On-device curation',
    title: 'Picked on your phone, not in the cloud',
    description: 'Stories, search and photo picks run on a small vision model on your phone. DayDump does not upload your photos to curate them.',
    icon: ShieldCheck,
    points: [
      { icon: Check, text: 'Stories and search run on-device' },
      { icon: Check, text: 'Your photos stay on your phone' },
      { icon: ImageIcon, text: 'Photo access lets it find your standout moments' },
    ],
  },
];

/**
 * First-run slides in the app's theme. The last one (privacy) asks for photo access; with it, indexing starts (onStart) and the
 * profile step shows (ProfileStep). There is no paywall step. onFinish(started): whether onStart already ran.
 */
export function OnboardingModal({ visible, onStart, onFinish }: { visible: boolean; onStart: () => Promise<void>; onFinish: (started: boolean) => void }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [profile, setProfileStep] = useState(false); // after the photo grant
  const scroll = useRef<ScrollView>(null);
  const last = page === SLIDES.length - 1;
  // the selfie finder's models load while the slides are read
  const models = useModels();
  const vision = models?.vision.state === 'ready', faces = models?.faces.state === 'ready'; // again once faces lands: SFace
  useEffect(() => {
    if (visible && vision) ClipEmbedder?.warmSelfie?.().catch((e) => console.warn('[onboarding] warm failed:', e));
  }, [visible, vision, faces]);

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

  const finish = async (ask: boolean) => {
    let granted = false;
    try {
      // Photo only, so Android 13+ doesn't reject the request over the undeclared audio permission.
      if (ask) granted = (await MediaLibrary.requestPermissionsAsync(false, ['photo'])).granted;
    } catch (e) {
      console.warn('[onboarding] permission request failed:', e);
    } finally {
      await OnboardingService.setOnboardingCompleted();
      if (!granted) onFinish(false);
    }
    if (granted) {
      onStart();
      setProfileStep(true);
    }
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
      <View style={{ flex: 1, backgroundColor: t.bgScreen, experimental_backgroundImage: t.bgGrad ?? undefined, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 16 }}>
        <View style={{ paddingHorizontal: 24, height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[display(20), { color: t.ink }]}>DayDump</Text>
        </View>

        {profile ? <ProfileStep onDone={() => onFinish(true)} /> : <>
        <ScrollView ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} style={{ flex: 1 }}>
          {SLIDES.map((s, i) => (
            <SlideBody key={s.id} s={s} i={i} width={width} />
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: 24, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
            {SLIDES.map((s, i) => (
              <View key={s.id} style={{ height: 6, borderRadius: 3, width: i === page ? 22 : 6, backgroundColor: i === page ? t.ink : t.borderStrong }} />
            ))}
          </View>
          <Tap onPress={last ? () => finish(true) : next} accessibilityRole="button"
            style={{ alignSelf: 'stretch', height: 52, borderRadius: 16, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: t.shadowCard }}>
            <Text style={[ui(15, 600), { color: t.bgScreen }]}>{last ? 'Allow photos & continue' : 'Continue'}</Text>
          </Tap>
          <Text style={[ui(11), { color: t.inkMuted, marginTop: 12, textAlign: 'center' }]}>
            You can change photo access anytime in Android settings.
          </Text>
        </View>
        </>}
      </View>
    </View>
  );
}

function SlideBody({ s, i, width }: { s: Slide; i: number; width: number }) {
  const { t } = useTheme();
  return (
    <View style={{ width, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ marginBottom: 26 }}>
        <FrameCard radius={22} rotate={i % 2 ? 2 : -2} style={{ width: 92, height: 92, alignItems: 'center', justifyContent: 'center' }}>
          <s.icon size={40} color={t.ink} strokeWidth={1.6} />
        </FrameCard>
        <Tape rotate={-6} style={{ top: -8 }} />
      </View>
      <Text style={[label(10, 0.14), { color: t.inkMuted, marginBottom: 12 }]}>{s.badge}</Text>
      <Text style={[display(28, 1.12), { color: t.ink, textAlign: 'center', marginBottom: 12 }]}>{s.title}</Text>
      <Text style={[ui(14), { color: t.inkMuted, textAlign: 'center', lineHeight: 21, marginBottom: 22 }]}>{s.description}</Text>
      {s.points && (
        <FrameCard radius={16} padding={14} style={{ alignSelf: 'stretch', gap: 10 }}>
          {s.points.map((pt) => (
            <View key={pt.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <pt.icon size={15} color={t.ink} strokeWidth={1.75} />
              <Text style={[ui(12.5, 500), { color: t.ink, flexShrink: 1 }]}>{pt.text}</Text>
            </View>
          ))}
        </FrameCard>
      )}
    </View>
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
          <IconButton label="Close" onPress={onClose}><Icons.close size={16} /></IconButton>
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <SlideBody s={SLIDES.find((x) => x.id === 'privacy')!} i={1} width={width} />
        </View>
      </View>
    </Modal>
  );
}
