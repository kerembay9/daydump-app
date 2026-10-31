import React from 'react';
import { Stack } from 'expo-router';
import { OnboardingFlowProvider } from '../../state/OnboardingFlow';

/** First-run onboarding: one route per step (/onboarding/1 ... ), so the system back gesture and the stack agree. */
export default function OnboardingLayout() {
  return (
    <OnboardingFlowProvider>
      {/* each screen paints its own background: the stack's fade would otherwise show the screen behind */}
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: false }} />
    </OnboardingFlowProvider>
  );
}
