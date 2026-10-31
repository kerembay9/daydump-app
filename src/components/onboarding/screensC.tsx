import React from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { ui } from '../../theme/type';
import { FREQS, LASTS, PAINS, POSTS, TOPICS } from '../../services/onboardingFlow';
import { useOnboardingFlow } from '../../state/OnboardingFlow';
import { getLocale, tr } from '../../i18n';
import { Card, Shell } from './Shell';
import { Pic, PrintSpec, PrintStack, usePic } from './Prints';
import { ChoiceCard, Nav, Note, Option, PillButton, Pills } from './parts';

/** Phase C · Habits (screens 6-12): what they post, where and how often. */

const POST_THUMBS = [{ w: 30, h: 38, r: -3 }, { w: 22, h: 39, r: 2 }, { w: 22, h: 39, r: -2 }, { w: 34, h: 34, r: 3 }];

const options = (group: string, ids: readonly string[], withSub = false): Option[] =>
  ids.map((id) => ({ id, label: tr(`onboarding.flow.opt.${group}.${id}`), sub: withSub ? tr(`onboarding.flow.opt.${group}.${id}Sub`) : undefined }));

/** 6 · Where do you post? */
export function PostScreen({ nav }: { nav: Nav }) {
  const { answers, set } = useOnboardingFlow();
  const pic = usePic();
  const opts = options('post', POSTS, true).map((o, i) => ({ ...o, thumb: { ...POST_THUMBS[i], bg: pic(i) } }));
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} headline={tr('onboarding.flow.post.title')} sub={tr('onboarding.flow.post.sub')}
      primary={{ label: tr('common.continue'), onPress: nav.onNext, disabled: !answers.post }}>
      <View style={{ gap: 8, marginTop: 8 }}>{opts.map((o) => <ChoiceCard key={o.id} o={o} on={answers.post === o.id} onPress={() => set('post', o.id)} />)}</View>
    </Shell>
  );
}

/** 7 · How often do you post? */
export function FreqScreen({ nav }: { nav: Nav }) {
  const { answers, set } = useOnboardingFlow();
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} headline={tr('onboarding.flow.freq.title')} primary={{ label: tr('common.continue'), onPress: nav.onNext, disabled: !answers.freq }}>
      <View style={{ gap: 8, marginTop: 8 }}>{options('freq', FREQS).map((o) => <ChoiceCard key={o.id} o={o} on={answers.freq === o.id} onPress={() => set('freq', o.id)} />)}</View>
    </Shell>
  );
}

/** 8 · What do you post about? (pick any; "Everything" stands alone) */
export function TopicsScreen({ nav }: { nav: Nav }) {
  const { answers, toggle } = useOnboardingFlow();
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} headline={tr('onboarding.flow.topics.title')} sub={tr('onboarding.flow.topics.sub')}
      primary={{ label: tr('common.continue'), onPress: nav.onNext, disabled: !answers.topics.length }}>
      <Pills top={8}>{options('topics', TOPICS).map((o) => <PillButton key={o.id} label={o.label} on={answers.topics.includes(o.id)} onPress={() => toggle('topics', o.id)} />)}</Pills>
    </Shell>
  );
}

/** 9 · When did you last post a photo dump? */
export function LastScreen({ nav }: { nav: Nav }) {
  const { answers, set } = useOnboardingFlow();
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} headline={tr('onboarding.flow.last.title')} primary={{ label: tr('common.continue'), onPress: nav.onNext, disabled: !answers.last }}>
      <View style={{ gap: 8, marginTop: 8 }}>{options('last', LASTS).map((o) => <ChoiceCard key={o.id} o={o} on={answers.last === o.id} onPress={() => set('last', o.id)} />)}</View>
    </Shell>
  );
}

/** 10 · What stops you? */
export function PainsScreen({ nav }: { nav: Nav }) {
  const { answers, toggle } = useOnboardingFlow();
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} headline={tr('onboarding.flow.pains.title')} sub={tr('onboarding.flow.pains.sub')}
      primary={{ label: tr('common.continue'), onPress: nav.onNext, disabled: !answers.pains.length }}>
      <Pills top={8}>{options('pains', PAINS).map((o) => <PillButton key={o.id} label={o.label} on={answers.pains.includes(o.id)} onPress={() => toggle('pains', o.id)} />)}</Pills>
    </Shell>
  );
}

/** 11 · Mirror: each pain they picked, with what PicDump does about it, in the order they picked them */
export function MirrorScreen({ nav }: { nav: Nav }) {
  const { t } = useTheme();
  const { answers, access, stats } = useOnboardingFlow();
  const ids = answers.pains.length ? answers.pains : ['many', 'choose', 'forget'];
  const count = access === 'full' && stats ? stats.count.toLocaleString(getLocale()) : null;
  const fix = (id: string) => (id === 'many' ? tr(count ? 'onboarding.flow.mirror.manyCount' : 'onboarding.flow.mirror.many', { count }) : tr(`onboarding.flow.mirror.${id}`));
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} headline={tr(answers.pains.length ? 'onboarding.flow.mirror.title' : 'onboarding.flow.mirror.titleNone')} primary={{ label: tr('common.continue'), onPress: nav.onNext }}>
      <View style={{ gap: 8, marginTop: 8 }}>
        {ids.map((id, i) => (
          <Animated.View key={id} entering={FadeInDown.delay(i * 90).duration(400)}>
            <Card style={{ padding: 14, gap: 4 }}>
              <Text style={[ui(13, 600), { color: t.ink }]}>{tr(`onboarding.flow.opt.pains.${id}`)}</Text>
              <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17 }]}>{fix(id)}</Text>
            </Card>
          </Animated.View>
        ))}
      </View>
    </Shell>
  );
}

/** 12 · Before and after: the roll as a grid of small tiles, then the few prints worth posting */
export function BeforeAfterScreen({ nav }: { nav: Nav }) {
  const { t } = useTheme();
  const { answers, stats } = useOnboardingFlow();
  const pic = usePic();
  const count = stats?.count ?? 0;
  const key = count >= 1000 ? 'large' : count >= 50 ? 'mid' : 'any';
  const after: PrintSpec[] = [
    { x: 2, y: 24, w: 46, h: 92, r: -5, bg: pic(0), bw: 3 }, { x: 52, y: 14, w: 46, h: 92, r: 4, bg: pic(1), bw: 3 },
    { x: 4, y: 112, w: 44, h: 88, r: 3, bg: pic(2), bw: 3 }, { x: 50, y: 118, w: 46, h: 86, r: -3, bg: pic(3), bw: 3 },
    { x: 28, y: 62, w: 46, h: 96, r: -1, bg: pic(4), bw: 3, tape: true }, { x: 30, y: 150, w: 40, h: 62, r: 5, bg: pic(5), bw: 3 },
  ];
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} headline={tr(`onboarding.flow.before.${key}`)} primary={{ label: tr('common.continue'), onPress: nav.onNext }}>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ height: 220, borderRadius: 12, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, padding: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 3, overflow: 'hidden' }}>
            {Array.from({ length: 24 }, (_, i) => <Pic key={i} bg={pic(i)} style={{ width: '15.5%', height: 34, borderRadius: 2 }} />)}
            <View style={{ position: 'absolute', right: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.6)' }}>
              <Text style={[ui(9, 600), { color: '#F3ECE3' }]}>{tr('onboarding.flow.before.photos', { count: stats ? stats.count.toLocaleString(getLocale()) : '…' })}</Text>
            </View>
          </View>
          <Note>{tr('onboarding.flow.before.label')}</Note>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <PrintStack prints={after} height={220} />
          <Note>{tr('onboarding.flow.before.after', { count: answers.size })}</Note>
        </View>
      </View>
    </Shell>
  );
}
