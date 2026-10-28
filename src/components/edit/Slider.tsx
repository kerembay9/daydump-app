import React, { startTransition, useRef, useState } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeProvider';

type Props = { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number };

/**
 * Drag or tap anywhere on the track. min < 0 = a ruler (Adjust): ticks, filled from 0, and 0 clicks in (snaps within 4,
 * with a haptic tick). Accent = ink, so it follows the theme. Moves use pageX against the track's page origin taken at
 * grant: locationX is relative to whatever view is under the finger, so it jumps back and forth mid-drag.
 * The thumb follows the finger from local state; the value goes out as a transition, so redrawing the slides never holds the thumb back.
 * After release the thumb stays on the value it sent until `value` catches up, else it snaps back to the old one for a moment.
 */
export function Slider({ value, onChange, label, min = 0, max = 100 }: Props) {
  const { t } = useTheme();
  const [w, setW] = useState(1);
  const origin = useRef(0);
  // at: where the thumb is drawn; to: the value sent for it; live: the finger is down
  const [drag, setDrag] = useState<{ at: number; to: number; live: boolean } | null>(null);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    if (drag && !drag.live) setDrag(null);
  }
  // the last value sent: `value` lags behind a transition
  const sent = useRef(value);
  const ruler = min < 0;
  const span = max - min;
  const clamp = (v: number) => Math.max(min, Math.min(max, ruler && Math.abs(v) <= 4 ? 0 : Math.round(v)));
  const emit = (next: number) => {
    if (next === sent.current) return;
    sent.current = next;
    if (ruler && next === 0) Haptics.selectionAsync().catch(() => {});
    startTransition(() => onChange(next));
  };
  const set = (pageX: number) => {
    const raw = min + Math.max(0, Math.min(1, (pageX - origin.current) / w)) * span;
    const next = clamp(raw);
    setDrag({ at: ruler && Math.abs(raw) <= 4 ? 0 : raw, to: next, live: true });
    emit(next);
  };
  const release = () => setDrag((d) => (d && d.to !== value ? { at: d.to, to: d.to, live: false } : null));
  const shown = drag ? drag.at : value;
  const at = (v: number) => ((v - min) / span) * w;
  const zero = at(Math.max(min, 0));
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => { sent.current = value; origin.current = e.nativeEvent.pageX - e.nativeEvent.locationX; set(e.nativeEvent.pageX); }}
      onResponderMove={(e) => set(e.nativeEvent.pageX)}
      onResponderRelease={release}
      onResponderTerminate={release}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => { sent.current = value; emit(clamp(value + (e.nativeEvent.actionName === 'increment' ? 5 : -5))); }}
      style={{ flex: 1, height: 28, justifyContent: 'center' }}
    >
      {ruler ? (
        <View pointerEvents="none" style={{ height: 14, justifyContent: 'center' }}>
          {Array.from({ length: span / 10 + 1 }, (_, k) => {
            const v = min + k * 10;
            return <View key={v} style={{ position: 'absolute', left: at(v) - 0.5, width: 1, height: v === 0 ? 14 : v % 50 ? 6 : 10, backgroundColor: v === 0 ? t.ink : t.borderStrong }} />;
          })}
          <View style={{ position: 'absolute', left: Math.min(zero, at(shown)), width: Math.abs(at(shown) - zero), height: 3, borderRadius: 2, backgroundColor: t.ink }} />
        </View>
      ) : (
        <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: t.borderStrong }}>
          <View style={{ width: at(shown), height: 6, borderRadius: 3, backgroundColor: t.ink }} />
        </View>
      )}
      <View pointerEvents="none" style={{ position: 'absolute', left: at(shown) - 9, width: 18, height: 18, borderRadius: 9, backgroundColor: t.ink, borderWidth: 2, borderColor: t.bgCard, boxShadow: t.shadowCard }} />
    </View>
  );
}
