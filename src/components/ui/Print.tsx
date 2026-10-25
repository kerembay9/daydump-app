import React from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
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
    <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: t.borderStrong }, Platform.OS === 'android' ? null : { boxShadow: t.shadowPrint }, rotate ? { transform: [{ rotate: `${rotate}deg` }] } : null, style]}>
      {/* Android: a hard offset backdrop, not a blur. Blurred or elevated shadows on these rotated prints cost Discover ~35-100 ms a frame (A54). */}
      {Platform.OS === 'android' ? <View style={{ position: 'absolute', top: 2, left: 1, right: -1, bottom: -2, borderRadius: r, backgroundColor: t.dark ? 'rgba(0,0,0,0.45)' : 'rgba(55,38,28,0.2)' }} /> : null}
      <View style={{ flex: 1, borderRadius: r, overflow: 'hidden', backgroundColor: t.borderStrong, borderWidth: border, borderColor }}>
        {uri ? <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={uri} transition={120} /> : null}
      </View>
    </View>
  );
}
