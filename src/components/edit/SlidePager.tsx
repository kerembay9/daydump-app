import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, PixelRatio, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Canvas, SkImage } from '@shopify/react-native-skia';
import { useTheme } from '../../theme/ThemeProvider';
import { ui } from '../../theme/type';
import { FrameCard } from '../ui/FrameCard';
import { Icons } from '../ui/Icons';
import { Pill } from '../ui/Pill';
import { useRevealActive } from '../ui/useRevealActive';
import type { DumpPhoto } from '../../services/dumps';
import { FilterState, lookFor, matrixFor, presetOf } from '../../services/filters';
import { Fit, LAYOUTS, LayoutKey, ratioOf } from '../../services/layouts';
import { previewImage, SlideDrawing, SlidePhoto } from '../../services/slides';

export type Slide = { layout: LayoutKey; photos: DumpPhoto[] };

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
  onFit: (f: Fit) => void;
  onLayout: (l: LayoutKey) => void;
};

/** Canvas card: the slides at their true ratio, paged sideways (tap = next), size/filter badge, n/total, Bleed|Border, layouts. */
export function SlidePager({ slides, ratio, fit, layout, filter, index, images, onIndex, onFit, onLayout }: Props) {
  const { t } = useTheme();
  const { pageW, maxH } = pageBox(useWindowDimensions());
  const r = ratioOf(ratio);
  const cw = Math.min(pageW, (maxH * r.w) / r.h);
  const ch = (cw * r.h) / r.w;
  const [badgeW, setBadgeW] = useState(0);
  const layouts = useRevealActive(layout);
  const list = useRef<FlatList<Slide & { drawn: SlidePhoto[] }>>(null);

  // Keep the pager on the active slide when it changes from outside (filmstrip tap, fewer slides after a layout change).
  useEffect(() => {
    if (index < slides.length) list.current?.scrollToOffset({ offset: index * pageW, animated: true });
  }, [index, slides.length, pageW]);

  const activeLook = slides[index]?.photos[0] ? lookFor(filter, slides[index].photos[0].id) : filter;
  const badge = `${r.key} · ${presetOf(activeLook.key).label}${activeLook.key !== 'none' ? ` ${activeLook.pct}%` : ''}`;
  const chip = { position: 'absolute', top: 8, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row', alignItems: 'center', gap: 4 } as const;
  const left = (pageW - cw) / 2;

  const pages = useMemo(() => slides.map((s) => ({
    ...s,
    drawn: s.photos.map((p) => ({ image: images[p.uri], matrix: matrixFor(lookFor(filter, p.id)) })),
  })), [slides, images, filter]);

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
          renderItem={({ item }) => (
            <View style={{ width: pageW, alignItems: 'center' }}>
              <Pressable onPress={() => onIndex((index + 1) % slides.length)} accessibilityLabel="Next slide"
                style={{ width: cw, height: ch, borderRadius: 13, overflow: 'hidden' }}>
                <Canvas style={{ width: cw, height: ch }}>
                  <SlideDrawing layout={item.layout} fit={fit} width={cw} height={ch} photos={item.drawn} />
                </Canvas>
                {/* hairline slide edge: the cream matte otherwise melts into the light-theme card (preview only, not exported) */}
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 13, borderWidth: 1, borderColor: t.borderStrong }} />
              </Pressable>
            </View>
          )}
        />
        <View pointerEvents="none" style={[chip, { left: left + 8 }]} onLayout={(e) => setBadgeW(e.nativeEvent.layout.width)}>
          <Icons.crop size={10} color="#fff" />
          <Text style={[ui(9.5, 600), { color: '#fff' }]}>{badge}</Text>
        </View>
        {/* the counter drops to the bottom only when it would hit the badge (9:16 with a long preset name) */}
        <View pointerEvents="none" style={[chip, { right: left + 8 }, badgeW + 56 > cw ? { top: undefined, bottom: 8 } : null]}>
          <Text style={[ui(9.5, 600), { color: '#fff' }]}>{Math.min(index + 1, slides.length)}/{slides.length}</Text>
        </View>
      </View>

      <View style={{ paddingTop: 6, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ flexDirection: 'row', padding: 2, gap: 2, borderRadius: 14, backgroundColor: t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}>
          {(['bleed', 'border'] as const).map((f) => (
            <Pill key={f} variant="plain" height={22} size={9.5} label={f === 'bleed' ? 'Bleed' : 'Border'} on={fit === f} onPress={() => onFit(f)} />
          ))}
        </View>
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
