import React from 'react';
import { Platform, StyleProp, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { fixed } from '../../theme/tokens';
import { ui } from '../../theme/type';
import { Tape } from '../ui/Tape';
import { useOnboardingFlow } from '../../state/OnboardingFlow';

/** Sample photos for the screens that show no real ones yet (design: PH). Gradients stand in for pictures. */
export const SAMPLE = [
  'linear-gradient(135deg, #d3b48c, #8f6c4c)',
  'linear-gradient(160deg, #b9c4a8, #6f7f63)',
  'linear-gradient(140deg, #e2b9a2, #a3604a)',
  'linear-gradient(150deg, #a9b8c9, #5d7088)',
  'linear-gradient(180deg, #ecd3ae 0%, #e3b98e 54%, #8d6a4c 54%, #5f4635 100%)',
  'linear-gradient(170deg, #c9a78a, #5e4636)',
  'linear-gradient(200deg, #f0d6b8, #c08a62)',
  'linear-gradient(120deg, #8e9a86, #c7b89a)',
] as const;

export type PrintSpec = {
  x: number; y: number; w: number; h: number;
  /** tilt in degrees, kept between -7 and 7 */
  r: number;
  /** a SAMPLE gradient, or a photo uri */
  bg: string;
  /** print border (default 4) */
  bw?: number;
  tape?: boolean;
  chip?: string;
  /** 2x2 collage inside the print (a dump) */
  cells?: string[];
};

export const isUri = (s: string) => !s.startsWith('linear-gradient');

/**
 * The picture for slot `i` on the screens after the photo question: a real library photo when there are any (slots wrap around the
 * pool), else the SAMPLE gradient. Screens 1-3 never call this: no access yet, so they keep the gradients.
 */
export function usePic(): (i: number) => string {
  const { photos } = useOnboardingFlow();
  return (i: number) => (photos.length ? photos[i % photos.length] : SAMPLE[i % SAMPLE.length]);
}

/** A box filled with a photo uri or a SAMPLE gradient; `filter` (a look) applies to the picture only, so borders stay sharp. */
export function Pic({ bg, style, filter }: { bg: string; style?: StyleProp<ViewStyle>; filter?: string }) {
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <View style={{ flex: 1, filter, experimental_backgroundImage: isUri(bg) ? undefined : bg }}>
        {isUri(bg) ? <Image source={{ uri: bg }} style={{ flex: 1 }} contentFit="cover" /> : null}
      </View>
    </View>
  );
}

function Fill({ bg }: { bg: string }) {
  return isUri(bg) ? <Image source={{ uri: bg }} style={{ flex: 1 }} contentFit="cover" /> : <View style={{ flex: 1, experimental_backgroundImage: bg }} />;
}

/** The drop: a small spring, 60 ms stagger by index, the tape last (design: Prints). */
function PrintView({ p, i }: { p: PrintSpec; i: number }) {
  const { t } = useTheme();
  // the layout animation owns this view's transform, so the tilt sits on the plain View inside it
  return (
    <Animated.View entering={FadeInDown.delay(i * 60).springify().damping(13).stiffness(140)} style={{ position: 'absolute', left: p.x, top: p.y, width: p.w, height: p.h }}>
      <View style={{ flex: 1, transform: [{ rotate: `${p.r}deg` }] }}>
        <View style={{ flex: 1, borderWidth: p.bw ?? 4, borderColor: fixed.printBorder, borderRadius: 8, overflow: 'hidden', backgroundColor: t.borderStrong, boxShadow: Platform.OS === 'android' ? undefined : t.shadowPrint }}>
          {p.cells ? (
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 2, backgroundColor: fixed.printBorder }}>
              {p.cells.map((c, k) => <View key={k} style={{ width: '49%', height: '49%', flexGrow: 1 }}><Fill bg={c} /></View>)}
            </View>
          ) : <Fill bg={p.bg} />}
          {p.chip ? (
            <View style={{ position: 'absolute', right: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: fixed.chipBg }}>
              <Text style={[ui(9, 600), { color: fixed.chipText }]}>{p.chip}</Text>
            </View>
          ) : null}
        </View>
        {p.tape ? <Animated.View entering={FadeInDown.delay(i * 60 + 240).duration(300)} style={{ position: 'absolute', top: -8, left: 0, right: 0 }}><Tape seed={i} style={{ top: 0 }} /></Animated.View> : null}
      </View>
    </Animated.View>
  );
}

/** A loose pile of prints in a 342-wide box (design: 390 wide screen, 24 side padding). */
export function PrintStack({ prints, height, rotate = 0, children }: { prints: PrintSpec[]; height: number; rotate?: number; children?: React.ReactNode }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 342, maxWidth: '100%', height, alignSelf: 'center', marginBottom: 8, transform: [{ rotate: `${rotate}deg` }] }}>
      {prints.map((p, i) => <PrintView key={i} p={p} i={i} />)}
      {children}
    </View>
  );
}
