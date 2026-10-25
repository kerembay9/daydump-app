import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, GestureResponderEvent, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { Icons } from '../ui/Icons';

type Rect = { x: number; y: number; w: number; h: number };
type Throw = { key: number; uri: string; from: Rect; to: Rect; rEnd: number };
type Measurable = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void };

export const THROW_MS = 620;
/** PhotoStack's `basket` thumbs (32 px, inside its 48x44 box): where the 1st pick lands, and every later one. */
const SLOTS = [{ left: 2, top: 4, rot: -16 }, { left: 14, top: 6, rot: 11 }];
const at = (v: Measurable | null | undefined) => new Promise<Rect | null>((res) =>
  (typeof v?.measureInWindow === 'function' ? v.measureInWindow((x, y, w, h) => res({ x, y, w, h })) : res(null)));

/** The pose t (0..1) into a toss from `from` to `to` (design/basket-throws.html, "Soft toss"): arc, one lazy half-turn, shrink late. */
export function tossPose(t: number, from: Rect, to: Rect, rEnd: number) {
  'worklet';
  const dx = to.x + to.w / 2 - (from.x + from.w / 2), dy = to.y + to.h / 2 - (from.y + from.h / 2);
  const h = Math.max(110, Math.abs(dy) * 0.4), s = to.w / from.w;
  return { x: dx * t, y: dy * t - h * 4 * t * (1 - t), r: (-180 + rEnd) * t, s: (1 + (s - 1) * t * t * t) * (1 + 0.1 * Math.sin(Math.PI * t)) };
}

/**
 * Adding a photo tosses a copy of it from where it was tapped into the Selected basket, which bounces when it lands
 * (light haptic). `root` = the screen's root view (the layer is drawn over it), `stack` = the basket's PhotoStack box.
 */
export function useBasketThrow() {
  const root = useRef<View>(null), stack = useRef<View>(null);
  const [flying, setFlying] = useState<Throw[]>([]);
  const seq = useRef(0);
  const land = useSharedValue(1);
  const stackStyle = useAnimatedStyle(() => ({ transform: [
    { scaleX: interpolate(land.value, [0, 0.25, 0.55, 0.8, 1], [1, 1.16, 0.94, 1.03, 1]) },
    { scaleY: interpolate(land.value, [0, 0.25, 0.55, 0.8, 1], [1, 0.88, 1.08, 1.03, 1]) },
  ] }));
  const countStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(land.value, [0, 0.35, 0.7], [1, 1.35, 1], 'clamp') }] }));

  /** `slot` = the basket's size before this add. Does nothing when something can't be measured, or motion is reduced. */
  const throwIn = async (uri: string, e: GestureResponderEvent | undefined, slot: number) => {
    const [reduced, a, s, o] = await Promise.all([AccessibilityInfo.isReduceMotionEnabled().catch(() => false), at(e?.currentTarget as Measurable | undefined), at(stack.current), at(root.current)]);
    if (reduced || !a || !s || !o) return;
    const { left, top, rot } = SLOTS[Math.min(slot, 1)];
    const key = ++seq.current;
    setFlying((f) => [...f, { key, uri, rEnd: rot, from: { ...a, x: a.x - o.x, y: a.y - o.y }, to: { x: s.x - o.x + left, y: s.y - o.y + top, w: 32, h: 32 } }]);
    setTimeout(() => {
      setFlying((f) => f.filter((x) => x.key !== key));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      land.value = 0;
      land.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
    }, THROW_MS);
  };

  const layer = (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {flying.map((th) => <Toss key={th.key} th={th} />)}
    </View>
  );
  return { root, stack, throwIn, layer, stackStyle, countStyle };
}

function Toss({ th }: { th: Throw }) {
  const { t } = useTheme();
  const p = useSharedValue(0);
  useEffect(() => { p.value = withTiming(1, { duration: THROW_MS, easing: Easing.linear }); }, [p]);
  const { from, to, rEnd } = th;
  const style = useAnimatedStyle(() => {
    const q = tossPose(p.value, from, to, rEnd);
    return { transform: [{ translateX: q.x }, { translateY: q.y }, { rotate: `${q.r}deg` }, { scale: q.s }] };
  });
  // one sparkle drops off at the top of the arc and drifts away as the photo flies on
  const top = tossPose(0.5, from, to, rEnd);
  const ang = (th.key * 2.4) % (2 * Math.PI);
  const spark = useAnimatedStyle(() => {
    const u = interpolate(p.value, [0.5, 1], [0, 1], 'clamp');
    return {
      opacity: u > 0 && u < 1 ? 1 : 0,
      transform: [{ translateX: 26 * u * Math.cos(ang) }, { translateY: 26 * u * Math.sin(ang) }, { scale: Math.sin(Math.PI * u) }, { rotate: `${140 * u}deg` }],
    };
  });
  return (
    <>
      <Animated.View testID="basket-throw" style={[{ position: 'absolute', left: from.x, top: from.y, width: from.w, height: from.h, borderRadius: 12, overflow: 'hidden', backgroundColor: t.borderStrong }, style]}>
        <Image source={{ uri: th.uri }} style={{ flex: 1 }} contentFit="cover" />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: from.x + from.w / 2 + top.x - 5, top: from.y + from.h / 2 + top.y - 5 }, spark]}>
        <Icons.sparkle size={10} color="#E2A35B" />
      </Animated.View>
    </>
  );
}
