import React from 'react';
import { StyleProp, Text, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { ui } from '../../theme/type';
import { Tap } from './Tap';

type Props = {
  label: string;
  on?: boolean;
  onPress: () => void;
  /** card = frame-card fill (layout pills), outline = border-strong ring (filter presets), plain = no fill */
  variant?: 'card' | 'outline' | 'plain';
  height?: number;
  size?: number;
  left?: React.ReactNode;
  /** after the label (a Pro tag) */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Rounded pill toggle; on = ink fill with screen-coloured text. */
export function Pill({ label, on, onPress, variant = 'card', height = 24, size = 10, left, right, style }: Props) {
  const { t } = useTheme();
  const base: ViewStyle = { height, paddingHorizontal: 9, borderRadius: height / 2, flexDirection: 'row', alignItems: 'center', gap: 5 };
  const off: ViewStyle =
    variant === 'card' ? { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, boxShadow: t.shadowCard }
    : variant === 'outline' ? { borderWidth: 1, borderColor: t.borderStrong }
    : {};
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }} hitSlop={4}
      style={[base, on ? { backgroundColor: t.ink, borderWidth: variant === 'plain' ? 0 : 1, borderColor: t.ink } : off, style]}>
      {left}
      <Text style={[ui(size, 600), { color: on ? t.bgScreen : t.ink }]}>{label}</Text>
      {right}
    </Tap>
  );
}
