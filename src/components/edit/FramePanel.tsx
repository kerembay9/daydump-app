import React from 'react';
import { Switch, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { label, ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Tap } from '../ui/Tap';
import { Slider } from './Slider';
import { Fit, Frame, MATTES } from '../../services/layouts';

const FITS: { key: Fit; label: string }[] = [{ key: 'bleed', label: 'Fill' }, { key: 'border', label: 'Matte' }, { key: 'blur', label: 'Blur fill' }];

/** FRAME card (Layout tab): Fit, Gap, Corners, the matte colour and the grid guide (4:5 only). */
export function FramePanel({ frame, onFrame, ratio }: { frame: Frame; onFrame: (f: Frame) => void; ratio: string }) {
  const { t } = useTheme();
  const set = (p: Partial<Frame>) => onFrame({ ...frame, ...p });
  const row = (name: string, body: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 }}>
      <Text style={[label(9, 0.08), { color: t.inkMuted, width: 56 }]}>{name}</Text>
      {body}
    </View>
  );
  const ranged = (name: string, key: 'gap' | 'corners', max: number) => row(name, (
    <>
      <Slider label={name} max={max} value={frame[key]} onChange={(v) => set({ [key]: v })} />
      <Text style={[ui(10, 700), { color: t.ink, width: 22, textAlign: 'right' }]}>{frame[key]}</Text>
    </>
  ));
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
      {ranged('Gap', 'gap', 12)}
      {ranged('Corners', 'corners', 16)}
      {row('Matte', (
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
          {MATTES.map((m) => {
            const on = frame.matte === m.key;
            return (
              <Tap key={m.key} onPress={() => set({ matte: m.key })} accessibilityRole="button" accessibilityLabel={`${m.label} matte`} accessibilityState={{ selected: on }}
                hitSlop={4} style={{ alignItems: 'center', gap: 2 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: m.color, borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)', boxShadow: on ? `0 0 0 2px ${t.bgCard}, 0 0 0 3.5px ${t.ink}` : undefined }} />
                <Text style={[ui(8.5, on ? 700 : 500), { color: t.ink }]}>{m.label}</Text>
              </Tap>
            );
          })}
        </View>
      ))}
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
