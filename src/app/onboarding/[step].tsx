import React, { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Linking } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AccessScreen, HookScreen, LibraryScreen, LimitedScreen, PrivacyScreen, PromiseScreen } from '../../components/onboarding/screens';
import { BeforeAfterScreen, FreqScreen, LastScreen, MirrorScreen, PainsScreen, PostScreen, TopicsScreen } from '../../components/onboarding/screensC';
import { FrameScreen, LayoutScreen, LookScreen, RatioScreen, SizeScreen, StyleScreen, VoiceScreen } from '../../components/onboarding/screensD';
import { ClutterScreen, FindingScreen, FoundScreen, SearchScreen } from '../../components/onboarding/screensE';
import { NameScreen, RemindersScreen, SelfieScreen, TryScreen } from '../../components/onboarding/screensF';
import { DoneScreen, PaywallScreen, RecapScreen } from '../../components/onboarding/screensG';
import { saveAnswers } from '../../services/onboardingAnswers';
import { hasBack, inProgress, isStep, nextStep, type StepId } from '../../services/onboardingFlow';
import { useApp } from '../../state/AppState';
import { useOnboardingFlow } from '../../state/OnboardingFlow';

const to = (s: StepId) => router.push(`/onboarding/${s}` as never);

export default function OnboardingStep() {
  const { step } = useLocalSearchParams<{ step: string }>();
  if (!isStep(step)) return <Redirect href={'/onboarding/1' as never} />;
  return <Step step={step} />;
}

function Step({ step }: { step: StepId }) {
  const { access, stats, ask, recheck, index, tidy, editing, setEditing, progress, reach, answers, purchased, setPurchased } = useOnboardingFlow();
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const asked = useRef(false); // a double tap asks once
  const next = () => {
    Haptics.selectionAsync();
    const to_ = nextStep(step, access, { index, tidy, editing });
    if (to_ === '19') setEditing(false); // back at the recap
    to(to_);
  };
  // the end: the answers are kept, onboarding is marked done, and Discover is next; denied access never started the index
  const finish = async () => {
    await saveAnswers(answers).catch((e) => console.warn('[onboarding] answers save failed:', e));
    await app.finishOnboarding(access !== 'denied');
    router.dismissTo('/');
  };
  const back = hasBack(step, access) ? () => router.back() : undefined;
  const nav = { onNext: next, onBack: back, progress: inProgress(step) ? progress : undefined };
  useEffect(() => { reach(step); }, [step, reach]);

  // after the permission answer there is no way back to the question (design: Back)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => !hasBack(step, access));
    return () => sub.remove();
  }, [step, access]);

  // Settings → PicDump → Photos: back in front, pick up what was changed there
  useEffect(() => {
    if (step !== '4b') return;
    const sub = AppState.addEventListener('change', async (s) => {
      if (s !== 'active') return;
      const a = await recheck();
      if (a === 'full') to('5');
    });
    return () => sub.remove();
  }, [step, recheck]);

  const allow = async () => {
    if (asked.current) return;
    asked.current = true;
    setBusy(true);
    try {
      const a = await ask();
      to(nextStep('4', a, { index, tidy }));
    } finally {
      asked.current = false;
      setBusy(false);
    }
  };

  switch (step) {
    case '1': return <HookScreen onNext={next} />;
    case '2': return <PromiseScreen onNext={next} onBack={back} />;
    case '3': return <PrivacyScreen onNext={next} onBack={back} />;
    case '4': return <AccessScreen onAsk={allow} onBack={back} busy={busy} />;
    case '4b': return <LimitedScreen access={access} shared={stats?.count ?? null} onSettings={() => Linking.openSettings()} onContinue={next} />;
    case '5': return <LibraryScreen access={access} stats={stats} onNext={next} />;
    case '6': return <PostScreen nav={nav} />;
    case '7': return <FreqScreen nav={nav} />;
    case '8': return <TopicsScreen nav={nav} />;
    case '9': return <LastScreen nav={nav} />;
    case '10': return <PainsScreen nav={nav} />;
    case '11': return <MirrorScreen nav={nav} />;
    case '12': return <BeforeAfterScreen nav={nav} />;
    case '13': return <SizeScreen nav={nav} />;
    case '14': return <RatioScreen nav={nav} />;
    case '15': return <LayoutScreen nav={nav} />;
    case '16': return <LookScreen nav={nav} />;
    case '17': return <FrameScreen nav={nav} />;
    case '18': return <VoiceScreen nav={nav} />;
    case '19': return <StyleScreen nav={nav} onEdit={(s) => { setEditing(true); to(s); }} />;
    case '20': return <FindingScreen nav={nav} />;
    case '21': return <FoundScreen nav={nav} />;
    case '22': return <ClutterScreen nav={nav} />;
    case '23': return <SearchScreen nav={nav} />;
    case '24': return <SelfieScreen nav={nav} />;
    case '25': return <NameScreen nav={nav} />;
    case '26': return <RemindersScreen nav={nav} />;
    case '27': return <TryScreen nav={nav} />;
    case '28': return <RecapScreen nav={nav} />;
    case '29': return <PaywallScreen onPurchased={() => { setPurchased(true); to('30'); }} onFree={() => { setPurchased(false); to('30'); }} />;
    case '30': return <DoneScreen pro={purchased} onOpen={finish} />;
    default: return null;
  }
}

