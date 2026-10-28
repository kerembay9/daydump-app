import React from 'react';
import { Switch, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { caps, label, ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Tap } from '../ui/Tap';
import { Fit, Frame, frameControls, LayoutKey, MATTES } from '../../services/layouts';

const FITS: { key: Fit; label: string }[] = [{ key: 'bleed', label: 'Fill' }, { key: 'blur', label: 'Blur fill' }];

/** FRAME card (Layout tab): Fit, Gap and Corners steppers, the colour behind (each only when it changes this layout) and the grid guide (4:5 only). */
export function FramePanel({ frame, onFrame, ratio, layout }: { frame: Frame; onFrame: (f: Frame) => void; ratio: string; layout: LayoutKey }) {
  const { t } = useTheme();
  const uses = frameControls(layout, frame);
  const set = (p: Partial<Frame>) => onFrame({ ...frame, ...p });
  const row = (name: string, body: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 }}>
      <Text style={[label(9, 0.08), { color: t.inkMuted, width: 56 }]}>{caps(name)}</Text>
      {body}
    </View>
  );
  // − value + : a tap is a step, no dragging
  const stepper = (name: string, key: 'gap' | 'corners', max: number, step: number, zero: string) => {
    const v = frame[key];
    const to = (n: number) => set({ [key]: Math.max(0, Math.min(max, n)) });
    const btn = (sign: -1 | 1) => {
      const off = sign < 0 ? v <= 0 : v >= max;
      return (
        <Tap onPress={() => to(v + sign * step)} disabled={off} accessibilityRole="button" accessibilityLabel={`${sign < 0 ? 'Less' : 'More'} ${name.toLowerCase()}`}
          hitSlop={6} style={{ width: 30, height: 28, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.3 : 1 }}>
          <Text style={[ui(15, 600), { color: t.ink }]}>{sign < 0 ? '−' : '+'}</Text>
        </Tap>
      );
    };
    return (
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <Text style={[label(9, 0.08), { color: t.inkMuted }]}>{caps(name)}</Text>
        <View accessible accessibilityRole="adjustable" accessibilityLabel={name} accessibilityValue={{ min: 0, max, now: v }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => to(v + (e.nativeEvent.actionName === 'increment' ? step : -step))}
          style={{ flexDirection: 'row', alignItems: 'center', height: 28, borderRadius: 14, borderWidth: 1, borderColor: t.borderStrong }}>
          {btn(-1)}
          <Text style={[ui(11, 700), { color: t.ink, minWidth: 40, textAlign: 'center', fontVariant: ['tabular-nums'] }]}>{v ? v : zero}</Text>
          {btn(1)}
        </View>
      </View>
    );
  };
  return (
    <FrameCard radius={16} padding={10} style={{ marginBottom: 8, gap: 2 }}>
      {row('Fit', (
        <View style={{ flex: 1, flexDirection: 'row', gap: 2, padding: 2, borderRadius: 14, borderWidth: 1, borderColor: t.borderStrong }}>
          {FITS.map((f) => {
            const on = frame.fit === f.key;
            return (
              <Tap key={f.key} onPress={() => set({ fit: f.key })} accessibilityRole="button" accessibilityLabel={f.label} accessibilityState={{ selected: on }}
                style={{ flex: 1, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.ink : undefined }}>
                <Text style={[ui(10.5, 600), { color: on ? t.bgScreen : t.ink }]}>{f.label}</Text>
              </Tap>
            );
          })}
        </View>
      ))}
      {uses.gap ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 34 }}>
          {stepper('Gap', 'gap', 12, 2, 'None')}
          {stepper('Corners', 'corners', 16, 4, 'Square')}
        </View>
      ) : null}
      {uses.matte ? row('Behind', (
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
          {MATTES.map((m) => {
            const on = frame.matte === m.key;
            return (
              <Tap key={m.key} onPress={() => set({ matte: m.key })} accessibilityRole="button" accessibilityLabel={`${m.label} behind`} accessibilityState={{ selected: on }}
                hitSlop={4} style={{ alignItems: 'center', gap: 2 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: m.color, borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)', boxShadow: on ? `0 0 0 2px ${t.bgCard}, 0 0 0 3.5px ${t.ink}` : undefined }} />
                <Text style={[ui(8.5, on ? 700 : 500), { color: t.ink }]}>{m.label}</Text>
              </Tap>
            );
          })}
        </View>
      )) : null}
      {ratio === '4:5' ? row('Grid', (
        <>
          <Text style={[ui(9.5, 500), { color: t.inkMuted, flex: 1 }]}>Show what your profile grid crops</Text>
          <Switch value={frame.guide} onValueChange={(guide) => set({ guide })} accessibilityLabel="Grid guide"
            trackColor={{ true: t.ink, false: t.borderStrong }} thumbColor={t.bgCard} />
        </>
      )) : null}
    </FrameCard>
  );
}
