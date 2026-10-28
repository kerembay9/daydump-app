import React, { useState } from 'react';
import { ScrollView as RNScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Canvas, ColorMatrix, Image as SkiaImage, SkImage } from '@shopify/react-native-skia';
import { useTheme } from '../../theme/ThemeProvider';
import { fixed } from '../../theme/tokens';
import { display, label, ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Tap } from '../ui/Tap';
import { Icons } from '../ui/Icons';
import { Sheet } from '../ui/Sheet';
import type { DumpPhoto } from '../../services/dumps';
import { FilterState, lookFor, matrixFor } from '../../services/filters';

const W = 46, H = 50, GAP = 6, SLOT = W + GAP;
const buzz = () => { Haptics.selectionAsync().catch(() => {}); };

type ThumbProps = { p: DumpPhoto; i: number; n: number; active: boolean; selected: boolean; image?: SkImage | null; matrix: number[] | null; onTap: (i: number) => void; onHold: (i: number) => void; onMove: (from: number, to: number) => void };

/** Tap = select; hold = photo menu; hold and drag = move it. */
function Thumb({ p, i, n, active, selected, image, matrix, onTap, onHold, onMove }: ThumbProps) {
  const tx = useSharedValue(0);
  const lifted = useSharedValue(0);
  const pan = Gesture.Pan()
    .activateAfterLongPress(300) // the drag runs on the UI thread; JS only hears about the drop
    .onStart(() => { lifted.value = 1; scheduleOnRN(buzz); })
    .onUpdate((e) => { tx.value = Math.max(-i * SLOT, Math.min((n - 1 - i) * SLOT, e.translationX)); })
    .onEnd((e) => {
      const to = Math.max(0, Math.min(n - 1, i + Math.round(e.translationX / SLOT)));
      if (Math.abs(e.translationX) < 10) scheduleOnRN(onHold, i);
      else if (to !== i) scheduleOnRN(onMove, i, to);
    })
    .onFinalize(() => { tx.value = 0; lifted.value = 0; });
  const tap = Gesture.Tap().runOnJS(true).onEnd((_e, ok) => { if (ok) onTap(i); });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { scale: lifted.value ? 1.1 : 1 }], zIndex: lifted.value ? 10 : 0 }));
  const { t } = useTheme();
  const cover = i === 0;
  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View accessible accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}${cover ? ', cover' : ''}. Hold for options or to move.`}
        style={[{ width: W, height: H, borderRadius: 10, marginTop: 3 },
          selected ? { boxShadow: `0 0 0 2.5px ${t.ink}`, marginTop: 1 } : active ? { boxShadow: `0 0 0 1.5px ${t.inkMuted}`, marginTop: 2 } : { opacity: 0.82 }, style]}>
        <View style={{ flex: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: t.borderStrong }}>
          {/* filtered thumbs draw the canvas's own decoded image; plain ones (and until it decodes) use expo-image */}
          {image && matrix ? (
            <Canvas style={{ flex: 1 }}>
              <SkiaImage image={image} x={0} y={0} width={W} height={H} fit="cover"><ColorMatrix matrix={matrix} /></SkiaImage>
            </Canvas>
          ) : (
            <Image source={{ uri: p.uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={p.uri} />
          )}
        </View>
        <View style={{ position: 'absolute', left: 2, bottom: 2, paddingHorizontal: 4, borderRadius: 7, backgroundColor: cover ? fixed.printBorder : 'rgba(0,0,0,0.65)', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={[ui(8.5, 700), { color: cover ? '#261F1B' : '#fff' }]}>{cover ? '★ 1' : `#${i + 1}`}</Text>
          {/* ✧ icon, not the ✨ emoji (decision #10), as in Create */}
          {p.suggested ? <Icons.sparkle size={8} color={cover ? '#261F1B' : '#fff'} /> : null}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function Action({ text, onPress, disabled, danger }: { text: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const { t } = useTheme();
  return (
    <FrameCard radius={14} onPress={disabled ? undefined : onPress} label={text} style={{ paddingVertical: 12, paddingHorizontal: 14, opacity: disabled ? 0.4 : 1 }}>
      <Text style={[ui(13, 600), { color: danger ? '#B4412A' : t.ink }]}>{text}</Text>
    </FrameCard>
  );
}

/** Grid of photos to pick from, in sections. empty: what to say when there are none. */
function PickGrid({ sections, onPick, empty }: { sections: { title: string; photos: DumpPhoto[] }[]; onPick: (p: DumpPhoto) => void; empty?: string }) {
  const { t } = useTheme();
  const win = useWindowDimensions();
  const size = (win.width - 32 - 3 * 6) / 4;
  const any = sections.some((s) => s.photos.length);
  return (
    <RNScrollView style={{ maxHeight: win.height * 0.55 }} contentContainerStyle={{ gap: 12 }}>
      {!any ? <Text style={[ui(12, 500), { color: t.inkMuted }]}>{empty ?? 'No other photos to suggest yet. They show up once your library is indexed.'}</Text> : null}
      {sections.filter((s) => s.photos.length).map((s) => (
        <View key={s.title} style={{ gap: 6 }}>
          <Text style={[label(9.5, 0.11), { color: t.inkMuted }]}>{s.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {s.photos.map((p) => (
              <Tap key={p.id} onPress={() => onPick(p)} accessibilityRole="button" accessibilityLabel="Use this photo" style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', backgroundColor: t.borderStrong }}>
                <Image source={{ uri: p.uri }} style={{ flex: 1 }} contentFit="cover" recyclingKey={p.uri} />
              </Tap>
            ))}
          </View>
        </View>
      ))}
    </RNScrollView>
  );
}

type Props = {
  photos: DumpPhoto[];
  /** photos on the active slide (thin ring) */
  active: Set<string>;
  /** the tapped photo (bold ring; tap it again = cover) */
  selected: string | null;
  images: Record<string, SkImage | null>;
  filter: FilterState;
  onTap: (i: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (i: number) => void;
  onReplace: (i: number, p: DumpPhoto) => void;
  onAdd: (p: DumpPhoto) => void;
  /** null: no swaps for this dump (hides "Swap for a similar photo") */
  swapsFor: ((i: number) => DumpPhoto[]) | null;
  addable: () => { title: string; photos: DumpPhoto[] }[];
  /** the pickers' text when they have nothing to offer */
  empty?: string;
};

type Open = { kind: 'menu' | 'swap'; i: number } | { kind: 'add' } | null;

/** DUMP ORDER filmstrip: tap = select (tap the selected one again = make it the cover), hold = menu, hold + drag = move, + = add. */
export function Filmstrip({ photos, active, selected, images, filter, onTap, onMove, onRemove, onReplace, onAdd, swapsFor, addable, empty }: Props) {
  const { t } = useTheme();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const n = photos.length;
  const i = open && open.kind !== 'add' ? open.i : -1;

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingHorizontal: 2 }}>
        <Text style={[label(9.5, 0.11), { color: t.inkMuted }]}>Dump order (tap 2× for cover)</Text>
        <Text style={[ui(10, 400), { color: t.inkMuted }]}>Hold to move</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: GAP, paddingBottom: 6, paddingHorizontal: 2 }}>
        {photos.map((p, k) => (
          <Thumb key={p.id} p={p} i={k} n={n} active={active.has(p.id)} selected={selected === p.id && active.has(p.id)}
            image={images[p.uri]} matrix={matrixFor(lookFor(filter, p.id))} onTap={onTap} onMove={onMove} onHold={(j) => setOpen({ kind: 'menu', i: j })} />
        ))}
        <Tap onPress={() => setOpen({ kind: 'add' })} accessibilityRole="button" accessibilityLabel="Add photos"
          style={{ width: W, height: H, marginTop: 3, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(20, 400), { color: t.inkMuted, marginTop: -2 }]}>+</Text>
        </Tap>
      </ScrollView>

      <Sheet visible={open?.kind === 'menu'} onClose={close}>
        <Text style={[display(19), { color: t.ink, marginBottom: 4 }]}>Photo {i + 1}{i === 0 ? ' · cover' : ''}</Text>
        <Action text="Make cover" disabled={i === 0} onPress={() => { onMove(i, 0); close(); }} />
        {swapsFor && <Action text="Swap for a similar photo" onPress={() => setOpen({ kind: 'swap', i })} />}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Action text="← Move left" disabled={i <= 0} onPress={() => { onMove(i, i - 1); setOpen({ kind: 'menu', i: i - 1 }); }} /></View>
          <View style={{ flex: 1 }}><Action text="Move right →" disabled={i >= n - 1} onPress={() => { onMove(i, i + 1); setOpen({ kind: 'menu', i: i + 1 }); }} /></View>
        </View>
        <Action text={n <= 1 ? 'Remove (a dump needs one photo)' : 'Remove from dump'} danger disabled={n <= 1} onPress={() => { onRemove(i); close(); }} />
      </Sheet>

      <Sheet visible={open?.kind === 'swap'} onClose={close}>
        <Text style={[display(19), { color: t.ink }]}>Swap photo {i + 1}</Text>
        {open?.kind === 'swap' && swapsFor ? <PickGrid sections={[{ title: 'Similar photos', photos: swapsFor(open.i) }]} empty={empty} onPick={(p) => { onReplace(open.i, p); close(); }} /> : null}
      </Sheet>

      <Sheet visible={open?.kind === 'add'} onClose={close}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[display(19), { color: t.ink }]}>Add photos</Text>
          <Tap onPress={close} accessibilityRole="button" style={{ height: 30, paddingHorizontal: 14, borderRadius: 15, backgroundColor: t.ink, justifyContent: 'center' }}>
            <Text style={[ui(11.5, 600), { color: t.bgScreen }]}>Done</Text>
          </Tap>
        </View>
        {open?.kind === 'add' ? <AddGrid addable={addable} onAdd={onAdd} empty={empty} /> : null}
      </Sheet>
    </View>
  );
}

/** Add sheet body: each tap appends that photo and drops it from the list. */
function AddGrid({ addable, onAdd, empty }: { addable: Props['addable']; onAdd: Props['onAdd']; empty?: string }) {
  const [sections] = useState(addable);
  const [added, setAdded] = useState<Set<string>>(new Set());
  return (
    <PickGrid
      sections={sections.map((s) => ({ ...s, photos: s.photos.filter((p) => !added.has(p.id)) }))}
      onPick={(p) => { setAdded((a) => new Set(a).add(p.id)); onAdd(p); }}
      empty={empty}
    />
  );
}
