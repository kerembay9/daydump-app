import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
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
    { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, boxShadow: t.shadowCard, borderRadius: radius, padding },
    rotate ? { transform: [{ rotate: `${rotate}deg` }] } : null,
    style,
  ];
  return onPress ? <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={s}>{children}</Tap> : <View style={s}>{children}</View>;
}
