import React, { useEffect, useState } from 'react';
import { ScrollView as RNScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Canvas, ColorMatrix, Image as SkiaImage, SkImage } from '@shopify/react-native-skia';
import { useTheme } from '../../theme/ThemeProvider';
import { fixed } from '../../theme/tokens';
import { caps, display, label, ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Tap } from '../ui/Tap';
import { Icons } from '../ui/Icons';
import { Sheet } from '../ui/Sheet';
import type { DumpPhoto } from '../../services/dumps';
import { developFor, editedOwn, FilterState } from '../../services/filters';
import { tr } from '../../i18n';

const W = 46, H = 50, GAP = 6, SLOT = W + GAP;
/** The tapped photo's size, and the held one's while it's dragged (it also rises by RISE). */
export const PICKED = 1.12, HELD = 1.35;
const RISE = 8;
// room so the held, grown photo isn't clipped by the scroll view; the strip's negative margin keeps the layout as it was
const ROOM_X = Math.ceil((W * HELD - W) / 2), ROOM_TOP = Math.ceil((H * HELD - H) / 2 + RISE);
const pop = { dampingRatio: 0.55, duration: 400 }; // one overshoot so the photo visibly pops up, then it settles (Reanimated 4 defaults mass to 4, so damping/stiffness alone wobbled)
const buzz = () => { Haptics.selectionAsync().catch(() => {}); };

/** The drag in progress, shared by every thumb: the held photo's index and the slot it would land in. */
type Drag = { on: boolean; from: number; to: number };
type ThumbProps = { p: DumpPhoto; i: number; n: number; drag: SharedValue<Drag>; active: boolean; selected: boolean; image?: SkImage | null; matrix: number[] | null; own: boolean; onTap: (i: number) => void; onHold: (i: number) => void; onMove: (from: number, to: number) => void };

/** Where photo k sits while `from` is held over slot `to`: the ones in between step aside into the freed slot. */
export const slotOf = (k: number, { from, to }: Drag) => {
  'worklet';
  if (k === from) return to;
  if (from < k && k <= to) return k - 1;
  if (to <= k && k < from) return k + 1;
  return k;
};

/**
 * Tap = select; hold = photo menu; hold and drag = move it. Thumbs sit at absolute x = slot · SLOT, so while one is
 * dragged the others glide to where they'll end up, and after the drop the reorder lands on what's already drawn.
 */
function Thumb({ p, i, n, drag, active, selected, image, matrix, own, onTap, onHold, onMove }: ThumbProps) {
  const x = useSharedValue(i * SLOT), tx = useSharedValue(0);
  const lifted = useSharedValue(0), picked = useSharedValue(selected ? 1 : 0);
  useEffect(() => { picked.set(withSpring(selected ? 1 : 0, pop)); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { x.set(withTiming(i * SLOT, { duration: 200 })); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  // someone else is held: glide to the slot that leaves room for it
  useAnimatedReaction(() => drag.get(), (d) => {
    if (d.on && d.from !== i) x.set(withTiming(slotOf(i, d) * SLOT, { duration: 160 }));
  });
  const pan = Gesture.Pan()
    .withTestId(`strip-hold-${p.id}`)
    .activateAfterLongPress(300) // the drag runs on the UI thread; JS only hears about the drop
    .onStart(() => { lifted.set(withSpring(1, pop)); drag.set({ on: true, from: i, to: i }); scheduleOnRN(buzz); })
    .onUpdate((e) => {
      tx.set(Math.max(-i * SLOT, Math.min((n - 1 - i) * SLOT, e.translationX)));
      const to = i + Math.round(tx.get() / SLOT);
      if (to !== drag.get().to) { drag.set({ on: true, from: i, to }); scheduleOnRN(buzz); }
    })
    .onEnd((e, ok) => {
      const to = ok ? drag.get().to : i;
      if (ok && Math.abs(e.translationX) < 10) scheduleOnRN(onHold, i);
      else if (to !== i) scheduleOnRN(onMove, i, to);
      if (to === i) drag.set({ on: true, from: i, to: i }); // no move: the others go back
      // drop into the slot; the others stay where they are, which is where the reorder puts them
      x.set(i * SLOT + tx.get());
      tx.set(0);
      x.set(withTiming(to * SLOT, { duration: 160 }));
    })
    .onFinalize(() => { drag.set({ on: false, from: -1, to: -1 }); lifted.set(withTiming(0, { duration: 160 })); });
  const tap = Gesture.Tap().withTestId(`strip-tap-${p.id}`).runOnJS(true).onEnd((_e, ok) => { if (ok) onTap(i); });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() + tx.get() }, { translateY: -RISE * lifted.get() }, { scale: Math.max(1 + (PICKED - 1) * picked.get(), 1 + (HELD - 1) * lifted.get()) }],
    zIndex: lifted.get() > 0.01 ? 10 : picked.get() > 0.01 ? 1 : 0,
  }));
  const { t } = useTheme();
  const cover = i === 0;
  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View accessible accessibilityRole="button" accessibilityLabel={tr('edit.filmstripPhotoA11y', { index: i + 1, cover: cover ? tr('edit.coverSuffix') : '', edited: own ? tr('edit.editedSuffix') : '' })}
        style={[{ position: 'absolute', left: 0, top: 0, width: W, height: H, borderRadius: 10, marginTop: 3 },
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
        {/* has edits of its own (Photos tab: a look of its own, or Adjust) */}
        {own ? <View style={{ position: 'absolute', right: 3, top: 3, width: 7, height: 7, borderRadius: 4, backgroundColor: fixed.printBorder, borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)' }} /> : null}
        <View style={{ position: 'absolute', left: 2, bottom: 2, paddingHorizontal: 4, borderRadius: 7, backgroundColor: cover ? fixed.printBorder : 'rgba(0,0,0,0.65)', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={[ui(8.5, 700), { color: cover ? '#2B1810' : '#fff' }]}>{cover ? '★ 1' : `#${i + 1}`}</Text>
          {/* ✧ icon, not the ✨ emoji (decision #10), as in Create */}
          {p.suggested ? <Icons.sparkle size={8} color={cover ? '#2B1810' : '#fff'} /> : null}
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

/** Grid of photos to pick from, in sections. */
function PickGrid({ sections, onPick }: { sections: { title: string; photos: DumpPhoto[] }[]; onPick: (p: DumpPhoto) => void }) {
  const { t } = useTheme();
  const win = useWindowDimensions();
  const size = (win.width - 32 - 3 * 6) / 4;
  const any = sections.some((s) => s.photos.length);
  return (
    <RNScrollView style={{ maxHeight: win.height * 0.55 }} contentContainerStyle={{ gap: 12 }}>
      {!any ? <Text style={[ui(12, 500), { color: t.inkMuted }]}>{tr('edit.noSuggestedPhotos')}</Text> : null}
      {sections.filter((s) => s.photos.length).map((s) => (
        <View key={s.title} style={{ gap: 6 }}>
          <Text style={[label(9.5, 0.11), { color: t.inkMuted }]}>{caps(s.title)}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {s.photos.map((p) => (
              <Tap key={p.id} onPress={() => onPick(p)} accessibilityRole="button" accessibilityLabel={tr('edit.useThisPhoto')} style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', backgroundColor: t.borderStrong }}>
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
  swapsFor: (i: number) => DumpPhoto[];
  addable: () => { title: string; photos: DumpPhoto[] }[];
};

type Open = { kind: 'menu' | 'swap'; i: number } | { kind: 'add' } | null;

/** DUMP ORDER filmstrip: tap = select (tap the selected one again = make it the cover), hold = menu, hold + drag = move, + = add. */
export function Filmstrip({ photos, active, selected, images, filter, onTap, onMove, onRemove, onReplace, onAdd, swapsFor, addable }: Props) {
  const { t } = useTheme();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const n = photos.length;
  const i = open && open.kind !== 'add' ? open.i : -1;
  const drag = useSharedValue<Drag>({ on: false, from: -1, to: -1 });

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingHorizontal: 2 }}>
        <Text style={[label(9.5, 0.11), { color: t.inkMuted }]}>{caps(tr('edit.dumpOrder'))}</Text>
        <Text style={[ui(10, 400), { color: t.inkMuted }]}>{tr('edit.holdToEdit')}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: -ROOM_TOP, marginHorizontal: -ROOM_X }}
        contentContainerStyle={{ gap: GAP, paddingTop: ROOM_TOP, paddingBottom: 6, paddingHorizontal: 2 + ROOM_X }}>
        <View style={{ width: n * SLOT - GAP, height: H + 3 }}>
          {photos.map((p, k) => (
            <Thumb key={p.id} p={p} i={k} n={n} drag={drag} active={active.has(p.id)} selected={selected === p.id && active.has(p.id)}
              image={images[p.uri]} matrix={developFor(filter, p.id).matrix} own={editedOwn(filter, p.id)} onTap={onTap} onMove={onMove} onHold={(j) => setOpen({ kind: 'menu', i: j })} />
          ))}
        </View>
        <Tap onPress={() => setOpen({ kind: 'add' })} accessibilityRole="button" accessibilityLabel={tr('edit.addPhotos')}
          style={{ width: W, height: H, marginTop: 3, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[ui(20, 400), { color: t.inkMuted, marginTop: -2 }]}>+</Text>
        </Tap>
      </ScrollView>

      <Sheet visible={open?.kind === 'menu'} onClose={close}>
        <Text style={[display(19), { color: t.ink, marginBottom: 4 }]}>{tr('edit.photoMenuTitle', { index: i + 1, cover: i === 0 ? tr('edit.coverSuffixDot') : '' })}</Text>
        <Action text={tr('edit.makeCover')} disabled={i === 0} onPress={() => { onMove(i, 0); close(); }} />
        <Action text={tr('edit.swapSimilar')} onPress={() => setOpen({ kind: 'swap', i })} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Action text={tr('edit.moveLeft')} disabled={i <= 0} onPress={() => { onMove(i, i - 1); setOpen({ kind: 'menu', i: i - 1 }); }} /></View>
          <View style={{ flex: 1 }}><Action text={tr('edit.moveRight')} disabled={i >= n - 1} onPress={() => { onMove(i, i + 1); setOpen({ kind: 'menu', i: i + 1 }); }} /></View>
        </View>
        <Action text={n <= 1 ? tr('edit.removeNeedsOne') : tr('edit.removeFromDump')} danger disabled={n <= 1} onPress={() => { onRemove(i); close(); }} />
      </Sheet>

      <Sheet visible={open?.kind === 'swap'} onClose={close}>
        <Text style={[display(19), { color: t.ink }]}>{tr('edit.swapPhotoTitle', { index: i + 1 })}</Text>
        {open?.kind === 'swap' ? <PickGrid sections={[{ title: tr('edit.similarPhotos'), photos: swapsFor(open.i) }]} onPick={(p) => { onReplace(open.i, p); close(); }} /> : null}
      </Sheet>

      <Sheet visible={open?.kind === 'add'} onClose={close}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[display(19), { color: t.ink }]}>{tr('edit.addPhotos')}</Text>
          <Tap onPress={close} accessibilityRole="button" style={{ height: 30, paddingHorizontal: 14, borderRadius: 15, backgroundColor: t.ink, justifyContent: 'center' }}>
            <Text style={[ui(11.5, 600), { color: t.bgScreen }]}>{tr('common.done')}</Text>
          </Tap>
        </View>
        {open?.kind === 'add' ? <AddGrid addable={addable} onAdd={onAdd} /> : null}
      </Sheet>
    </View>
  );
}

/** Add sheet body: each tap appends that photo and drops it from the list. */
function AddGrid({ addable, onAdd }: { addable: Props['addable']; onAdd: Props['onAdd'] }) {
  const [sections] = useState(addable);
  const [added, setAdded] = useState<Set<string>>(new Set());
  return (
    <PickGrid
      sections={sections.map((s) => ({ ...s, photos: s.photos.filter((p) => !added.has(p.id)) }))}
      onPick={(p) => { setAdded((a) => new Set(a).add(p.id)); onAdd(p); }}
    />
  );
}
