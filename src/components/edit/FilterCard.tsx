import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Canvas, ColorMatrix, Image as SkiaImage, SkImage } from '@shopify/react-native-skia';
import { useTheme } from '../../theme/ThemeProvider';
import { label, ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Icons } from '../ui/Icons';
import { Tap } from '../ui/Tap';
import { useRevealActive } from '../ui/useRevealActive';
import { Slider } from './Slider';
import { Adjust, ADJUSTS, AdjKey, autoAdjust, brighten, FilterKey, isDark, Look, matrixFor, PRESETS, Tex, Tone } from '../../services/filters';

type Props = {
  look: Look;
  /** "This photo": the targeted photo's look is shown and changed; else the dump's */
  photo: boolean;
  /** the targeted photo has edits of its own */
  own: boolean;
  onLook: (l: Look) => void;
  /** back to the dump's look: targeted → "All photos" */
  onAllPhotos: () => void;
  /** targeted photo's look becomes the dump's, every override goes */
  onEvery: () => void;
  /** targeted photo drops its own look and adjustments */
  onReset: () => void;
  /** the photo Look tiles show and Adjust changes: the targeted one, else the slide's first */
  image: SkImage | null | undefined;
  /** "Photo 2": which photo Adjust changes when none is targeted */
  focus: string;
  adj: Adjust;
  onAdj: (a: Adjust) => void;
  tone: Tone | null;
};

const SUBS = [['look', 'Look'], ['adjust', 'Adjust'], ['texture', 'Texture']] as const;
const TEXTURES: { key: keyof Tex; label: string }[] = [{ key: 'grain', label: 'Grain' }, { key: 'fade', label: 'Fade' }, { key: 'vignette', label: 'Vignette' }];
const TILE = 54;
const same = (a: Adjust, b: Adjust) => ADJUSTS.every(({ key }) => (a[key] ?? 0) === (b[key] ?? 0));
const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

/** A look tile: the photo itself with that preset at the current strength. */
function LookTile({ k, name, swatch, on, image, pct, onPress }: { k: FilterKey; name: string; swatch: string; on: boolean; image: SkImage | null | undefined; pct: number; onPress: () => void }) {
  const { t } = useTheme();
  const m = matrixFor({ key: k, pct: pct || 68 });
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected: on }} style={{ width: TILE + 4, alignItems: 'center', gap: 3 }}>
      <View style={{ width: TILE, height: TILE, borderRadius: 10, overflow: 'hidden', backgroundColor: swatch, boxShadow: on ? `0 0 0 2px ${t.ink}` : undefined }}>
        {image ? (
          <Canvas style={{ flex: 1 }}>
            <SkiaImage image={image} x={0} y={0} width={TILE} height={TILE} fit="cover">{m ? <ColorMatrix matrix={m} /> : null}</SkiaImage>
          </Canvas>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[ui(9, on ? 700 : 500), { color: t.ink }]}>{name}</Text>
    </Tap>
  );
}

/** PHOTOS card: scope (All photos / This photo), then Look (tiles + strength), Adjust (per photo, Auto) or Texture. */
export function FilterCard({ look, photo, own, onLook, onAllPhotos, onEvery, onReset, image, focus, adj, onAdj, tone }: Props) {
  const { t } = useTheme();
  const [sub, setSub] = useState<(typeof SUBS)[number][0]>('look');
  const [tool, setTool] = useState<AdjKey>('light');
  const pct = look.key === 'none' ? 0 : look.pct;
  const presets = useRevealActive(look.key);
  const pick = (key: FilterKey) => onLook({ ...look, key, pct: key === 'none' ? look.pct : look.pct || 68 });
  const auto = tone ? autoAdjust(tone) : null;
  const autoOn = !!auto && same(adj, auto);
  const cur = ADJUSTS.find((a) => a.key === tool)!;
  const link = (text: string, onPress: () => void) => (
    <Tap onPress={onPress} accessibilityRole="button" hitSlop={8}><Text style={[ui(10.5, 600), { color: t.ink, textDecorationLine: 'underline' }]}>{text}</Text></Tap>
  );
  const toolBtn = (key: string, name: string, value: string, on: boolean, onPress: () => void, a11y: string) => (
    <Tap key={key} onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected: on }} style={{ width: 50, alignItems: 'center', gap: 3 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: on ? t.ink : t.borderStrong, backgroundColor: on ? t.ink : undefined }}>
        <Text style={[ui(10, 700), { color: on ? t.bgScreen : t.ink }]}>{value}</Text>
      </View>
      <Text numberOfLines={1} style={[ui(9, on ? 700 : 500), { color: t.ink }]}>{name}</Text>
    </Tap>
  );

  return (
    <FrameCard radius={16} padding={10} style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 2, padding: 2, borderRadius: 14, borderWidth: 1, borderColor: t.borderStrong }}>
          {SUBS.map(([k, name]) => (
            <Tap key={k} onPress={() => setSub(k)} accessibilityRole="tab" accessibilityState={{ selected: sub === k }}
              style={{ height: 24, paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center', backgroundColor: sub === k ? t.ink : undefined }}>
              <Text style={[ui(10.5, 600), { color: sub === k ? t.bgScreen : t.ink }]}>{name}</Text>
            </Tap>
          ))}
        </View>
        {photo ? (
          <Tap onPress={onAllPhotos} accessibilityRole="button" accessibilityLabel="This photo. Tap for all photos" hitSlop={8}
            style={{ height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[ui(10.5, 600), { color: t.bgScreen }]}>This photo</Text>
            <Icons.close size={10} color={t.bgScreen} />
          </Tap>
        ) : (
          <Text style={[ui(10.5, 600), { color: t.ink }]}>{sub === 'adjust' ? focus : 'All photos'}</Text>
        )}
      </View>

      {sub === 'look' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingBottom: 6, paddingTop: 2 }} {...presets.scroll}>
            {PRESETS.map((p) => (
              <View key={p.key} onLayout={presets.item(p.key)}>
                <LookTile k={p.key} name={p.label} swatch={p.swatch} on={look.key === p.key} image={image} pct={look.pct} onPress={() => pick(p.key)} />
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[label(9, 0.08), { color: t.inkMuted, width: 56 }]}>Strength</Text>
            {/* dragging while on Original picks Warm 35mm (mock) */}
            <Slider label="Filter strength" value={pct} onChange={(v) => onLook({ ...look, key: look.key === 'none' ? 'warm35' : look.key, pct: v })} />
            <Text style={[ui(10, 700), { color: t.ink, width: 34, textAlign: 'right' }]}>{pct}%</Text>
          </View>
        </>
      ) : sub === 'adjust' ? (
        <>
          {isDark(tone) && !(adj.light && adj.light > 0) ? (
            <Tap onPress={() => tone && onAdj(brighten(tone, adj))} accessibilityRole="button" accessibilityLabel="Brighten, this photo looks dark"
              style={{ alignSelf: 'flex-start', height: 26, paddingHorizontal: 10, borderRadius: 13, marginBottom: 6, backgroundColor: t.ink, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icons.sparkle size={11} color={t.bgScreen} />
              <Text style={[ui(10.5, 600), { color: t.bgScreen }]}>Brighten · looks dark</Text>
            </Tap>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 2, paddingBottom: 4 }}>
            {toolBtn('auto', autoOn ? 'Auto ✓' : 'Auto', 'A', autoOn, () => auto && onAdj(autoOn ? {} : auto), autoOn ? 'Auto on. Tap to undo' : 'Auto')}
            {ADJUSTS.map((a) => {
              const v = adj[a.key] ?? 0;
              return toolBtn(a.key, a.label, v ? signed(v) : '0', tool === a.key, () => setTool(a.key), `${a.label} ${signed(v)}`);
            })}
          </ScrollView>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[label(9, 0.08), { color: t.inkMuted, width: 56 }]}>{cur.label}</Text>
            <Slider label={cur.label} min={cur.min} value={adj[tool] ?? 0} onChange={(v) => onAdj({ ...adj, [tool]: v })} />
            <Text style={[ui(10, 700), { color: t.ink, width: 34, textAlign: 'right' }]}>{signed(adj[tool] ?? 0)}</Text>
          </View>
        </>
      ) : (
        TEXTURES.map((x) => (
          <View key={x.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[label(9, 0.08), { color: t.inkMuted, width: 56 }]}>{x.label}</Text>
            <Slider label={x.label} value={look[x.key] ?? 0} onChange={(v) => onLook({ ...look, [x.key]: v })} />
            <Text style={[ui(10, 700), { color: t.ink, width: 34, textAlign: 'right' }]}>{look[x.key] ?? 0}</Text>
          </View>
        ))
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
        {photo ? (
          <>
            {sub === 'adjust' ? null : link('Use on every photo', onEvery)}
            {own ? link('Reset photo', onReset) : null}
          </>
        ) : (
          <Text style={[ui(9.5, 500), { color: t.inkMuted }]}>
            {sub === 'adjust' ? 'Adjust changes one photo. Tap another below.' : 'Tap a photo below to give it its own look.'}
          </Text>
        )}
      </View>
    </FrameCard>
  );
}
