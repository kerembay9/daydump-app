import React from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Tap } from './Tap';

type Props = {
  radius?: number;
  padding?: number;
  /** tilt in degrees (hero -1, tiles -0.8 / 0.7 / -0.6) */
  rotate?: number;
  onPress?: () => void;
  /** accessibility label when pressable */
  label?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/** Mock .frame-card: bg-card + 1px border-subtle + shadow-card. Pressable (with btn-tap scale) when onPress is set. */
export function FrameCard({ radius = 16, padding, rotate, onPress, label, style, children }: Props) {
  const { t } = useTheme();
  const s: StyleProp<ViewStyle> = [
    { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, borderRadius: radius, padding },
    // Android: a heavier bottom edge, not a blur. Blurred or elevated shadows on the tilted Discover tiles cost ~10-20 ms a frame (A54).
    Platform.OS === 'android' ? { borderBottomWidth: 2, borderBottomColor: t.dark ? 'rgba(0,0,0,0.5)' : 'rgba(74,52,40,0.13)' } : { boxShadow: t.shadowCard },
    rotate ? { transform: [{ rotate: `${rotate}deg` }] } : null,
    style,
  ];
  return onPress ? <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={s}>{children}</Tap> : <View style={s}>{children}</View>;
}
