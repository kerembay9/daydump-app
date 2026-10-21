import React from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/ui/Screen';
import { IconButton } from '../components/ui/TopHeader';
import { Icons } from '../components/ui/Icons';
import { SelfieFinder } from '../components/SelfieFinder';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/type';

/** Dev tools experiment (onboarding uses its pick, useSelfiePick): the selfie finder on its own screen. */
export default function Selfie() {
  const { t } = useTheme();
  return (
    <Screen keyboardShouldPersistTaps="handled">
      <View style={{ paddingTop: 2, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}><Icons.back size={16} /></IconButton>
        <Text style={[display(20), { color: t.ink }]}>Selfie experiment</Text>
      </View>
      <SelfieFinder />
    </Screen>
  );
}
