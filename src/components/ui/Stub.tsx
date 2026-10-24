import React from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { ui } from '../../theme/type';
import { Screen } from './Screen';
import { IconButton, TopHeader } from './TopHeader';
import { FrameCard } from './FrameCard';
import { Icons } from './Icons';

/** Placeholder page until its phase builds it. Delete with the last stub. */
export function Stub({ title, note, back, children }: { title: string; note: string; back?: boolean; children?: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <Screen>
      <TopHeader title={title} right={back ? <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}><Icons.close size={16} /></IconButton> : undefined} />
      <FrameCard padding={16}>
        <Text style={[ui(12, 500), { color: t.inkMuted }]}>{note}</Text>
      </FrameCard>
      {children ? <View style={{ marginTop: 12, gap: 8 }}>{children}</View> : null}
    </Screen>
  );
}
