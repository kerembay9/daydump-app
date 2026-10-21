import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Modal, NativeScrollEvent, NativeSyntheticEvent, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Film, Image as ImageIcon, Layers, Lock, LucideIcon, ShieldCheck, Sparkles } from 'lucide-react-native';
import { File, Paths } from 'expo-file-system';
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
import { useSelfiePick } from './SelfieFinder';
import { FaceCircle, faceFile } from './FaceCircle';
import { Bar } from './ModelLoading';
import { Pill } from './ui/Pill';
import type { Selfie } from '../services/selfie';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { useModels } from '../state/models';
import { getProfile, setProfile } from '../services/profile';

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

/**
 * After the photo grant: the name and selfie a dump preview's post header shows (preview/[id] → PostMocks), filled in live.
 * The selfie scan starts here, while the name is typed (the keyboard covers it). Continue needs a photo picked ("That's me",
 * saved as the profile avatar) or none found; Skip leaves the initial letter. The name saves as it's typed.
 */
function ProfileStep({ onDone }: { onDone: () => void }) {
  const { t } = useTheme();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Selfie | null>(null);
  const { best, wait, vote } = useSelfiePick();
  useEffect(() => { getProfile().then((p) => setName(p.name)); }, []);
  const editName = (n: string) => {
    setName(n);
    setProfile({ name: n.trim() }).catch((e) => console.warn('[onboarding] name save failed:', e));
  };
  const yes = () => {
    if (!best) return;
    vote('up'); setPicked(best); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    faceFile(best.p.uri, best.box, AVATAR_PX); // cropped now: after Continue the notification ask pauses the app
  };
  const no = () => { setPicked(null); vote('down'); };
  const canGo = !!picked || (!best && !wait);
  const done = (use: boolean) => {
    Keyboard.dismiss();
    if (use && picked) saveAvatar(picked).catch((e) => console.warn('[onboarding] avatar save failed:', e));
    onDone();
  };
  const initial = name.trim()[0]?.toUpperCase();

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 18, paddingBottom: 16 }}>
        <Text style={[label(10, 0.14), { color: t.inkMuted, textAlign: 'center', marginBottom: 10 }]}>Your dump previews</Text>
        <Text style={[display(26, 1.12), { color: t.ink, textAlign: 'center', marginBottom: 18 }]}>Put yourself in your posts</Text>

        {/* a post header like the previews' (PostMocks), filled in as they type and pick */}
        <FrameCard radius={18} padding={12} rotate={-1} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: t.accentFab, alignItems: 'center', justifyContent: 'center' }}>
              {picked ? <FaceCircle uri={picked.p.uri} box={picked.box} aspect={picked.aspect} size={40} />
                : initial ? <Text style={[ui(16, 600), { color: t.accentFabText }]}>{initial}</Text> : <Icons.user size={20} color={t.accentFabText} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ui(14, 600), { color: name.trim() ? t.ink : t.inkMuted }]} numberOfLines={1}>{name.trim() || 'Your name'}</Text>
              <Text style={[ui(11), { color: t.inkMuted }]}>Today · photo dump</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[0, 1, 2].map((i) => <View key={i} style={{ flex: 1, height: 56, borderRadius: 8, backgroundColor: t.borderStrong, opacity: 0.5 }} />)}
          </View>
        </FrameCard>

        <FrameCard radius={18} style={{ paddingHorizontal: 14, paddingVertical: 4, marginBottom: 12 }}>
          <TextInput value={name} onChangeText={editName} placeholder="Your name" placeholderTextColor={t.inkMuted} autoFocus
            returnKeyType="done" style={[display(18), { color: t.ink, paddingVertical: 8 }]} />
        </FrameCard>

        <FrameCard radius={18} padding={12}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {best ? <FaceCircle uri={best.p.uri} box={best.box} aspect={best.aspect} size={64} />
              : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.borderStrong, opacity: 0.5 }} />}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[ui(14, 600), { color: t.ink }]}>{wait ? wait[0] : best ? 'Is this you?' : 'No selfie found'}</Text>
              <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17 }]}>
                {wait ? 'Looking through your photos for one.' : best ? 'Found on your phone. It fills the circle above.' : 'Your previews show your initial. Add a photo later in Profile.'}
              </Text>
              {wait && <Bar progress={wait[2]} />}
            </View>
          </View>
          {best && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pill label="Not me" onPress={no} height={36} size={13} style={{ flex: 1, justifyContent: 'center' }} />
              <Pill label="That's me" on={picked?.p.id === best.p.id} onPress={yes} height={36} size={13} style={{ flex: 1, justifyContent: 'center' }} />
            </View>
          )}
        </FrameCard>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Lock size={12} color={t.inkMuted} strokeWidth={2} />
          <Text style={[ui(11.5), { color: t.inkMuted }]}>Only for your previews. Stays on your phone.</Text>
        </View>
        <Tap onPress={() => canGo && done(true)} accessibilityRole="button" accessibilityState={{ disabled: !canGo }}
          style={{ alignSelf: 'stretch', height: 52, borderRadius: 16, backgroundColor: t.ink, opacity: canGo ? 1 : 0.35, alignItems: 'center', justifyContent: 'center', boxShadow: t.shadowCard }}>
          <Text style={[ui(15, 600), { color: t.bgScreen }]}>Continue</Text>
        </Tap>
        {canGo ? <View style={{ height: 42 }} /> : (
          <Tap onPress={() => done(false)} accessibilityRole="button" style={{ height: 36, marginTop: 6, paddingHorizontal: 16, justifyContent: 'center' }}>
            <Text style={[ui(13, 600), { color: t.inkMuted }]}>Skip for now</Text>
          </Tap>
        )}
      </View>
    </>
  );
}

const AVATAR_PX = 512;
/** The face's square as the profile avatar: our own copy (the cache's can be cleared, the photo deleted). */
async function saveAvatar(s: Selfie) {
  const src = await faceFile(s.p.uri, s.box, AVATAR_PX);
  if (!src) return;
  const dest = new File(Paths.document, `avatar-${Date.now()}.jpg`);
  new File(src).copy(dest);
  await setProfile({ avatar: dest.uri });
  console.log('[onboarding] avatar saved', dest.uri);
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
