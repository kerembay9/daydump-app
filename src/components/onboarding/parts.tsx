import React, { useEffect } from 'react';
import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeProvider';
import { fixed } from '../../theme/tokens';
import { caps, display, label as labelStyle, ui } from '../../theme/type';
import { tr } from '../../i18n';
import { Icons } from '../ui/Icons';
import { Tap } from '../ui/Tap';
import { Tape } from '../ui/Tape';
import { Pic, usePic } from './Prints';

/** What every onboarding screen gets from its route: the next and back actions and the progress (undefined = bar hidden). */
export type Nav = { onNext: () => void; onBack?: () => void; progress?: number };

/** Every option tap: a selection haptic (design: Haptics). */
export const pick = () => Haptics.selectionAsync().catch(() => {});

/** The look filters of the design's Look screen, as RN `filter` strings. */
export const LOOK_FILTER: Record<string, string | undefined> = {
  warm: 'sepia(0.28) saturate(1.15) contrast(1.04)',
  cashmere: 'sepia(0.18) brightness(1.06) saturate(0.8)',
  soft: 'contrast(0.86) brightness(1.08) saturate(0.9)',
  sunfade: 'sepia(0.42) brightness(1.1) contrast(0.82)',
  bw: 'grayscale(1) contrast(1.12)',
  orig: undefined,
};

export type Option = { id: string; label: string; sub?: string; lines?: string[]; thumb?: { w: number; h: number; r: number; bg: string } };

/** A choice card: optional tilted thumbnail, serif label, small sub or sample lines, a check on the right (design: Selection card). */
export function ChoiceCard({ o, on, onPress, radio = true }: { o: Option; on: boolean; onPress: () => void; radio?: boolean }) {
  const { t } = useTheme();
  return (
    <Tap onPress={() => { pick(); onPress(); }} accessibilityRole={radio ? 'radio' : 'checkbox'} accessibilityState={{ selected: on, checked: on }}
      style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: t.bgCard, borderWidth: 1.5, borderColor: on ? t.ink : t.borderSubtle, borderRadius: 16, boxShadow: t.shadowCard }}>
      {o.thumb ? (
        <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Pic bg={o.thumb.bg} style={{ width: o.thumb.w, height: o.thumb.h, borderWidth: 2, borderColor: fixed.printBorder, borderRadius: 4, boxShadow: t.shadowPrint, transform: [{ rotate: `${o.thumb.r}deg` }] }} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[display(16.5), { color: t.ink }]}>{o.label}</Text>
        {o.sub ? <Text style={[ui(11, 500), { color: t.inkMuted }]}>{o.sub}</Text> : null}
        {o.lines ? <View style={{ gap: 2, marginTop: 2 }}>{o.lines.map((l) => <Text key={l} style={[ui(11, 500), { color: t.inkMuted, fontStyle: 'italic' }]}>“{l}”</Text>)}</View> : null}
      </View>
      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.ink : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: t.borderStrong }}>
        {on ? <Icons.check size={12} color={t.bgScreen} /> : null}
      </View>
    </Tap>
  );
}

/** A pill: ink when on, outline when off (design: Pill). edit: a small pencil, for the recap's chips. */
export function PillButton({ label, on, onPress, edit }: { label: string; on?: boolean; onPress: () => void; edit?: boolean }) {
  const { t } = useTheme();
  return (
    <Tap onPress={() => { pick(); onPress(); }} accessibilityRole={edit ? 'button' : 'checkbox'} accessibilityLabel={edit ? `${label}, ${tr('common.edit')}` : label} accessibilityState={edit ? undefined : { checked: !!on }}
      style={{ height: 44, paddingHorizontal: 18, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? t.ink : 'transparent', borderWidth: 1, borderColor: on ? t.ink : t.borderStrong }}>
      <Text style={[ui(13, 600), { color: on ? t.bgScreen : t.ink }]}>{label}</Text>
      {edit ? <Icons.edit size={14} color={t.ink} /> : null}
    </Tap>
  );
}

export function Pills({ children, center, top = 4 }: { children: React.ReactNode; center?: boolean; top?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: top, justifyContent: center ? 'center' : 'flex-start' }}>{children}</View>;
}

export function Note({ children, center }: { children: string; center?: boolean }) {
  const { t } = useTheme();
  return <Text style={[ui(11, 500), { color: t.inkMuted, lineHeight: 16, textAlign: center ? 'center' : 'auto' }]}>{children}</Text>;
}

/** A small caps label over a block (design: section label). */
export function Label({ children }: { children: string }) {
  const { t } = useTheme();
  return <Text style={[labelStyle(10, 0.14), { color: t.inkMuted }]}>{caps(children)}</Text>;
}

// [x, y, w, h, rotate] in percent of the slide, per layout (design: CELLS)
const CELLS: Record<string, number[][]> = {
  one: [[0, 0, 100, 100, 0]],
  split: [[0, 0, 50, 100, 0], [50, 0, 50, 100, 0]],
  bento: [[0, 0, 60, 100, 0], [60, 0, 40, 50, 0], [60, 50, 40, 50, 0]],
  grid: [[0, 0, 50, 50, 0], [50, 0, 50, 50, 0], [0, 50, 50, 50, 0], [50, 50, 50, 50, 0]],
  scrap: [[4, 4, 56, 48, -4], [42, 10, 54, 44, 5], [6, 50, 50, 44, 3], [46, 52, 50, 42, -3]],
};
const RATIO: Record<string, [number, number]> = { '4:5': [4, 5], '9:16': [9, 16], '1:1': [1, 1], '3:4': [3, 4] };
const MATTE: Record<string, string> = { card: '#EFE6DA', cream: fixed.printBorder, kraft: '#EFE4CD' };
const isUri = (s: string) => !s.startsWith('linear-gradient');
export const matteColor = (id: string, card?: string) => (id === 'card' && card ? card : MATTE[id] ?? MATTE.card);

/** Width and height of a ratio fitted inside maxW x maxH. */
export function fitRatio(ratio: string, maxW: number, maxH: number): { w: number; h: number } {
  const [rw, rh] = RATIO[ratio] ?? RATIO['4:5'];
  let w = maxW, h = (w * rh) / rw;
  if (h > maxH) { h = maxH; w = (h * rw) / rh; }
  return { w: Math.round(w), h: Math.round(h) };
}

/**
 * A slide as the user is shaping it: ratio, layout, frame and look on four sample photos (design: Slide preview).
 * The size morphs over 450 ms when the shape changes; hold shows the originals (no look) with an "Original" chip.
 */
export function SlidePreview({ ratio, layout, fit, matte, look, maxW, maxH, boxH, rot = 0, tape, chip, coach, hold, onHold, photos: given, label }: {
  ratio: string; layout: string; fit: string; matte: string; look: string; maxW: number; maxH: number; boxH: number; rot?: number; tape?: boolean;
  chip?: string; coach?: string; hold?: boolean; onHold?: (on: boolean) => void; photos?: string[]; label?: string;
}) {
  const { t } = useTheme();
  const pic = usePic();
  const photos = given ?? [pic(0), pic(1), pic(2), pic(3)];
  const { w, h } = fitRatio(ratio, maxW, maxH);
  const sw = useSharedValue(w), sh = useSharedValue(h);
  useEffect(() => {
    const cfg = { duration: 450, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };
    sw.value = withTiming(w, cfg); sh.value = withTiming(h, cfg);
  }, [w, h, sw, sh]);
  const size = useAnimatedStyle(() => ({ width: sw.value, height: sh.value }));
  const scrap = layout === 'scrap';
  const list = CELLS[layout] ?? CELLS.one;
  const inset = fit === 'fill' && !scrap ? 0 : scrap ? 2 : 6;
  const insetY = (inset * w) / h;
  const filter = hold ? undefined : LOOK_FILTER[look];
  const bg = scrap || fit === 'matte' ? matteColor(matte, t.bgCard) : '#2b231b';
  return (
    <View style={{ height: boxH, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
      <Pressable disabled={!onHold} onPressIn={() => onHold?.(true)} onPressOut={() => onHold?.(false)} accessibilityLabel={label} accessibilityHint={coach}>
        <Animated.View style={[{ transform: [{ rotate: `${rot}deg` }] }, size]}>
          <View style={{ flex: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: bg, borderWidth: 5, borderColor: fixed.printBorder, boxShadow: t.shadowPrint }}>
            {fit === 'blur' && !scrap ? <View style={{ position: 'absolute', top: -24, left: -24, right: -24, bottom: -24, overflow: 'hidden', experimental_backgroundImage: isUri(photos[0]) ? undefined : photos[0], filter: `blur(14px)${filter ? ` ${filter}` : ''}` }}>{isUri(photos[0]) ? <Image source={{ uri: photos[0] }} style={{ flex: 1 }} contentFit="cover" /> : null}</View> : null}
            <View style={{ position: 'absolute', left: `${inset}%`, right: `${inset}%`, top: `${insetY}%`, bottom: `${insetY}%` }}>
              {[0, 1, 2, 3].map((i) => {
                const c = list[i] ?? list[0];
                const gap = fit === 'fill' && !scrap ? 1 : 2;
                return (
                  <View key={i} style={{ position: 'absolute', left: `${c[0]}%`, top: `${c[1]}%`, width: `${c[2]}%`, height: `${c[3]}%`, padding: gap, opacity: list[i] ? 1 : 0, transform: [{ rotate: `${c[4]}deg` }] }}>
                    <View style={{ flex: 1, overflow: 'hidden', experimental_backgroundImage: isUri(photos[i]) ? undefined : photos[i], filter, borderWidth: scrap ? 3 : 0, borderColor: fixed.printBorder, boxShadow: scrap ? t.shadowPrint : undefined, borderRadius: scrap ? 3 : fit === 'fill' ? 0 : 2 }}>
                      {isUri(photos[i]) ? <Image source={{ uri: photos[i] }} style={{ flex: 1 }} contentFit="cover" /> : null}
                    </View>
                  </View>
                );
              })}
            </View>
            {chip || hold ? (
              <View style={{ position: 'absolute', left: 8, top: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: fixed.chipBg }}>
                <Text style={[ui(9, 600), { color: fixed.chipText }]}>{hold ? 'Original' : chip}</Text>
              </View>
            ) : null}
          </View>
          {tape ? <Tape style={{ top: -8 }} /> : null}
          {coach ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: -60, right: -60, bottom: -50, alignItems: 'center' }}>
              <View style={{ width: 10, height: 10, backgroundColor: t.ink, transform: [{ rotate: '45deg' }], marginBottom: -5 }} />
              <View style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20, backgroundColor: t.ink, boxShadow: t.shadowCard }}>
                <Text style={[ui(11, 500), { color: t.bgScreen }]}>{coach}</Text>
              </View>
            </View>
          ) : null}
        </Animated.View>
      </Pressable>
    </View>
  );
}

/** A card stack of rows with a rule between them (the recap and library info). */
export function RowsCard({ rows, style }: { rows: { k: string; v: string }[]; style?: StyleProp<ViewStyle> }) {
  const { t } = useTheme();
  return (
    <View style={[{ backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, borderRadius: 16, boxShadow: t.shadowCard }, style]}>
      {rows.map((r, i) => (
        <View key={r.k} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 3, borderTopWidth: i ? 1 : 0, borderTopColor: t.borderSubtle }}>
          <Label>{r.k}</Label>
          <Text style={[ui(13, 600), { color: t.ink }]}>{r.v}</Text>
        </View>
      ))}
    </View>
  );
}
