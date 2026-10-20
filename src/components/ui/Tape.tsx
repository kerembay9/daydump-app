import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { fixed } from '../../theme/tokens';

/**
 * Masking tape: 56x16, radius 2, dashed left/right edges. Default placement = Discover hero: top 0, centred, -2deg,
 * above the card (render it after the card). No backdrop blur on Android; the semi-opaque fill stands in.
 */
export function Tape({ rotate = -2, style }: { rotate?: number; style?: StyleProp<ViewStyle> }) {
  const { t } = useTheme();
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 20 }, style]}>
      <View
        style={{
          width: 56, height: 16, borderRadius: 2, backgroundColor: t.tapeBg,
          borderLeftWidth: 1, borderRightWidth: 1, borderColor: t.tapeBorder, borderStyle: 'dashed',
          boxShadow: fixed.tapeShadow, transform: [{ rotate: `${rotate}deg` }],
        }}
      />
    </View>
  );
}
