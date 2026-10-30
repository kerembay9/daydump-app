import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { fixed } from '../../theme/tokens';
import { display, ui } from '../../theme/type';
import { FITS, isProLook, LAYOUTS, LOOKS, MATTES, RATIOS, VOICES } from '../../services/onboardingFlow';
import { useOnboardingFlow } from '../../state/OnboardingFlow';
import { Slider } from '../edit/Slider';
import { Tap } from '../ui/Tap';
import { tr } from '../../i18n';
import { Shell } from './Shell';
import { SAMPLE } from './Prints';
import { ChoiceCard, fitRatio, Label, LOOK_FILTER, matteColor, Nav, Note, Option, pick, PillButton, Pills, SlidePreview } from './parts';

/** Phase D · Your style (screens 13-19): size, shape, layout, look, frame and caption voice; then the recap. */

const opt = (group: string, id: string) => tr(`onboarding.flow.opt.${group}.${id}`);

// one print of the fan on screen 13: springs in or out as the count changes
function FanPrint({ i, n, p }: { i: number; n: number; p: { x: number; y: number; r: number } }) {
  const on = i < n;
  const k = useSharedValue(on ? 1 : 0);
  useEffect(() => { k.value = withSpring(on ? 1 : 0, { damping: 14, stiffness: 160 }); }, [on, k]);
  const st = useAnimatedStyle(() => ({ opacity: k.value, transform: [{ translateY: (1 - k.value) * -50 }, { rotate: `${p.r}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: p.x, top: p.y, width: 84, height: 108, borderWidth: 4, borderColor: fixed.printBorder, borderRadius: 8, experimental_backgroundImage: SAMPLE[i % 8] }, st]} />
  );
}

/** 13 · How many photos per dump? A fan of prints that grows and shrinks with the slider */
export function SizeScreen({ nav }: { nav: Nav }) {
  const { t } = useTheme();
  const { answers, set } = useOnboardingFlow();
  const n = answers.size;
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} eyebrow={tr('onboarding.flow.style.eyebrow')} headline={tr('onboarding.flow.size.title')} sub={tr('onboarding.flow.size.sub')} primary={{ label: tr('common.continue'), onPress: nav.onNext }}>
      <View style={{ gap: 12, marginTop: 8 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 342, maxWidth: '100%', height: 190, alignSelf: 'center' }}>
          {Array.from({ length: 20 }, (_, i) => {
            const k = n > 1 ? i / (n - 1) : 0.5;
            return <FanPrint key={i} i={i} n={n} p={{ x: Math.round(16 + k * 214), y: 20 + Math.round(Math.abs(k - 0.5) * 40), r: Math.round((-9 + k * 18) * 10) / 10 }} />;
          })}
        </View>
        <Text style={[display(19.5), { color: t.ink, textAlign: 'center' }]}>{tr('onboarding.flow.size.label', { count: n })}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Slider label={tr('onboarding.flow.size.label', { count: n })} value={n} min={4} max={20} onChange={(v) => { pick(); set('size', v); }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[ui(11, 500), { color: t.inkMuted }]}>4</Text>
          <Text style={[ui(11, 500), { color: t.inkMuted }]}>20</Text>
        </View>
      </View>
    </Shell>
  );
}

/** 14 · Which shape? The slide morphs to it */
export function RatioScreen({ nav }: { nav: Nav }) {
  const { t } = useTheme();
  const { answers, set } = useOnboardingFlow();
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} eyebrow={tr('onboarding.flow.style.eyebrow')} headline={tr('onboarding.flow.ratio.title')} sub={tr(answers.post ? 'onboarding.flow.ratio.subPost' : 'onboarding.flow.ratio.subDefault')} primary={{ label: tr('common.continue'), onPress: nav.onNext }}>
      <SlidePreview ratio={answers.ratio} layout={answers.layout} fit={answers.fit} matte={answers.matte} look={answers.look} maxW={230} maxH={300} boxH={300} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {RATIOS.map((r) => {
          const on = answers.ratio === r;
          const f = fitRatio(r, 36, 36);
          return (
            <Tap key={r} onPress={() => { pick(); set('ratio', r); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={r}
              style={{ flex: 1, height: 76, gap: 6, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bgCard, borderWidth: 1.5, borderColor: on ? t.ink : t.borderSubtle }}>
              <View style={{ width: f.w, height: f.h, borderWidth: 1.5, borderColor: t.ink, borderRadius: 3 }} />
              <Text style={[ui(11, 600), { color: t.ink }]}>{r}</Text>
            </Tap>
          );
        })}
      </View>
    </Shell>
  );
}

/** 15 · Layout vibe: the same photos, a different flow */
export function LayoutScreen({ nav }: { nav: Nav }) {
  const { answers, set } = useOnboardingFlow();
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} eyebrow={tr('onboarding.flow.style.eyebrow')} headline={tr('onboarding.flow.layout.title')} sub={tr('onboarding.flow.layout.sub')} primary={{ label: tr('common.continue'), onPress: nav.onNext }}>
      <SlidePreview ratio={answers.ratio} layout={answers.layout} fit={answers.fit} matte={answers.matte} look={answers.look} maxW={250} maxH={310} boxH={316} />
      <Pills center>{LAYOUTS.map((l) => <PillButton key={l} label={opt('layout', l)} on={answers.layout === l} onPress={() => set('layout', l)} />)}</Pills>
    </Shell>
  );
}

/** 16 · Choose a look: one large tile, six small ones; Pro looks wear a badge and never animate */
export function LookScreen({ nav }: { nav: Nav }) {
  const { t } = useTheme();
  const { answers, set } = useOnboardingFlow();
  const cur = answers.look;
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} eyebrow={tr('onboarding.flow.style.eyebrow')} headline={tr('onboarding.flow.look.title')} sub={tr('onboarding.flow.look.sub')} primary={{ label: tr('common.continue'), onPress: nav.onNext }}>
      <View style={{ gap: 12, marginTop: 4 }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <View style={{ width: 168, height: 210, borderWidth: 5, borderColor: fixed.printBorder, borderRadius: 8, boxShadow: t.shadowPrint, experimental_backgroundImage: SAMPLE[4], filter: LOOK_FILTER[cur] }} />
          <Text style={[display(16.5), { color: t.ink }]}>{opt('look', cur)}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {LOOKS.map((l) => {
            const on = cur === l;
            return (
              <Tap key={l} onPress={() => { pick(); set('look', l); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${opt('look', l)}${isProLook(l) ? ', Pro' : ''}`} style={{ width: '31%', flexGrow: 1, alignItems: 'center', gap: 6 }}>
                <View style={{ width: '100%', aspectRatio: 0.85 }}>
                  <View style={{ flex: 1, borderWidth: 3, borderColor: on ? t.ink : fixed.printBorder, borderRadius: 8, boxShadow: t.shadowPrint, experimental_backgroundImage: SAMPLE[4], filter: LOOK_FILTER[l] }} />
                  {isProLook(l) ? <View style={{ position: 'absolute', right: 5, top: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: fixed.chipBg }}><Text style={[ui(9, 600), { color: fixed.chipText }]}>Pro</Text></View> : null}
                </View>
                <Text style={[ui(11, on ? 700 : 500), { color: t.ink }]}>{opt('look', l)}</Text>
              </Tap>
            );
          })}
        </View>
        {isProLook(cur) ? <Note>{tr('onboarding.flow.look.proNote', { look: opt('look', cur) })}</Note> : null}
      </View>
    </Shell>
  );
}

/** 17 · Add a frame: fill, matte or blur; the matte colour only matters for matte */
export function FrameScreen({ nav }: { nav: Nav }) {
  const { t } = useTheme();
  const { answers, set } = useOnboardingFlow();
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} eyebrow={tr('onboarding.flow.style.eyebrow')} headline={tr('onboarding.flow.frame.title')} primary={{ label: tr('common.continue'), onPress: nav.onNext }}>
      <SlidePreview ratio={answers.ratio} layout={answers.layout === 'scrap' ? 'bento' : answers.layout} fit={answers.fit} matte={answers.matte} look={answers.look} maxW={236} maxH={290} boxH={296} />
      <Pills center>{FITS.map((f) => <PillButton key={f} label={opt('fit', f)} on={answers.fit === f} onPress={() => set('fit', f)} />)}</Pills>
      <View style={{ gap: 8, marginTop: 8, opacity: answers.fit === 'matte' ? 1 : 0.4 }}>
        <Label>{tr('onboarding.flow.frame.matte')}</Label>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {MATTES.map((m) => {
            const on = answers.matte === m;
            return (
              <Tap key={m} onPress={() => { pick(); set('matte', m); set('fit', 'matte'); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={opt('matte', m)} style={{ alignItems: 'center', gap: 6, minWidth: 48 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: matteColor(m, t.bgCard), borderWidth: 1, borderColor: t.borderStrong, boxShadow: on ? `0 0 0 2px ${t.bgScreen}, 0 0 0 4px ${t.ink}` : undefined }} />
                <Text style={[ui(11, 500), { color: t.ink }]}>{opt('matte', m)}</Text>
              </Tap>
            );
          })}
        </View>
      </View>
    </Shell>
  );
}

/** 18 · How should captions sound? */
export function VoiceScreen({ nav }: { nav: Nav }) {
  const { answers, set } = useOnboardingFlow();
  const opts: Option[] = VOICES.map((v) => ({ id: v, label: opt('voice', v), lines: [1, 2, 3].map((n) => tr(`onboarding.flow.opt.voice.${v}${n}`, { defaultValue: '' })).filter(Boolean) }));
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} eyebrow={tr('onboarding.flow.style.eyebrow')} headline={tr('onboarding.flow.voice.title')} primary={{ label: tr('common.continue'), onPress: nav.onNext }}>
      <View style={{ gap: 8, marginTop: 8 }}>{opts.map((o) => <ChoiceCard key={o.id} o={o} on={answers.voice === o.id} onPress={() => set('voice', o.id)} />)}</View>
    </Shell>
  );
}

/** 19 · Here is your style: the slide, a one-line summary, and chips that jump back to change any part */
export function StyleScreen({ nav, onEdit }: { nav: Nav; onEdit: (step: string) => void }) {
  const { t } = useTheme();
  const { answers } = useOnboardingFlow();
  const line = `${opt('look', answers.look)} · ${answers.ratio} · ${opt('layout', answers.layout)} · ${tr('onboarding.flow.style.photos', { count: answers.size })}`;
  const chips: [string, string][] = [
    ['13', tr('onboarding.flow.style.photos', { count: answers.size })], ['14', answers.ratio], ['15', opt('layout', answers.layout)],
    ['16', opt('look', answers.look)], ['17', opt('fit', answers.fit)],
  ];
  return (
    <Shell onBack={nav.onBack} progress={nav.progress} headline={tr('onboarding.flow.style.title')} primary={{ label: tr('common.continue'), onPress: nav.onNext }}>
      <View style={{ alignItems: 'center', gap: 6, marginTop: 8 }}>
        <Label>{tr('onboarding.flow.style.yourStyle')}</Label>
        <Text style={[display(16.5), { color: t.ink, textAlign: 'center' }]}>{line}</Text>
      </View>
      <SlidePreview ratio={answers.ratio} layout={answers.layout} fit={answers.fit} matte={answers.matte} look={answers.look} maxW={210} maxH={250} boxH={262} rot={-1} tape />
      <Pills center top={0}>{chips.map(([s, l]) => <PillButton key={s} label={l} edit onPress={() => onEdit(s)} />)}</Pills>
      <Note center>{tr('onboarding.flow.style.note')}</Note>
    </Shell>
  );
}
