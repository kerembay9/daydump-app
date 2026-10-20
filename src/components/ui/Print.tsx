import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../theme/ThemeProvider';

type Props = {
  uri?: string;
  w: number | `${number}%`;
  h: number | `${number}%`;
  r?: number;
  rotate?: number;
  border?: number;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Mock .mini-print: a photo with shadow-print, clipped to its radius, no well. The shadow sits on an outer view and
 * the clip on an inner one so overflow never cuts the shadow.
 */
export function Print({ uri, w, h, r = 8, rotate, border, borderColor, style }: Props) {
  const { t } = useTheme();
  return (
    <View style={[{ width: w, height: h, borderRadius: r, boxShadow: t.shadowPrint }, rotate ? { transform: [{ rotate: `${rotate}deg` }] } : null, style]}>
      <View style={{ flex: 1, borderRadius: r, overflow: 'hidden', backgroundColor: t.borderStrong, borderWidth: border, borderColor }}>
        {uri ? <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={uri} transition={120} /> : null}
      </View>
    </View>
  );
}
