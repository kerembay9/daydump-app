import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { label, ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Icons } from '../ui/Icons';
import { Pill } from '../ui/Pill';
import { Tap } from '../ui/Tap';
import { useRevealActive } from '../ui/useRevealActive';
import { FilterKey, Look, PRESETS } from '../../services/filters';

/** 0-100 slider: drag or tap anywhere on the track. Accent = ink, so it follows the theme (mock bug: fixed #261F1B). */
function Slider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useTheme();
  const [w, setW] = useState(1);
  const set = (x: number) => onChange(Math.round(Math.max(0, Math.min(1, x / w)) * 100));
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => set(e.nativeEvent.locationX)}
      onResponderMove={(e) => set(e.nativeEvent.locationX)}
      accessibilityRole="adjustable"
      accessibilityLabel="Filter strength"
      accessibilityValue={{ min: 0, max: 100, now: value }}
      style={{ flex: 1, height: 28, justifyContent: 'center' }}
    >
      <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: t.borderStrong }}>
        <View style={{ width: `${value}%`, height: 6, borderRadius: 3, backgroundColor: t.ink }} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', left: (value / 100) * w - 9, width: 18, height: 18, borderRadius: 9, backgroundColor: t.ink, borderWidth: 2, borderColor: t.bgCard, boxShadow: t.shadowCard }} />
    </View>
  );
}

type Props = { look: Look; all: boolean; onLook: (l: Look) => void; onAll: (on: boolean) => void };

/** FILTER card: strength pill, Apply-to-all checkbox, presets with swatches, 0-100% slider. */
export function FilterCard({ look, all, onLook, onAll }: Props) {
  const { t } = useTheme();
  const pct = look.key === 'none' ? 0 : look.pct;
  const presets = useRevealActive(look.key);
  const pick = (key: FilterKey) => onLook({ key, pct: key === 'none' ? look.pct : look.pct || 68 });
  return (
    <FrameCard radius={16} padding={10} style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[label(10, 0.1), { color: t.inkMuted }]}>Filter</Text>
          <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: t.ink }}>
            <Text style={[ui(9.5, 700), { color: t.bgScreen }]}>{pct}%</Text>
          </View>
        </View>
        <Tap onPress={() => onAll(!all)} accessibilityRole="checkbox" accessibilityState={{ checked: all }} hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: t.ink, backgroundColor: all ? t.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {all ? <Icons.check size={12} color={t.bgScreen} /> : null}
          </View>
          <Text style={[ui(10.5, 600), { color: t.ink }]}>Apply to all photos</Text>
        </Tap>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingBottom: 6 }} {...presets.scroll}>
        {PRESETS.map((p) => (
          <View key={p.key} onLayout={presets.item(p.key)}>
            <Pill variant="outline" height={26} label={p.label} on={look.key === p.key} onPress={() => pick(p.key)}
              left={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.swatch, borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)' }} />} />
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[ui(9.5, 600), { color: t.inkMuted, width: 26 }]}>0%</Text>
        {/* dragging while on Original picks Warm 35mm (mock) */}
        <Slider value={pct} onChange={(v) => onLook({ key: look.key === 'none' ? 'warm35' : look.key, pct: v })} />
        <Text style={[ui(10, 700), { color: t.ink, width: 34, textAlign: 'right' }]}>{pct}%</Text>
      </View>
      {!all ? <Text style={[ui(9.5, 500), { color: t.inkMuted, marginTop: 2 }]}>Changes apply to this slide only.</Text> : null}
    </FrameCard>
  );
}
