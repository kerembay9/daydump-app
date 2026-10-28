import React from 'react';
import { Platform, StyleProp, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { dateRange } from '../../services/stories/titles';
import { useTheme } from '../../theme/ThemeProvider';
import { ui } from '../../theme/type';

type Props = {
  uri?: string;
  w: number | `${number}%`;
  h: number | `${number}%`;
  r?: number;
  rotate?: number;
  border?: number;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
  /** taken at (ms): a small date tag bottom-right; none / 0 = no tag */
  date?: number;
};

/** Small "Sep 12" tag in a photo's bottom-right corner (", 2024" when not this year). Place inside a positioned box. */
function DateTag({ date }: { date?: number }) {
  if (!date) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: 5, bottom: 5, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <Text style={[ui(9, 600), { color: '#fff' }]}>{dateRange(date, date)}</Text>
    </View>
  );
}

/**
 * Mock .mini-print: a photo with shadow-print, clipped to its radius, no well. The shadow sits on an outer view and
 * the clip on an inner one so overflow never cuts the shadow.
 */
export function Print({ uri, w, h, r = 8, rotate, border, borderColor, style, date }: Props) {
  const { t } = useTheme();
  return (
    <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: t.borderStrong }, Platform.OS === 'android' ? null : { boxShadow: t.shadowPrint }, rotate ? { transform: [{ rotate: `${rotate}deg` }] } : null, style]}>
      {/* Android: a hard offset backdrop, not a blur. Blurred or elevated shadows on these rotated prints cost Discover ~35-100 ms a frame (A54). */}
      {Platform.OS === 'android' ? <View style={{ position: 'absolute', top: 2, left: 1, right: -1, bottom: -2, borderRadius: r, backgroundColor: t.dark ? 'rgba(0,0,0,0.45)' : 'rgba(55,38,28,0.2)' }} /> : null}
      <View style={{ flex: 1, borderRadius: r, overflow: 'hidden', backgroundColor: t.borderStrong, borderWidth: border, borderColor }}>
        {/* memory: a remounted print (Discover reorders, back in front) shows at once instead of decoding the full-size camera JPEG again */}
        {uri ? <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={uri} transition={120} /> : null}
        <DateTag date={date} />
      </View>
    </View>
  );
}
