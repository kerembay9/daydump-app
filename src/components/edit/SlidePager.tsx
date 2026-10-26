import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, PixelRatio, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Canvas, SkImage } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '../../theme/ThemeProvider';
import { ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Icons } from '../ui/Icons';
import { Pill } from '../ui/Pill';
import { useRevealActive } from '../ui/useRevealActive';
import type { DumpPhoto } from '../../services/dumps';
import { FilterState, lookFor, matrixFor } from '../../services/filters';
import { Crop, Fit, LAYOUTS, LayoutKey, paintOrder, placePhoto, ratioOf, slideCells } from '../../services/layouts';
import { LiveCrop, previewImage, SlideDrawing, SlidePhoto } from '../../services/slides';

export type Slide = { layout: LayoutKey; photos: DumpPhoto[] };

/** One drag / pinch on a photo: its cell and photo size, the crop it started from and is at, fingers down. */
type Drag = { id: string; w: number; h: number; iw: number; ih: number; start: Crop; crop: Crop; tx: number; ty: number; zoom: number; down: number };

/** Canvas never taller than this share of the window, so 9:16 / 4:5 keep their true shape and leave room below. */
const MAX_H = 0.42;

/** Page width / max canvas height (dp) for this window; every ratio's canvas fits inside. */
const pageBox = (win: { width: number; height: number }) => ({ pageW: win.width - 32 - 12 - 2, maxH: Math.round(win.height * MAX_H) }); // gutters, card padding 6, 1px borders

export type Images = Record<string, SkImage | null>;

/** Preview-size Skia images for these photos (canvas and filmstrip share them), filled in as they decode. */
export function usePreviewImages(uris: string[]): Images {
  const { pageW, maxH } = pageBox(useWindowDimensions());
  const px = PixelRatio.get();
  const boxW = pageW * px, boxH = maxH * px;
  const [images, setImages] = useState<Images>({});
  const key = uris.join('|');
  useEffect(() => {
    let live = true;
    for (const u of key.split('|').filter(Boolean)) {
      previewImage(u, boxW, boxH).then((img) => { if (live) setImages((m) => (m[u] === img ? m : { ...m, [u]: img })); });
    }
    return () => { live = false; };
  }, [key, boxW, boxH]);
  return images;
}

type Props = {
  slides: Slide[];
  ratio: string;
  fit: Fit;
  layout: LayoutKey;
  filter: FilterState;
  index: number;
  images: Images;
  onIndex: (i: number) => void;
  onLayout: (l: LayoutKey) => void;
  /** a photo dragged / pinched to a new crop */
  onCrop: (id: string, crop: Crop) => void;
};

/**
 * Canvas card: the slides at their true ratio (tap the left third = previous, the rest = next), n/total, layouts.
 * Dragging / pinching a photo picks the part of it its cell shows, so the pager doesn't swipe: slides change by tap or
 * the filmstrip.
 */
export function SlidePager({ slides, ratio, fit, layout, filter, index, images, onIndex, onLayout, onCrop }: Props) {
  const { t } = useTheme();
  const { pageW, maxH } = pageBox(useWindowDimensions());
  const r = ratioOf(ratio);
  const cw = Math.min(pageW, (maxH * r.w) / r.h);
  const ch = (cw * r.h) / r.w;
  const [badgeW, setBadgeW] = useState(0);
  const layouts = useRevealActive(layout);
  // The gestures run on the UI thread: the crop under the fingers goes to Skia straight from `live` (no React render
  // per frame) and is handed up once every finger lifts.
  const live = useSharedValue<LiveCrop>(null);
  const drag = useSharedValue<Drag | null>(null);
  const list = useRef<FlatList<Slide & { drawn: SlidePhoto[] }>>(null);

  // Keep the pager on the active slide when it changes from outside (filmstrip tap, fewer slides after a layout change).
  useEffect(() => {
    if (index < slides.length) list.current?.scrollToOffset({ offset: index * pageW, animated: true });
  }, [index, slides.length, pageW]);

  const chip = { position: 'absolute', top: 8, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row', alignItems: 'center', gap: 4 } as const;
  const chevron = { position: 'absolute', top: ch / 2 - 11, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', opacity: 0.7 } as const;
  const left = (pageW - cw) / 2;
  const n = slides.length;
  const step = (by: number) => onIndex((index + by + n) % n);

  const pages = useMemo(() => slides.map((s) => ({
    ...s,
    drawn: s.photos.map((p) => ({ id: p.id, image: images[p.uri], matrix: matrixFor(lookFor(filter, p.id)), crop: p.crop })),
  })), [slides, images, filter]);

  // The handed-up crop is in the props now (same picture), so drop the live one unless a new drag has started.
  useEffect(() => {
    if (!drag.get()) live.set(null);
  }, [slides, drag, live]);

  // The active slide's cells in paint order (top-most last), as plain numbers the gesture worklets can hit-test.
  const hits = useMemo(() => {
    const s = slides[index];
    if (!s) return [];
    const { cells } = slideCells(s.layout, fit, cw, ch);
    return paintOrder(s.layout, s.photos.length).map((i) => {
      const c = cells[i], p = s.photos[i], img = images[p.uri];
      return { id: p.id, x: c.x, y: c.y, cw: c.w, ch: c.h, w: c.w - 2 * c.border, h: c.h - 2 * c.border, iw: img?.width() ?? 0, ih: img?.height() ?? 0, crop: p.crop };
    });
  }, [slides, index, images, fit, cw, ch]);

  // Pan and pinch run together (two fingers move and zoom at once); the photo is picked where the first finger lands.
  const begin = (x: number, y: number) => {
    'worklet';
    const d = drag.get();
    if (d) return drag.set({ ...d, down: d.down + 1 });
    let c = null;
    for (const h of hits) if (x >= h.x && x <= h.x + h.cw && y >= h.y && y <= h.y + h.ch) c = h; // tilt ignored (a few degrees)
    if (!c?.iw) return;
    const start = placePhoto(c.w, c.h, c.iw, c.ih, c.crop).crop;
    drag.set({ id: c.id, w: c.w, h: c.h, iw: c.iw, ih: c.ih, start, crop: start, tx: 0, ty: 0, zoom: 1, down: 1 });
  };
  const move = (m: Partial<{ tx: number; ty: number; zoom: number }>) => {
    'worklet';
    const prev = drag.get();
    if (!prev) return;
    const d = { ...prev, ...m };
    const z = d.start.z * d.zoom;
    const { dw, dh } = placePhoto(d.w, d.h, d.iw, d.ih, { ...d.start, z });
    d.crop = placePhoto(d.w, d.h, d.iw, d.ih, { x: d.start.x - d.tx / dw, y: d.start.y - d.ty / dh, z }).crop;
    drag.set(d);
    live.set({ id: d.id, crop: d.crop });
  };
  const end = () => {
    'worklet';
    const d = drag.get();
    if (!d) return;
    if (d.down > 1) return drag.set({ ...d, down: d.down - 1 });
    drag.set(null);
    if (d.tx || d.ty || d.zoom !== 1) scheduleOnRN(onCrop, d.id, d.crop); // a tap (no move) leaves the photo as it was
  };
  const pan = Gesture.Pan().withTestId('crop-pan')
    .onBegin((e) => begin(e.x, e.y)).onUpdate((e) => move({ tx: e.translationX, ty: e.translationY })).onFinalize(end);
  const pinch = Gesture.Pinch().withTestId('crop-pinch')
    .onBegin((e) => begin(e.focalX, e.focalY)).onUpdate((e) => move({ zoom: e.scale })).onFinalize(end);
  const gesture = Gesture.Simultaneous(pan, pinch);

  return (
    <FrameCard radius={18} padding={6} style={{ marginBottom: 8 }}>
      <View style={{ height: ch }}>
        <FlatList
          ref={list}
          data={pages}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          getItemLayout={(_, i) => ({ length: pageW, offset: pageW * i, index: i })}
          windowSize={3}
          initialNumToRender={2}
          onMomentumScrollEnd={(e) => onIndex(Math.round(e.nativeEvent.contentOffset.x / pageW))}
          scrollEnabled={false}
          renderItem={({ item, index: i }) => (
            <View style={{ width: pageW, alignItems: 'center' }}>
              {/* like Stories: the left third goes back, the rest forward (both wrap); swipe is taken by the crop */}
              <Pressable onPress={(e) => step(e.nativeEvent.locationX < cw / 3 ? -1 : 1)}
                accessibilityRole="adjustable" accessibilityLabel={`Slide ${i + 1} of ${n}`}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'decrement' ? -1 : 1)}
                style={{ width: cw, height: ch, borderRadius: 13, overflow: 'hidden' }}>
                {i === index ? (
                  <GestureDetector gesture={gesture}>
                    <Canvas style={{ width: cw, height: ch }}>
                      <SlideDrawing layout={item.layout} fit={fit} width={cw} height={ch} photos={item.drawn} live={live} />
                    </Canvas>
                  </GestureDetector>
                ) : (
                  <Canvas style={{ width: cw, height: ch }}>
                    <SlideDrawing layout={item.layout} fit={fit} width={cw} height={ch} photos={item.drawn} />
                  </Canvas>
                )}
                {/* hairline slide edge: the cream matte otherwise melts into the light-theme card (preview only, not exported) */}
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 13, borderWidth: 1, borderColor: t.borderStrong }} />
                {n > 1 ? (
                  <>
                    <View pointerEvents="none" style={[chevron, { left: 6 }]}><Icons.back size={14} color="#fff" /></View>
                    <View pointerEvents="none" style={[chevron, { right: 6 }]}><Icons.chevron size={14} color="#fff" /></View>
                  </>
                ) : null}
              </Pressable>
            </View>
          )}
        />
        <View pointerEvents="none" style={[chip, { left: left + 8 }]} onLayout={(e) => setBadgeW(e.nativeEvent.layout.width)}>
          <Icons.crop size={10} color="#fff" />
          <Text style={[ui(9.5, 600), { color: '#fff' }]}>{n > 1 ? 'Tap sides · drag to crop' : 'Drag or pinch a photo'}</Text>
        </View>
        {/* the counter drops to the bottom only when it would hit the badge (9:16) */}
        <View pointerEvents="none" style={[chip, { right: left + 8 }, badgeW + 56 > cw ? { top: undefined, bottom: 8 } : null]}>
          <Text style={[ui(9.5, 600), { color: '#fff' }]}>{Math.min(index + 1, slides.length)}/{slides.length}</Text>
        </View>
      </View>

      <View style={{ paddingTop: 6, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingVertical: 4, paddingRight: 4 }} {...layouts.scroll}>
          {LAYOUTS.map((l) => (
            <View key={l.key} onLayout={layouts.item(l.key)}>
              <Pill height={24} size={9.5} label={l.label} on={layout === l.key} onPress={() => onLayout(l.key)} />
            </View>
          ))}
        </ScrollView>
      </View>
    </FrameCard>
  );
}
