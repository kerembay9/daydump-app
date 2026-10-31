import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ClipEmbedder } from '../../../modules/clip-embedder';
import { useTheme } from '../../theme/ThemeProvider';
import { fixed } from '../../theme/tokens';
import { display, ui } from '../../theme/type';
import { hourOf, TIMES } from '../../services/onboardingFlow';
import { NotificationService } from '../../services/notificationService';
import { setProfile } from '../../services/profile';
import { useApp } from '../../state/AppState';
import { useOnboardingFlow } from '../../state/OnboardingFlow';
import { tr } from '../../i18n';
import { FaceCircle } from '../FaceCircle';
import { saveAvatar } from '../ProfileStep';
import { Icons } from '../ui/Icons';
import { Tap } from '../ui/Tap';
import { Card, Shell } from './Shell';
import { Pic, usePic } from './Prints';
import { Label, Nav, Note, PillButton, Pills, pick, SlidePreview } from './parts';

/** Phase F · Make it yours (screens 24-27): selfie, name, reminders, and the first dump. */

/** 24 · Is this you? Optional: the selfie scan has been running since the photo grant. No access or no selfie: a gentle "none found". */
export function SelfieScreen({ nav }: { nav: Nav }) {
  const { t } = useTheme();
  const { access, selfie, set } = useOnboardingFlow();
  const { best, wait, vote } = selfie;
  const none = access !== 'full' || (!best && !wait);
  const yes = () => {
    if (!best) return;
    vote('up');
    set('selfie', 'me');
    // cropped and saved now, so the avatar is on Home from the start
    saveAvatar(best).catch((e) => console.warn('[onboarding] avatar save failed:', e));
    nav.onNext();
  };
  const no = () => { Haptics.selectionAsync().catch(() => {}); set('selfie', 'not'); vote('down'); };
  const skip = () => { set('selfie', null); nav.onNext(); };
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} eyebrow={tr('onboarding.flow.selfie.eyebrow')}
      headline={tr(none ? 'onboarding.flow.selfie.noneTitle' : best ? 'onboarding.flow.selfie.title' : wait ? 'onboarding.flow.selfie.lookingTitle' : 'onboarding.flow.selfie.noneTitle')}
      sub={tr(none ? 'onboarding.flow.selfie.noneSub' : best ? 'onboarding.flow.selfie.sub' : 'onboarding.flow.selfie.lookingSub')}
      primary={none ? { label: tr('common.continue'), onPress: nav.onNext } : best ? { label: tr('onboarding.flow.selfie.yes'), onPress: yes } : { label: tr('onboarding.flow.selfie.skip'), onPress: skip }}
      secondary={!none && best ? { label: tr('onboarding.flow.selfie.no'), onPress: no } : undefined}
      ghost={!none && best ? { label: tr('onboarding.flow.selfie.skip'), onPress: skip } : undefined}>
      <View style={{ alignItems: 'center', gap: 12, marginTop: 16 }}>
        {best && !none ? (
          <Animated.View key={best.p.id} entering={ZoomIn.springify().damping(14)} style={{ borderRadius: 112, borderWidth: 4, borderColor: fixed.printBorder, boxShadow: t.shadowPrint }}>
            <FaceCircle uri={best.p.uri} box={best.box} aspect={best.aspect} size={200} />
          </Animated.View>
        ) : (
          <View style={{ width: 200, height: 200, borderRadius: 100, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
            <Icons.user size={64} color={t.inkMuted} />
          </View>
        )}
        {best && !none ? <Note center>{tr('onboarding.flow.selfie.note')}</Note> : null}
      </View>
    </Shell>
  );
}

/** 25 · What should we call you? The name writes itself into a Discover card as you type */
export function NameScreen({ nav }: { nav: Nav }) {
  const { t } = useTheme();
  const { answers, set } = useOnboardingFlow();
  const pic = usePic();
  const name = answers.name.trim();
  const go = () => {
    // saved now, so Home and the previews have it from the start
    setProfile({ name }).catch((e) => console.warn('[onboarding] name save failed:', e));
    nav.onNext();
  };
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} headline={tr('onboarding.flow.name.title')} sub={tr('onboarding.flow.name.sub')} primary={{ label: tr('common.continue'), onPress: go }}>
      <View style={{ gap: 16, marginTop: 8 }}>
        <TextInput value={answers.name} onChangeText={(v) => set('name', v)} placeholder={tr('onboarding.flow.name.placeholder')} placeholderTextColor={t.inkMuted} maxLength={24}
          accessibilityLabel={tr('onboarding.flow.name.label')} autoCapitalize="words" autoCorrect={false} returnKeyType="done" onSubmitEditing={go}
          style={[ui(16, 500), { height: 52, paddingHorizontal: 16, borderRadius: 16, color: t.ink, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderStrong }]} />
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Label>{tr('tabs.discover')}</Label>
            <Text numberOfLines={2} style={[display(19.5), { color: t.ink }]}>{name ? tr('onboarding.flow.name.hero', { name }) : tr('onboarding.flow.name.heroNone')}</Text>
            <Text style={[ui(11, 500), { color: t.inkMuted }]}>{tr('onboarding.flow.name.meta', { count: answers.size })}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {[0, 1, 2].map((i) => (
              <Pic key={i} bg={pic(i)} style={{ width: 38, height: 52, borderRadius: 4, borderWidth: 2, borderColor: fixed.printBorder, transform: [{ rotate: `${[-3, 2, -2][i]}deg` }] }} />
            ))}
          </View>
        </Card>
      </View>
    </Shell>
  );
}

/**
 * 26 · Reminders: the 8 PM recap and Sunday's. Android's native recap runs at 8 PM sharp (DailyRecap.kt), so the time pills and the
 * weekly switch only show where the schedule can follow them; elsewhere the copy says 8 PM and Sunday and nothing else is offered.
 */
export function RemindersScreen({ nav }: { nav: Nav }) {
  const { t } = useTheme();
  const { answers, set } = useOnboardingFlow();
  const custom = !ClipEmbedder;
  const time = custom ? answers.time : '8 PM';
  const [busy, setBusy] = useState(false);
  const choose = async (on: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const granted = await NotificationService.setEnabled(on);
      const enabled = on && granted;
      if (enabled && custom) await NotificationService.scheduleDailyRecap(hourOf(time), 0);
      set('notif', enabled ? true : on ? null : false);
    } catch (e) {
      console.warn('[onboarding] notification setting failed:', e);
    }
    nav.onNext();
  };
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} busy={busy} headline={tr('onboarding.flow.reminders.title', { time })} primary={{ label: tr('onboarding.turnOn'), onPress: () => choose(true) }} ghost={{ label: tr('onboarding.notNow'), onPress: () => choose(false) }}>
      <View style={{ gap: 16, marginTop: 8 }}>
        <Card style={{ flexDirection: 'row', gap: 12, padding: 12 }}>
          <Image source={require('../../../assets/icon.png')} style={{ width: 38, height: 38, borderRadius: 9 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Label>PicDump</Label>
              <Text style={[ui(11, 500), { color: t.inkMuted }]}>{time}</Text>
            </View>
            <Text style={[ui(13, 600), { color: t.ink }]}>{tr('onboarding.notifTitle')}</Text>
            <Text style={[ui(12), { color: t.ink, lineHeight: 17 }]}>{tr('onboarding.notifBody')}</Text>
          </View>
        </Card>
        {custom ? (
          <View style={{ gap: 8 }}>
            <Label>{tr('onboarding.flow.reminders.time')}</Label>
            <Pills top={0}>{TIMES.map((x) => <PillButton key={x} label={x} on={answers.time === x} onPress={() => set('time', x)} />)}</Pills>
            <Tap onPress={() => { pick(); set('weekly', !answers.weekly); }} accessibilityRole="switch" accessibilityState={{ checked: answers.weekly }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 16, marginTop: 8, borderRadius: 16, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle }}>
              <View style={{ gap: 2 }}>
                <Text style={[ui(13, 600), { color: t.ink }]}>{tr('onboarding.flow.reminders.weekly')}</Text>
                <Text style={[ui(11, 500), { color: t.inkMuted }]}>{tr('onboarding.flow.reminders.weeklySub')}</Text>
              </View>
              <View style={{ width: 42, height: 24, borderRadius: 12, justifyContent: 'center', backgroundColor: answers.weekly ? t.ink : 'transparent', borderWidth: 1, borderColor: answers.weekly ? t.ink : t.borderStrong }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: answers.weekly ? t.bgScreen : t.inkMuted, marginLeft: answers.weekly ? 20 : 2 }} />
              </View>
            </Tap>
          </View>
        ) : <Note>{tr('onboarding.flow.reminders.fixed')}</Note>}
      </View>
    </Shell>
  );
}

/** 27 · Try your first dump: their style on their own photos; holding the slide shows the originals */
export function TryScreen({ nav }: { nav: Nav }) {
  const app = useApp();
  const { answers } = useOnboardingFlow();
  const [hold, setHold] = useState(false);
  const story = app.stories[0];
  const photos = story?.picks.slice(0, 4).map((p) => p.uri);
  const filled = photos && photos.length ? [0, 1, 2, 3].map((i) => photos[i % photos.length]) : undefined;
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} headline={tr('onboarding.flow.try.title')} sub={story ? `${tr('onboarding.flow.style.photos', { count: answers.size })} · ${story.subtitle.split(' · ').pop()}` : tr('onboarding.flow.style.photos', { count: answers.size })}
      primary={{ label: tr('onboarding.flow.try.cta'), onPress: nav.onNext }}>
      <Animated.View entering={FadeInDown.delay(600).duration(400)}>
        <SlidePreview ratio={answers.ratio} layout={answers.layout} fit={answers.fit} matte={answers.matte} look={answers.look} maxW={270} maxH={340} boxH={350} photos={filled}
          hold={hold} onHold={(on) => { if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setHold(on); }} coach={tr('onboarding.flow.try.coach')} label={tr('onboarding.flow.try.slide')} />
      </Animated.View>
    </Shell>
  );
}
