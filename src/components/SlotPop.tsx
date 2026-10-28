import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Hub, seenFresh, slotLabel, Slot } from '../services/today';
import type { Theme } from '../theme/tokens';
import { ui } from '../theme/type';

/** The hub's accent (mock --accent) and its tint (--hl). */
export const accent = (t: Theme) => (t.dark ? '#C25C3C' : '#A84A2F');
export const accentTint = (t: Theme) => (t.dark ? 'rgba(194,92,60,0.2)' : 'rgba(168,74,47,0.14)');

/**
 * Slot pop: squares filled since the user last looked flip in, a toast says "+ The sky ✓" (or "Bingo! +1 print"), a haptic
 * plays, then they're marked seen. Runs only while `focused`. anim is 1 at rest: toast hidden, cells full size.
 */
export function useSlotPop(hub: Hub | null, focused: boolean) {
  const [anim] = useState(() => new Animated.Value(1));
  const playing = useRef(false);
  useEffect(() => {
    if (!hub?.fresh.length || !focused || playing.current) return;
    playing.current = true;
    (hub.freshBingo ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)).catch(() => {});
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }).start(() => { playing.current = false; seenFresh(hub); });
  }, [hub, focused, anim]);
  const text = !focused || !hub?.fresh.length ? null
    : hub.freshBingo ? 'Bingo! +1 print' : hub.fresh.length === 1 ? `+ ${slotLabel(hub.fresh[0])} ✓` : `+ ${hub.fresh.length} squares ✓`;
  /** a fresh square's flip: scaleX 0 → 1 over the first third */
  const flip = (k: Slot | '') => (k && hub?.fresh.includes(k) ? { transform: [{ scaleX: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }) }] } : null);
  return { text, anim, flip };
}

/** The pop's toast: an ink pill that rises in and fades out. Place it in a positioned box. */
export function PopToast({ text, anim, t, top = '40%' }: { text: string | null; anim: Animated.Value; t: Theme; top?: `${number}%` | number }) {
  if (!text) return null;
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', top, alignSelf: 'center', zIndex: 30, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: t.ink,
      opacity: anim.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] }),
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [12, 0, -8] }) }, { scale: anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.8, 1, 1] }) }],
    }}>
      <Text style={[ui(14, 700), { color: t.bgScreen }]}>{text}</Text>
    </Animated.View>
  );
}
