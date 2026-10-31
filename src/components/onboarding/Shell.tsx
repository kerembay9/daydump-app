import React, { useEffect, useState } from 'react';
import { I18nManager, LayoutChangeEvent, StyleProp, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeInDown, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeProvider';
import { caps, display, label, ui } from '../../theme/type';
import { Icons } from '../ui/Icons';
import { Tap } from '../ui/Tap';
import { tr } from '../../i18n';

type Action = { label: string; onPress: () => void; disabled?: boolean };

/** Headlines hold two lines: 28, then 26 and 22 as they get longer (design: Headlines). */
const headlineSize = (s: string) => (s.length > 46 ? 22 : s.length > 34 ? 26 : 28);

/**
 * One onboarding screen: back button and progress track on top, the content, then the CTA stack pinned to the bottom.
 * The progress track only fills on the habit and style screens (6-27), so it stays invisible here but keeps the layout.
 */
export function Shell({ onBack, onClose, progress, eyebrow, headline, sub, justify = 'flex-start', leadIn, primary, secondary, ghost, links, above, children, busy }: {
  /** none = no back button (the slot stays) */
  onBack?: () => void;
  /** the close button on the right (the paywall) */
  onClose?: () => void;
  /** 0-1 fills the progress bar; undefined = hidden (the slot stays) */
  progress?: number;
  eyebrow?: string;
  headline: string;
  sub?: string;
  justify?: 'flex-start' | 'center' | 'flex-end';
  leadIn?: string;
  primary: Action;
  secondary?: Action;
  ghost?: Action;
  links?: Action[];
  /** the picture over the headline (a print stack) */
  above?: React.ReactNode;
  /** cards under the headline and sub */
  children?: React.ReactNode;
  /** a system dialog or a check is running: the buttons wait */
  busy?: boolean;
}) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const fill = useSharedValue(progress ?? 0);
  // not in render: a write there logs a Reanimated warning on every re-render (the size slider re-renders its screen on each step)
  useEffect(() => { fill.value = withTiming(progress ?? 0, { duration: 500, easing: Easing.bezier(0.4, 0, 0.2, 1) }); }, [progress, fill]);
  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  // the keyboard lifts the whole screen, the buttons with it (screen 25's name field)
  const kb = useAnimatedKeyboard();
  const base = Math.max(insets.bottom, 8);
  const lift = useAnimatedStyle(() => ({ paddingBottom: base + Math.max(0, kb.height.value - insets.bottom) }));
  // the page never scrolls: if the content is taller than the space between the header and the buttons, it shrinks to fit
  const [room, setRoom] = useState(0), [need, setNeed] = useState(0);
  const scale = room > 0 && need > room ? room / need : 1;
  const onRoom = (e: LayoutChangeEvent) => setRoom(e.nativeEvent.layout.height);
  const onNeed = (e: LayoutChangeEvent) => setNeed(e.nativeEvent.layout.height);
  const press = (a: Action, impact: boolean) => () => {
    if (busy || a.disabled) return;
    if (impact) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    a.onPress();
  };
  return (
    <Animated.View style={[{ flex: 1, backgroundColor: t.bgScreen, experimental_backgroundImage: t.bgGrad ?? undefined, paddingTop: insets.top }, lift]}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }}>
        <View style={{ width: 44, height: 44 }}>
          {onBack && (
            <Tap onPress={onBack} accessibilityRole="button" accessibilityLabel={tr('common.back')}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }}><Icons.back size={20} color={t.ink} /></View>
            </Tap>
          )}
        </View>
        <View accessibilityRole="progressbar" accessibilityValue={progress == null ? undefined : { min: 0, max: 100, now: Math.round(progress * 100) }}
          style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: t.borderStrong, overflow: 'hidden', opacity: progress == null ? 0 : 1 }}>
          <Animated.View style={[{ height: 3, borderRadius: 2, backgroundColor: t.ink }, bar]} />
        </View>
        <View style={{ width: 44, height: 44 }}>
          {onClose && (
            <Tap onPress={onClose} accessibilityRole="button" accessibilityLabel={tr('common.close')}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
              <Icons.close size={18} color={t.ink} />
            </Tap>
          )}
        </View>
      </View>

      <View onLayout={onRoom} style={{ flex: 1, overflow: 'hidden', justifyContent: justify }}>
        <View onLayout={onNeed} style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, gap: 12, transformOrigin: 'top center', transform: [{ scale }] }}>
          {above}
          {eyebrow ? <Text style={[label(10, 0.14), { color: t.inkMuted }]}>{caps(eyebrow)}</Text> : null}
          <Animated.Text entering={FadeInDown.duration(450)} accessibilityRole="header" style={[display(headlineSize(headline), 1.08), { color: t.ink }]}>{headline}</Animated.Text>
          {sub ? <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17, marginTop: -4 }]}>{sub}</Text> : null}
          {children}
        </View>
      </View>

      <View style={{ paddingHorizontal: 24, paddingTop: 10, gap: 6 }}>
        {leadIn ? <Text style={[ui(12), { color: t.inkMuted, lineHeight: 17, textAlign: 'center', marginBottom: 6 }]}>{leadIn}</Text> : null}
        <Tap onPress={press(primary, true)} disabled={busy || primary.disabled} accessibilityRole="button" accessibilityState={{ disabled: !!(busy || primary.disabled) }}
          style={{ height: 52, borderRadius: 26, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', boxShadow: t.shadowDeck, opacity: busy || primary.disabled ? 0.35 : 1 }}>
          <Text style={[ui(13, 600), { color: t.bgScreen }]}>{primary.label}</Text>
        </Tap>
        {secondary && (
          <Tap onPress={press(secondary, true)} disabled={busy} accessibilityRole="button"
            style={{ height: 52, borderRadius: 26, borderWidth: 1, borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[ui(13, 600), { color: t.ink }]}>{secondary.label}</Text>
          </Tap>
        )}
        {ghost && (
          <Tap onPress={press(ghost, false)} disabled={busy} accessibilityRole="button" style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[ui(13, 600), { color: t.ink }]}>{ghost.label}</Text>
          </Tap>
        )}
        {links && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {links.map((l) => (
              <Tap key={l.label} onPress={l.onPress} accessibilityRole="link" style={{ height: 44, paddingHorizontal: 12, justifyContent: 'center' }}>
                <Text style={[ui(11, 500), { color: t.inkMuted, textDecorationLine: 'underline' }]}>{l.label}</Text>
              </Tap>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

/** A card on the screen background: bg-card, hairline border, shadow-card, 16 radius. */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { t } = useTheme();
  return <View style={[{ backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, borderRadius: 16, boxShadow: t.shadowCard }, style]}>{children}</View>;
}
