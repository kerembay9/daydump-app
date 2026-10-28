import React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { ui } from '../../theme/type';

/**
 * A small "Pro" tag (the Preview HD chip's shape): on a free user's Pro look tiles, the Texture tab and Tidy's Move button.
 * inverse: on an ink button.
 */
export function ProBadge({ inverse, style }: { inverse?: boolean; style?: StyleProp<ViewStyle> }) {
  const { t } = useTheme();
  return (
    <View pointerEvents="none" style={[{ paddingHorizontal: 5, height: 15, borderRadius: 8, borderWidth: 1, justifyContent: 'center',
      borderColor: inverse ? t.bgScreen : t.borderStrong, backgroundColor: inverse ? undefined : t.bgCard }, style]}>
      <Text style={[ui(9, 700), { color: inverse ? t.bgScreen : t.ink }]}>Pro</Text>
    </View>
  );
}
