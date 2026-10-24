import React from 'react';
import { Image } from 'expo-image';
import { useProfile } from '../../services/profile';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { display, ui } from '../../theme/type';
import { FrameCard } from './FrameCard';
import { Icons } from './Icons';

/** Shared page header: serif title (28/1.05) left, icon buttons right (gap 6). No crown: paywalls are off. */
export function TopHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ paddingTop: 4, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text style={[display(28, 1.05), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>{title}</Text>
      {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{right}</View> : null}
    </View>
  );
}

/** Mock .icon-btn: 36x36 round frame-card. */
export function IconButton({ onPress, children, size = 36, label }: { onPress?: () => void; children: React.ReactNode; size?: number; label?: string }) {
  return (
    <FrameCard radius={size / 2} onPress={onPress} label={label} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </FrameCard>
  );
}

/** Profile button: 36px round frame-card with the profile photo, else the name's initial, else a person glyph; 16px gear badge. */
export function AvatarButton({ onPress }: { onPress?: () => void }) {
  const { t } = useTheme();
  const p = useProfile();
  const initial = p.name.trim()[0]?.toUpperCase();
  return (
    <FrameCard radius={18} onPress={onPress} label="Profile and settings" style={{ width: 36, height: 36, padding: 1.5 }}>
      <View style={{ flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: t.accentFab, alignItems: 'center', justifyContent: 'center' }}>
        {p.avatar ? <Image source={{ uri: p.avatar }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          : initial ? <Text style={[ui(14, 600), { color: t.accentFabText }]}>{initial}</Text>
          : <Icons.user size={16} color={t.accentFabText} />}
      </View>
      <FrameCard radius={8} style={{ position: 'absolute', right: -2, bottom: -2, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
        <Icons.settings size={10} />
      </FrameCard>
    </FrameCard>
  );
}
